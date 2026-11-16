// Provider-independent live stream context.
//
// Manages live stream state without depending on any specific streaming
// provider (LiveKit, Agora, self-hosted, etc.). The actual media transport
// (WebRTC, RTMP, HLS, etc.) is intentionally NOT implemented here - the
// provider comparison in do1.md §2 must complete first.
//
// What this layer provides:
//   - Stream session lifecycle: start, end, toggle recording
//   - Stream metadata: title, type (video/audio), audience, status
//   - Participant roles: host, moderator, guest, viewer
//   - Real-time signaling via the existing SSE hub (/api/realtime)
//   - Integration with the existing audience/privacy system
//
// The streaming provider (LiveKit/Agora/etc.) is integrated later by
// implementing the media transport behind this same state model.

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  createLiveStream,
  getLiveStream,
  getActiveLiveStreams,
  endLiveStream,
  updateLiveStream,
  getStreamParticipants,
  addStreamParticipant,
  updateStreamParticipant,
  removeStreamParticipant,
  type LiveStream,
  type LiveStreamParticipant,
  type CreateLiveStreamData,
} from '@/api/liveStreams';

export type StreamRole = 'host' | 'moderator' | 'guest' | 'viewer';
export type StreamType = 'video' | 'audio';

export interface LiveStreamState {
  stream: LiveStream | null;
  participants: LiveStreamParticipant[];
  isHost: boolean;
  isConnected: boolean;
  localStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  viewerCount: number;
  error: string | null;
}

export interface LiveStreamContextType extends LiveStreamState {
  startStream: (data: CreateLiveStreamData) => Promise<void>;
  endStream: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  joinStream: (streamId: string) => Promise<void>;
  leaveStream: () => Promise<void>;
  addParticipant: (userId: string, role: 'moderator' | 'guest' | 'viewer') => Promise<void>;
  removeParticipant: (userId: string) => Promise<void>;
  updateParticipantRole: (userId: string, role: StreamRole) => Promise<void>;
  getActiveStreams: () => Promise<void>;
}

const LiveStreamContext = createContext<LiveStreamContextType | undefined>(undefined);

