// Tone Live — WebRTC media transport integrated into the existing Tone app.
//
// Implements the live session media transport behind the same state model:
//   - Stream session lifecycle: start, end, toggle recording
//   - Stream metadata: title, type (video/audio), audience, status
//   - Participant roles: host, moderator, guest, viewer
//   - WebRTC peer connection + media track publication/subscription
//   - Signaling via the Gateway's /api/live/sessions/:id/signaling SSE endpoint
//   - Integration with the existing audience/privacy system
//
// No LiveKit, Agora, or mediasoup — Tone's own custom streaming engine.

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
import { webrtcService } from '@/services/webrtc';
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
  type LiveSession,
  type LiveParticipant,
  type CreateSessionData,
} from '@/api/liveStreams';

export type StreamRole = 'host' | 'moderator' | 'guest' | 'viewer';
export type StreamType = 'video' | 'audio';

export interface LiveStreamState {
  stream: LiveSession | null;
  participants: LiveParticipant[];
  isHost: boolean;
  isConnected: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  viewerCount: number;
  error: string | null;
  connectionState: RTCPeerConnectionState | null;
}

export interface LiveStreamContextType extends LiveStreamState {
  startStream: (data: CreateSessionData) => Promise<LiveSession | null>;
  endStream: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  initMedia: (streamType: StreamType) => Promise<MediaStream>;
  joinStream: (streamId: string) => Promise<void>;
  leaveStream: () => Promise<void>;
  addParticipant: (userId: string, role: 'moderator' | 'guest' | 'viewer') => Promise<void>;
  removeParticipant: (userId: string) => Promise<void>;
  updateParticipantRole: (userId: string, role: StreamRole) => Promise<void>;
  getActiveStreams: () => Promise<LiveSession[]>;
  createOffer: () => Promise<string>;
  handleOffer: (sdp: string, fromUserId: string) => Promise<string>;
  handleAnswer: (sdp: string) => Promise<void>;
  addIceCandidate: (candidate: any) => Promise<void>;
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
    remoteStream: null,
    isMuted: false,
    isVideoOff: false,
    viewerCount: 0,
    error: null,
    connectionState: null,
  });

  const streamRef = useRef<LiveSession | null>(null);
  const signalingRef = useRef<EventSource | null>(null);
  const webrtcInitializedRef = useRef<boolean>(false);
  const mediaInitAttemptedRef = useRef(false);

  // Set up WebRTC callbacks once
  useEffect(() => {
    webrtcService.setOnRemoteStream((stream) => {
      setState((prev) => ({ ...prev, remoteStream: stream }));
    });

    webrtcService.setOnIceCandidate(async (candidate) => {
      // ICE candidates are sent via the signaling channel by the caller
    });

    webrtcService.setOnConnectionStateChange((state) => {
      setState((prev) => ({ ...prev, connectionState: state }));
    });

    return () => {
      webrtcService.setOnRemoteStream(null);
      webrtcService.setOnIceCandidate(null);
      webrtcService.setOnConnectionStateChange(null);
    };
  }, []);

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

  // Initialize local media (camera/microphone)
  const initMedia = useCallback(async (streamType: StreamType): Promise<MediaStream> => {
    // Prevent duplicate getUserMedia() calls
    if (mediaInitAttemptedRef.current) {
      return state.localStream!;
    }
    mediaInitAttemptedRef.current = true;

    const isAudioOnly = streamType === 'audio';

    try {
      const stream = await webrtcService.getLocalStream(isAudioOnly ? 'voice' : 'video');

      setState((prev) => ({
        ...prev,
        localStream: stream,
        isMuted: isAudioOnly,
        isVideoOff: isAudioOnly,
      }));

      webrtcInitializedRef.current = true;
      return stream;
    } catch (err) {
      const error = err as Error;

      // Release any partially acquired tracks
      if (state.localStream) {
        state.localStream.getTracks().forEach((track) => {
          track.stop();
        });
        setState((prev) => ({ ...prev, localStream: null }));
      }

      // If video mode fails, try audio-only fallback
      if (!isAudioOnly) {
        console.warn('[LiveStreamContext] Video init failed, trying audio-only fallback:', error.name);
        try {
          const audioStream = await webrtcService.getLocalStream('voice');

          setState((prev) => ({
            ...prev,
            localStream: audioStream,
            isMuted: false,
            isVideoOff: true,
          }));

          webrtcInitializedRef.current = true;
          toast({
            title: 'Video unavailable, audio-only mode',
            description: 'Camera access failed. Stream started in audio-only mode.',
            variant: 'default',
          });
          return audioStream;
        } catch (audioErr) {
          throw audioErr as Error;
        }
      }

      throw error;
    }
  }, [state.localStream, toast]);

  // Start a new live stream
  const startStream = useCallback(
    async (data: CreateSessionData) => {
      if (!user) throw new Error('Authentication required');

      try {
        setState((prev) => ({ ...prev, error: null }));

        // Create the stream session first (API call), then initialize media.
        // Media init (getUserMedia) can fail in headless environments and
        // should not block session creation.
        const { data: stream, error } = await createLiveStream({
          ...data,
          host_id: user.id,
          status: 'live' as any,
          started_at: new Date().toISOString(),
          viewer_count: 0,
        } as unknown as CreateSessionData);

        if (error) throw error;

        const newStream: LiveSession = stream;
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
              session_id: newStream.id,
              user_id: user.id,
              role: 'host',
              joined_at: new Date().toISOString(),
              left_at: null,
              is_muted: data.stream_type === 'audio',
              is_video_off: data.stream_type === 'audio',
            },
          ],
        }));

        // Initialize local media after session is created. If this fails
        // (e.g. no camera/mic, permission denied), the stream still exists
        // and the user can still join as a viewer.
        try {
          await initMedia(data.stream_type);
        } catch (mediaErr) {
          console.warn('Media init failed, stream created without local media:', mediaErr);
          toast({
            title: 'Stream started',
            description: 'Stream created but camera/microphone access was denied',
            variant: 'default',
          });
        }

        toast({
          title: 'Live stream started',
          description: `Your ${data.stream_type} stream is now live`,
        });

        return newStream;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start stream';
        console.error('[LiveStream] startStream failed:', err);
        setState((prev) => ({ ...prev, error: message }));
        toast({ title: 'Error', description: message, variant: 'destructive' });
        throw err;
      }
    },
    [user, toast, initMedia, createLiveStream]
  );

  // End the current stream
  const endStream = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      // Stop WebRTC
      webrtcService.cleanup();
      webrtcInitializedRef.current = false;

      if (signalingRef.current) {
        signalingRef.current.close();
        signalingRef.current = null;
      }

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
        remoteStream: null,
        participants: [],
        viewerCount: 0,
        connectionState: null,
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

  // Create a WebRTC offer (host initiates)
  const createOffer = useCallback(async (): Promise<string> => {
    if (!webrtcInitializedRef.current || !state.localStream) {
      throw new Error('Local media not initialized');
    }

    const offer = await webrtcService.createOffer();
    return offer.sdp!;
  }, [state.localStream]);

  // Handle an incoming WebRTC offer: set remote description and create answer
  const handleOffer = useCallback(async (sdp: string, fromUserId: string) => {
    await webrtcService.setRemoteDescription({
      type: 'offer',
      sdp,
    } as RTCSessionDescriptionInit);

    const answer = await webrtcService.createAnswer();
    return answer.sdp!;
  }, []);

  // Handle an incoming WebRTC answer
  const handleAnswer = useCallback(async (sdp: string) => {
    await webrtcService.setRemoteDescription({
      type: 'answer',
      sdp,
    } as RTCSessionDescriptionInit);
  }, []);

  // Add an ICE candidate
  const addIceCandidate = useCallback(async (candidate: any) => {
    await webrtcService.addIceCandidate(candidate);
  }, []);

  // Join an existing stream as a viewer/guest
  const joinStream = useCallback(async (streamId: string) => {
    if (!user) throw new Error('Authentication required');

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

      // Join as viewer (or host if owner). Hosts are already added as a
      // participant when the stream is created; viewers join via the API.
      if (stream.host_id !== user?.id) {
        await addStreamParticipant(streamId, user!.id, 'viewer');
      }

      setState((prev) => ({
        ...prev,
        participants: [
          ...prev.participants,
          {
            id: `${streamId}-${user!.id}`,
            session_id: streamId,
            user_id: user!.id,
            role: stream.host_id === user?.id ? 'host' : 'viewer',
            joined_at: new Date().toISOString(),
            left_at: null,
            is_muted: true,
            is_video_off: true,
          },
        ],
      }));

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
      webrtcService.cleanup();
      webrtcInitializedRef.current = false;
      mediaInitAttemptedRef.current = false;

      if (signalingRef.current) {
        signalingRef.current.close();
        signalingRef.current = null;
      }

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
        remoteStream: null,
        participants: [],
        viewerCount: 0,
        connectionState: null,
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
              session_id: streamRef.current.id,
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

  const value: LiveStreamContextType = {
    ...state,
    startStream,
    endStream,
    toggleRecording,
    toggleMute,
    toggleVideo,
    initMedia,
    joinStream,
    leaveStream,
    addParticipant,
    removeParticipant,
    updateParticipantRole,
    getActiveStreams,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
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