export const LiveStreamProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [state, setState] = useState<LiveStreamState>({
    stream: null,
    participants: [],
    isHost: false,
    isConnected: false,
    localStream: null,
    isMuted: false,
    isVideoOff: false,
    viewerCount: 0,
    error: null,
  });

  const streamRef = useRef<LiveStream | null>(null);
  const signalingRef = useRef<EventSource | null>(null);
  const viewerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get active live streams
  const getActiveStreams = useCallback(async () => {
    try {
      const { data, error } = await getActiveLiveStreams();
      if (error) throw error;
      setState((prev) => ({ ...prev, error: null }));
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load active streams';
      setState((prev) => ({ ...prev, error: message }));
      toast({ title: 'Error', description: message, variant: 'destructive' });
      return [];
    }
  }, [toast]);

  // Start a new live stream
  const startStream = useCallback(
    async (data: CreateLiveStreamData) => {
      if (!user) throw new Error('Authentication required');

      try {
        setState((prev) => ({ ...prev, error: null }));

        const { data: stream, error } = await createLiveStream({
          ...data,
          host_id: user.id,
          status: 'live',
          started_at: new Date().toISOString(),
          viewer_count: 0,
        });

        if (error) throw error;

        const newStream: LiveStream = stream;
        streamRef.current = newStream;

        setState((prev) => ({
          ...prev,
          stream: newStream,
          isHost: true,
          isConnected: true,
          viewerCount: 1,
          participants: [
            {
              id: `${newStream.id}-${user.id}`,
              stream_id: newStream.id,
              user_id: user.id,
              role: 'host',
              joined_at: new Date().toISOString(),
              left_at: null,
              is_muted: data.stream_type === 'audio',
              is_video_off: data.stream_type === 'audio',
            },
          ],
        }));

        // Start SSE signaling for this stream
        setupStreamSignaling(newStream.id);

        toast({
          title: 'Live stream started',
          description: `Your ${data.stream_type} stream is now live`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start stream';
        setState((prev) => ({ ...prev, error: message }));
        toast({ title: 'Error', description: message, variant: 'destructive' });
        throw err;
      }
    },
    [user, toast]
  );

  // End the current stream
  const endStream = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      // Stop SSE signaling
      teardownStreamSignaling();

      // Update stream status to ended
      await endLiveStream(streamRef.current.id);

      setState((prev) => ({
        ...prev,
        stream: prev.stream
          ? { ...prev.stream, status: 'ended', ended_at: new Date().toISOString() }
          : null,
        isHost: false,
        isConnected: false,
        localStream: null,
        participants: [],
        viewerCount: 0,
      }));

      // Stop local media
      if (state.localStream) {
        state.localStream.getTracks().forEach((track) => track.stop());
        setState((prev) => ({ ...prev, localStream: null }));
      }

      toast({ title: 'Stream ended', description: 'Your live stream has ended' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end stream';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [streamRef.current, state.localStream, toast]);

  // Toggle recording
  const toggleRecording = useCallback(async () => {
    if (!streamRef.current || !state.isHost) return;

    try {
      const newRecording = !state.stream?.recording;
      await updateLiveStream(streamRef.current.id, { recording: newRecording });

      setState((prev) => ({
        ...prev,
        stream: prev.stream ? { ...prev.stream, recording: newRecording } : null,
      }));

      toast({
        title: newRecording ? 'Recording started' : 'Recording stopped',
        description: newRecording
          ? 'Your stream is being recorded'
          : 'Recording has stopped',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle recording';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [streamRef.current, state.isHost, state.stream?.recording, toast]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setState((prev) => {
      const newMuted = !prev.isMuted;
      if (prev.localStream) {
        prev.localStream.getAudioTracks().forEach((track) => {
          track.enabled = !newMuted;
        });
      }
      return { ...prev, isMuted: newMuted };
    });
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    setState((prev) => {
      const newVideoOff = !prev.isVideoOff;
      if (prev.localStream) {
        prev.localStream.getVideoTracks().forEach((track) => {
          track.enabled = !newVideoOff;
        });
      }
      return { ...prev, isVideoOff: newVideoOff };
    });
  }, []);

  // Join an existing stream as a viewer/guest
  const joinStream = useCallback(async (streamId: string) => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      const { data: stream, error } = await getLiveStream(streamId);
      if (error) throw error;

      streamRef.current = stream;

      setState((prev) => ({
        ...prev,
        stream,
        isHost: stream.host_id === user?.id,
        isConnected: true,
        viewerCount: (stream.viewer_count || 0) + 1,
      }));

      // Join as viewer (or host if owner)
      const role = stream.host_id === user?.id ? 'host' : 'viewer';
      await addStreamParticipant(streamId, user!.id, role);

      setState((prev) => ({
        ...prev,
        participants: [
          ...prev.participants,
          {
            id: `${streamId}-${user!.id}`,
            stream_id: streamId,
            user_id: user!.id,
            role,
            joined_at: new Date().toISOString(),
            left_at: null,
            is_muted: true,
            is_video_off: true,
          },
        ],
      }));

      // Start SSE signaling
      setupStreamSignaling(streamId);

      toast({ title: 'Joined stream', description: 'You are now watching the live stream' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join stream';
      setState((prev) => ({ ...prev, error: message }));
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [user]);

  // Leave the current stream
  const leaveStream = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      teardownStreamSignaling();

      if (state.isHost) {
        await endLiveStream(streamRef.current.id);
      } else {
        await removeStreamParticipant(streamRef.current.id, user!.id);
      }

      setState((prev) => ({
        ...prev,
        stream: null,
        isHost: false,
        isConnected: false,
        localStream: null,
        participants: [],
        viewerCount: 0,
      }));

      toast({ title: 'Left stream', description: 'You have left the live stream' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to leave stream';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [streamRef.current, state.isHost, user]);

  // Add a participant (host/moderator only)
  const addParticipant = useCallback(
    async (userId: string, role: 'moderator' | 'guest' | 'viewer') => {
      if (!streamRef.current || !state.isHost) return;

      try {
        const { data, error } = await addStreamParticipant(streamRef.current.id, userId, role);
        if (error) throw error;

        setState((prev) => ({
          ...prev,
          participants: [
            ...prev.participants.filter((p) => p.user_id !== userId),
            {
              id: `${streamRef.current!.id}-${userId}`,
              stream_id: streamRef.current.id,
              user_id: userId,
              role,
              joined_at: new Date().toISOString(),
              left_at: null,
              is_muted: true,
              is_video_off: true,
            },
          ],
        }));

        toast({ title: 'Participant added', description: `${userId} joined as ${role}` });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add participant';
        toast({ title: 'Error', description: message, variant: 'destructive' });
      }
    },
    [streamRef.current, state.isHost, toast]
  );

  // Remove a participant (host/moderator only)
  const removeParticipant = useCallback(
    async (userId: string) => {
      if (!streamRef.current || !state.isHost) return;

      try {
        await removeStreamParticipant(streamRef.current.id, userId);

        setState((prev) => ({
          ...prev,
          participants: prev.participants.filter((p) => p.user_id !== userId),
        }));

        toast({ title: 'Participant removed' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove participant';
        toast({ title: 'Error', description: message, variant: 'destructive' });
      }
    },
    [streamRef.current, state.isHost, toast]
  );

  // Update participant role (host only)
  const updateParticipantRole = useCallback(
    async (userId: string, role: StreamRole) => {
      if (!streamRef.current || !state.isHost) return;

      try {
        await updateStreamParticipant(streamRef.current.id, userId, { role });

        setState((prev) => ({
          ...prev,
          participants: prev.participants.map((p) =>
            p.user_id === userId ? { ...p, role } : p
          ),
        }));

        toast({ title: 'Role updated', description: `${userId} is now a ${role}` });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update role';
        toast({ title: 'Error', description: message, variant: 'destructive' });
      }
    },
    [streamRef.current, state.isHost, toast]
  );

  // SSE signaling for stream events
  const setupStreamSignaling = useCallback((streamId: string) => {
    if (!user) return;

    const channel = `calls:${user.id}`;
    const es = new EventSource(
      `${import.meta.env.VITE_API_GATEWAY_URL}/api/realtime/subscribe/${channel}`,
      { withCredentials: true }
    );

    es.onopen = () => {
      signalingRef.current = es;
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.stream_id !== streamId) return;

        switch (data.event) {
          case 'stream_ended':
            setState((prev) => ({
              ...prev,
              stream: prev.stream
                ? { ...prev.stream, status: 'ended', ended_at: data.ended_at }
                : null,
              isConnected: false,
            }));
            break;
          case 'viewer_joined':
            setState((prev) => ({
              ...prev,
              viewerCount: prev.viewerCount + 1,
            }));
            break;
          case 'viewer_left':
            setState((prev) => ({
              ...prev,
              viewerCount: Math.max(0, prev.viewerCount - 1),
            }));
            break;
          case 'recording_toggled':
            setState((prev) => ({
              ...prev,
              stream: prev.stream
                ? { ...prev.stream, recording: data.recording }
                : null,
            }));
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    es.onerror = () => {
      es.close();
      signalingRef.current = null;
    };
  }, [user]);

  const teardownStreamSignaling = useCallback(() => {
    if (signalingRef.current) {
      signalingRef.current.close();
      signalingRef.current = null;
    }
    if (viewerIntervalRef.current) {
      clearInterval(viewerIntervalRef.current);
      viewerIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      teardownStreamSignaling();
    };
  }, [teardownStreamSignaling]);

  const value: LiveStreamContextType = {
    ...state,
    startStream,
    endStream,
    toggleRecording,
    toggleMute,
    toggleVideo,
    joinStream,
    leaveStream,
    addParticipant,
    removeParticipant,
    updateParticipantRole,
    getActiveStreams,
  };

  return (
    <LiveStreamContext.Provider value={value}>
      {children}
    </LiveStreamContext.Provider>
  );
};

export const useLiveStream = (): LiveStreamContextType => {
  const context = useContext(LiveStreamContext);
  if (!context) {
    throw new Error('useLiveStream must be used within a LiveStreamProvider');
  }
  return context;
};
