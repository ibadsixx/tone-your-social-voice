// Tone Live — LiveKit SDK media transport integrated into the existing Tone app.
//
// Implements the live session media transport behind the same state model:
//   - Stream session lifecycle: start, end, toggle recording
//   - Stream metadata: title, type (video/audio), audience, status
//   - Participant roles: host, moderator, guest, viewer
//   - Participant raise-hand
//   - LiveKit Room connection for media transport
//   - Device selection (camera/microphone)
//   - Integration with the existing audience/privacy system
//
// Private 1:1 calling (src/services/webrtc.ts) is NOT modified by this file.

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
import { Room, createLocalTracks, LocalTrack } from 'livekit-client';
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
  raiseHand,
  lowerHand,
  createLivePost,
  updateLivePostStatus,
  type LiveSession,
  type LiveParticipant,
  type CreateSessionData,
} from '@/api/liveStreams';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

export type StreamRole = 'host' | 'moderator' | 'guest' | 'viewer';
export type StreamType = 'video' | 'audio';

export interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput';
}

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
  connectionState: string | null;
  livePostId: null | string;
  devices: MediaDeviceInfo[];
  raisedHand: boolean;
}

export interface LiveStreamContextType extends LiveStreamState {
  startStream: (data: CreateSessionData) => Promise<LiveSession | null>;
  endStream: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  initMedia: (streamType: StreamType) => Promise<MediaStream | null>;
  joinStream: (streamId: string) => Promise<void>;
  leaveStream: () => Promise<void>;
  addParticipant: (userId: string, role: 'moderator' | 'guest' | 'viewer') => Promise<void>;
  removeParticipant: (userId: string) => Promise<void>;
  updateParticipantRole: (userId: string, role: StreamRole) => Promise<void>;
  getActiveStreams: () => Promise<LiveSession[]>;
  resetMediaInit: () => void;
  // Raise hand
  raiseHand: () => Promise<void>;
  lowerHand: () => Promise<void>;
  // Device selection
  getDevices: () => Promise<void>;
  switchCamera: (deviceId: string) => Promise<void>;
  switchMicrophone: (deviceId: string) => Promise<void>;
}

const LiveStreamContext = createContext<LiveStreamContextType | undefined>(undefined);

// Fetch a LiveKit token from the Gateway for a session.
// Returns { token, roomId, livekitUrl, role, sessionId }
async function fetchLiveKitToken(sessionId: string): Promise<{
  token: string;
  roomId: string;
  livekitUrl: string;
  role: StreamRole;
  sessionId: string;
}> {
  const token = (() => {
    try {
      const sessionStr = localStorage.getItem('tone-auth-token');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        return session?.access_token ?? null;
      }
    } catch {
      return null;
    }
    return null;
  })();

  if (!token) {
    throw new Error('Authentication required');
  }

  const res = await fetch(`${GATEWAY_URL}/api/live/sessions/${sessionId}/token`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to get LiveKit token (${res.status})`);
  }

  const data = await res.json();
  return {
    token: data.token,
    roomId: data.roomId,
    livekitUrl: data.livekitUrl,
    role: data.role,
    sessionId: data.sessionId,
  };
}

// Combine all subscribed remote tracks from all participants into a single MediaStream
// for backward compatibility with the existing UI that uses srcObject.
function combineRemoteTracks(room: Room): MediaStream {
  const stream = new MediaStream();
  for (const participant of room.remoteParticipants.values()) {
    for (const track of participant.getTracks()) {
      if (track.isSubscribed && track.track) {
        stream.addTrack(track.track);
      }
    }
  }
  return stream;
}

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
    livePostId: null,
    devices: [],
    raisedHand: false,
  });

  const streamRef = useRef<LiveSession | null>(null);
  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<Array<{ track: LocalTrack; kind: 'audio' | 'video' }>>([]);
  const mediaInitAttemptedRef = useRef(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 3;
  const reconnectDelayMs = 3000;

  // Cleanup LiveKit resources
  const cleanupLiveKit = useCallback(() => {
    // Stop and unpublish local tracks
    if (roomRef.current) {
      const room = roomRef.current;
      const localParticipant = room.localParticipant;
      for (const trackInfo of localTracksRef.current) {
        try {
          localParticipant.unpublishTrack(trackInfo.track);
        } catch {
          // Ignore errors during cleanup
        }
        try {
          trackInfo.track.stop();
        } catch {
          // Ignore errors during cleanup
        }
      }
      localTracksRef.current = [];

      try {
        room.disconnect();
      } catch {
        // Ignore errors during cleanup
      }
      roomRef.current = null;
    }

    // Stop any remaining local stream tracks
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
    }
  }, [state.localStream]);

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

  // Initialize local media (camera/microphone) using LiveKit
  const initMedia = useCallback(async (streamType: StreamType): Promise<MediaStream | null> => {
    // Prevent duplicate getUserMedia() calls
    if (mediaInitAttemptedRef.current) {
      return state.localStream;
    }
    mediaInitAttemptedRef.current = true;

    const isAudioOnly = streamType === 'audio';

    console.log('[LiveStreamContext] Creating local tracks, streamType:', streamType,
      'isAudioOnly:', isAudioOnly);

    try {
      const tracks = await createLocalTracks({
        audio: true,
        video: isAudioOnly ? false : true,
      });

      const hasTracks = tracks.length > 0;
      console.log('[LiveStreamContext] Local tracks created:', hasTracks ? 'success' : 'no tracks',
        'trackCount:', tracks.length, 'kinds:',
        tracks.map((t) => (t.track as MediaStreamTrack).kind).join(','));

      if (!hasTracks) {
        for (const t of tracks) {
          try { t.stop(); } catch { /* ignore */ }
        }
        setState((prev) => ({ ...prev, localStream: null }));
        console.warn('[LiveStreamContext] No usable tracks created');
        return null;
      }

      // Build a MediaStream from the local tracks
      const stream = new MediaStream();
      for (const t of tracks) {
        stream.addTrack(t.track);
      }

      localTracksRef.current = tracks.map((t) => ({ track: t, kind: t.track.kind as 'audio' | 'video' }));

      setState((prev) => ({
        ...prev,
        localStream: stream,
        isMuted: isAudioOnly,
        isVideoOff: isAudioOnly,
      }));

      console.log('[LiveStreamContext] Media initialized successfully, trackCount:',
        stream.getTracks().length);

      // Audio-only fallback notification
      if (!isAudioOnly && !stream.getTracks().some((t) => t.kind === 'video')) {
        toast({
          title: 'Video unavailable, audio-only mode',
          description: 'Camera access failed. Stream started in audio-only mode.',
          variant: 'default',
        });
      }

      return stream;
    } catch (err) {
      const error = err as Error;
      console.warn('[LiveStreamContext] Media init failed:', error.message);

      // If video mode fails, try audio-only fallback
      if (!isAudioOnly) {
        try {
          const audioTracks = await createLocalTracks({ audio: true, video: false });
          if (audioTracks.length > 0) {
            const audioStream = new MediaStream();
            for (const t of audioTracks) {
              stream.addTrack(t.track);
            }
            localTracksRef.current = audioTracks.map((t) => ({ track: t, kind: 'audio' }));

            setState((prev) => ({
              ...prev,
              localStream: audioStream,
              isMuted: false,
              isVideoOff: true,
            }));

            toast({
              title: 'Video unavailable, audio-only mode',
              description: 'Camera access failed. Stream started in audio-only mode.',
              variant: 'default',
            });
            return audioStream;
          }
        } catch (audioErr) {
          console.warn('[LiveStreamContext] Audio fallback also failed:',
            (audioErr as Error).message);
        }
      }

      throw error;
    }
  }, [state.localStream, toast]);

  // Connect to LiveKit Room with retry logic
  const connectToRoom = useCallback(async (
    livekitUrl: string,
    token: string,
    onConnected: () => void,
    onDisconnected: () => void,
    onReconnecting: () => void,
    onReconnected: () => void,
    onConnectionError: (err: Error) => void,
  ): Promise<void> => {
    reconnectAttemptsRef.current = 0;

    const connect = async (): Promise<void> => {
      try {
        await roomRef.current!.connect(livekitUrl, token);
        reconnectAttemptsRef.current = 0;
        onConnected();
      } catch (err) {
        reconnectAttemptsRef.current++;
        if (reconnectAttemptsRef.current <= maxReconnectAttempts) {
          console.log('[LiveKit] Reconnect attempt', reconnectAttemptsRef.current,
            'of', maxReconnectAttempts);
          setTimeout(connect, reconnectDelayMs);
        } else {
          onConnectionError(err instanceof Error ? err : new Error('Connection failed'));
        }
      }
    };

    await connect();
  }, []);

  // Start a new live stream
  const startStream = useCallback(
    async (data: CreateSessionData) => {
      if (!user) throw new Error('Authentication required');

      // Clean up any previous LiveKit resources
      cleanupLiveKit();

      try {
        setState((prev) => ({ ...prev, error: null }));

        // Create the stream session first (API call)
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

        // Get LiveKit token from Gateway
        let tokenData: {
          token: string;
          roomId: string;
          livekitUrl: string;
          role: StreamRole;
          sessionId: string;
        } | null = null;
        try {
          tokenData = await fetchLiveKitToken(newStream.id);
        } catch (tokenErr) {
          console.warn('[LiveStreamContext] Failed to get LiveKit token:',
            (tokenErr as Error).message);
        }

        // Connect to LiveKit Room
        if (tokenData) {
          const room = new Room({
            adaptiveStream: true,
            dynacast: true,
          });
          roomRef.current = room;

          // Set up event handlers
          room.on('connected', () => {
            console.log('[LiveKit] Connected to room:', room.name);
            setState((prev) => ({
              ...prev,
              isConnected: true,
              connectionState: 'connected',
              error: null,
            }));
          });

          room.on('disconnected', () => {
            console.log('[LiveKit] Disconnected from room:', room.name);
            setState((prev) => ({
              ...prev,
              isConnected: false,
              connectionState: 'disconnected',
            }));
          });

          room.on('reconnecting', () => {
            console.log('[LiveKit] Reconnecting to room:', room.name);
            setState((prev) => ({ ...prev, connectionState: 'reconnecting' }));
          });

          room.on('reconnected', () => {
            console.log('[LiveKit] Reconnected to room:', room.name);
            setState((prev) => ({ ...prev, connectionState: 'connected' }));
          });

          room.on('connectionError', (err) => {
            console.error('[LiveKit] Connection error:', err);
            setState((prev) => ({
              ...prev,
              connectionState: 'failed',
              error: err?.message || 'LiveKit connection failed',
            }));
          });

          room.on('participantConnected', (participant) => {
            console.log('[LiveKit] Participant connected:', participant.identity);
            setState((prev) => ({
              ...prev,
              viewerCount: room.remoteParticipants.size + 1,
            }));
          });

          room.on('participantDisconnected', (participant) => {
            console.log('[LiveKit] Participant disconnected:', participant.identity);
            setState((prev) => ({
              ...prev,
              viewerCount: Math.max(0, room.remoteParticipants.size),
            }));
          });

          room.on('trackPublished', (publication, participant) => {
            console.log('[LiveKit] Track published:', publication.track?.kind,
              'by', participant.identity);
          });

          room.on('trackSubscribed', (track, publication, participant) => {
            console.log('[LiveKit] Track subscribed:', track.kind,
              'from', participant.identity);
            setState((prev) => ({
              ...prev,
              remoteStream: combineRemoteTracks(room),
            }));
          });

          room.on('trackUnpublished', (publication, participant) => {
            console.log('[LiveKit] Track unpublished:', publication.track?.kind,
              'from', participant.identity);
            setState((prev) => ({
              ...prev,
              remoteStream: combineRemoteTracks(room),
            }));
          });

          room.on('activeSpeakersChanged', (speakers) => {
            // Could be used for speaker indicators
          });

          await connectToRoom(
            tokenData.livekitUrl,
            tokenData.token,
            () => {
              // connected handler already set above
            },
            () => {
              // disconnected handler already set above
            },
            () => {
              // reconnecting handler already set above
            },
            () => {
              // reconnected handler already set above
            },
            (err) => {
              console.error('[LiveKit] Connection failed after retries:', err);
            },
          );
        }

        // Initialize local media after session is created. If this fails
        // (e.g. no camera/mic, permission denied), the stream still exists
        // and the user can still join as a viewer — but we do NOT publish
        // a live post for a stream with no media.
        let mediaOk = false;
        let mediaStream: MediaStream | null = null;
        try {
          mediaStream = await initMedia(data.stream_type);
        } catch (mediaErr) {
          console.warn('[LiveStreamContext] Media init threw, stream created without local media:',
            (mediaErr as Error).message);
        }
        if (mediaStream && mediaStream.getTracks().length > 0) {
          mediaOk = true;
          console.log('[LiveStreamContext] Media initialized successfully,',
            'trackCount:', mediaStream.getTracks().length,
            'trackKinds:', mediaStream.getTracks().map((t) => t.kind).join(','));

          // Publish local tracks to LiveKit Room if we have a room and role permits publishing
          if (roomRef.current && mediaStream.getTracks().length > 0) {
            const room = roomRef.current;
            const localParticipant = room.localParticipant;
            const trackObjs = localTracksRef.current;
            for (const t of trackObjs) {
              try {
                await localParticipant.publishTrack(t.track);
                console.log('[LiveKit] Published track:', t.track.kind);
              } catch (pubErr) {
                console.error('[LiveKit] Failed to publish track:', pubErr);
              }
            }
          }
        } else {
          console.warn('[LiveStreamContext] Media init returned no usable tracks');
          toast({
            title: 'Stream started',
            description: 'Stream created but camera/microphone access was denied',
            variant: 'default',
          });
        }

        // Create a live post for the session only if media initialized successfully.
        let livePostId: string | null = null;
        if (mediaOk) {
          console.log('[LiveStreamContext] Creating live post for session:', newStream.id);
          try {
            const { data: postData, error: postError } = await createLivePost({
              host_id: user.id,
              title: data.title ?? null,
              stream_type: data.stream_type,
              audience_type: data.audience_type,
              audience_user_ids: data.audience_user_ids,
              audience_excluded_user_ids: data.audience_excluded_user_ids,
              audience_list_id: data.audience_list_id,
              live_session_id: newStream.id,
            });
            if (postData?.id) {
              livePostId = postData.id;
              console.log('[LiveStreamContext] Live post created:', livePostId,
                'sessionId:', newStream.id);
            } else if (postError) {
              console.warn('[LiveStreamContext] Failed to create live post:',
                'status:', postError.code, 'message:', postError.message);
            }
          } catch (err) {
            console.warn('[LiveStreamContext] Exception creating live post:',
              (err as Error).message);
          }
        } else {
          console.log('[LiveStreamContext] Skipping live post creation: no usable media tracks');
        }

        setState((prev) => ({
          ...prev,
          stream: newStream,
          isHost: true,
          isConnected: roomRef.current ? roomRef.current.connectionState === 'connected' : false,
          viewerCount: 1,
          livePostId,
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
              raised_hand: false,
            },
          ],
        }));

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
    [user, toast, initMedia, createLiveStream, createLivePost, cleanupLiveKit, connectToRoom]
  );

  // End the current stream
  const endStream = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      // Clean up LiveKit resources
      cleanupLiveKit();

      // Update stream status to ended
      await endLiveStream(streamRef.current.id);

      // Mark the live post as ended
      if (state.livePostId && streamRef.current) {
        await updateLivePostStatus(streamRef.current.id, 'ended');
      }

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
        livePostId: null,
        raisedHand: false,
      }));

      toast({ title: 'Stream ended', description: 'Your live stream has ended' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end stream';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [streamRef.current, state.localStream, state.livePostId, toast, cleanupLiveKit]);

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
      // Also update LiveKit local track published state
      const room = roomRef.current;
      if (room) {
        const localParticipant = room.localParticipant;
        for (const trackInfo of localTracksRef.current) {
          if (trackInfo.track.kind === 'audio') {
            try {
              localParticipant.setMicrophoneEnabled(!newMuted);
            } catch {
              // Ignore
            }
          }
        }
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
      // Also update LiveKit local track published state
      const room = roomRef.current;
      if (room) {
        const localParticipant = room.localParticipant;
        for (const trackInfo of localTracksRef.current) {
          if (trackInfo.track.kind === 'video') {
            try {
              localParticipant.setCameraEnabled(!newVideoOff);
            } catch {
              // Ignore
            }
          }
        }
      }
      return { ...prev, isVideoOff: newVideoOff };
    });
  }, []);

  // Join an existing stream as a viewer/guest
  const joinStream = useCallback(async (streamId: string) => {
    if (!user) throw new Error('Authentication required');

    // Clean up any previous LiveKit resources
    cleanupLiveKit();

    try {
      setState((prev) => ({ ...prev, error: null }));

      const { data: stream, error } = await getLiveStream(streamId);
      if (error) throw error;

      streamRef.current = stream;

      // Get LiveKit token from Gateway
      let tokenData: {
        token: string;
        roomId: string;
        livekitUrl: string;
        role: StreamRole;
        sessionId: string;
      } | null = null;
      try {
        tokenData = await fetchLiveKitToken(streamId);
      } catch (tokenErr) {
        console.warn('[LiveStreamContext] Failed to get LiveKit token:',
          (tokenErr as Error).message);
      }

      // Connect to LiveKit Room
      if (tokenData) {
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;

        room.on('connected', () => {
          console.log('[LiveKit] Connected to room:', room.name);
          setState((prev) => ({
            ...prev,
            isConnected: true,
            connectionState: 'connected',
            error: null,
          }));
        });

        room.on('disconnected', () => {
          console.log('[LiveKit] Disconnected from room:', room.name);
          setState((prev) => ({
            ...prev,
            isConnected: false,
            connectionState: 'disconnected',
          }));
        });

        room.on('reconnecting', () => {
          console.log('[LiveKit] Reconnecting to room:', room.name);
          setState((prev) => ({ ...prev, connectionState: 'reconnecting' }));
        });

        room.on('reconnected', () => {
          console.log('[LiveKit] Reconnected to room:', room.name);
          setState((prev) => ({ ...prev, connectionState: 'connected' }));
        });

        room.on('connectionError', (err) => {
          console.error('[LiveKit] Connection error:', err);
          setState((prev) => ({
            ...prev,
            connectionState: 'failed',
            error: err?.message || 'LiveKit connection failed',
          }));
        });

        room.on('participantConnected', (participant) => {
          console.log('[LiveKit] Participant connected:', participant.identity);
          setState((prev) => ({
            ...prev,
            viewerCount: room.remoteParticipants.size + 1,
          }));
        });

        room.on('participantDisconnected', (participant) => {
          console.log('[LiveKit] Participant disconnected:', participant.identity);
          setState((prev) => ({
            ...prev,
            viewerCount: Math.max(0, room.remoteParticipants.size),
          }));
        });

        room.on('trackSubscribed', (track, publication, participant) => {
          console.log('[LiveKit] Track subscribed:', track.kind,
            'from', participant.identity);
          setState((prev) => ({
            ...prev,
            remoteStream: combineRemoteTracks(room),
          }));
        });

        room.on('trackUnpublished', (publication, participant) => {
          console.log('[LiveKit] Track unpublished:', publication.track?.kind,
            'from', participant.identity);
          setState((prev) => ({
            ...prev,
            remoteStream: combineRemoteTracks(room),
          }));
        });

        await connectToRoom(
          tokenData.livekitUrl,
          tokenData.token,
          () => {},
          () => {},
          () => {},
          () => {},
          (err) => {
            console.error('[LiveKit] Connection failed after retries:', err);
          },
        );
      }

      setState((prev) => ({
        ...prev,
        stream,
        isHost: stream.host_id === user?.id,
        isConnected: roomRef.current ? roomRef.current.connectionState === 'connected' : false,
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
            raised_hand: false,
          },
        ],
      }));

      toast({ title: 'Joined stream', description: 'You are now watching the live stream' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join stream';
      setState((prev) => ({ ...prev, error: message }));
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [user, cleanupLiveKit, connectToRoom]);

  // Leave the current stream
  const leaveStream = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      // Clean up LiveKit resources
      cleanupLiveKit();

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
        raisedHand: false,
      }));

      toast({ title: 'Left stream', description: 'You have left the live stream' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to leave stream';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [streamRef.current, state.isHost, user, cleanupLiveKit]);

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
              raised_hand: false,
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

  // Reset media initialization state so a new session can retry getUserMedia.
  const resetMediaInit = useCallback(() => {
    mediaInitAttemptedRef.current = false;
  }, []);

  // Raise hand
  const raiseHandFn = useCallback(async () => {
    if (!streamRef.current || !user) return;

    try {
      const { data, error } = await raiseHand(streamRef.current.id, user.id);
      if (error) throw error;

      setState((prev) => ({
        ...prev,
        raisedHand: true,
        participants: prev.participants.map((p) =>
          p.user_id === user.id ? { ...p, raised_hand: true } : p
        ),
      }));

      toast({ title: 'Hand raised', description: 'Host has been notified' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to raise hand';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [streamRef.current, user]);

  // Lower hand
  const lowerHandFn = useCallback(async () => {
    if (!streamRef.current || !user) return;

    try {
      const { data, error } = await lowerHand(streamRef.current.id, user.id);
      if (error) throw error;

      setState((prev) => ({
        ...prev,
        raisedHand: false,
        participants: prev.participants.map((p) =>
          p.user_id === user.id ? { ...p, raised_hand: false } : p
        ),
      }));

      toast({ title: 'Hand lowered' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to lower hand';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [streamRef.current, user]);

  // Get available media devices
  const getDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label, kind: 'videoinput' as const }));
      const audioDevices = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label, kind: 'audioinput' as const }));

      setState((prev) => ({
        ...prev,
        devices: [...videoDevices, ...audioDevices],
      }));
    } catch (err) {
      console.warn('[LiveStreamContext] Failed to enumerate devices:', err);
    }
  }, []);

  // Switch camera device
  const switchCamera = useCallback(async (deviceId: string) => {
    if (!roomRef.current) return;

    try {
      // Stop existing video tracks
      const videoTracks = localTracksRef.current
        .filter((t) => t.kind === 'video');
      for (const t of videoTracks) {
        try {
          const room = roomRef.current!;
          const localParticipant = room.localParticipant;
          localParticipant.unpublishTrack(t.track);
          t.track.stop();
        } catch {
          // Ignore
        }
      }
      localTracksRef.current = localTracksRef.current.filter((t) => t.kind !== 'video');

      // Create new video track with selected device
      const tracks = await createLocalTracks({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });

      if (tracks.length > 0) {
        const track = tracks[0];
        localTracksRef.current.push({ track, kind: 'video' });

        const localParticipant = roomRef.current!.localParticipant;
        await localParticipant.publishTrack(track.track);

        setState((prev) => ({
          ...prev,
          localStream: new MediaStream([...localTracksRef.current.map(t => t.track)]),
        }));
      }
    } catch (err) {
      console.error('[LiveStreamContext] Failed to switch camera:', err);
      toast({ title: 'Error', description: 'Failed to switch camera', variant: 'destructive' });
    }
  }, []);

  // Switch microphone device
  const switchMicrophone = useCallback(async (deviceId: string) => {
    if (!roomRef.current) return;

    try {
      // Stop existing audio tracks
      const audioTracks = localTracksRef.current
        .filter((t) => t.kind === 'audio');
      for (const t of audioTracks) {
        try {
          const room = roomRef.current!;
          const localParticipant = room.localParticipant;
          localParticipant.unpublishTrack(t.track);
          t.track.stop();
        } catch {
          // Ignore
        }
      }
      localTracksRef.current = localTracksRef.current.filter((t) => t.kind !== 'audio');

      // Create new audio track with selected device
      const tracks = await createLocalTracks({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      });

      if (tracks.length > 0) {
        const track = tracks[0];
        localTracksRef.current.push({ track, kind: 'audio' });

        const localParticipant = roomRef.current!.localParticipant;
        await localParticipant.publishTrack(track.track);

        setState((prev) => ({
          ...prev,
          localStream: new MediaStream([...localTracksRef.current.map(t => t.track)]),
        }));
      }
    } catch (err) {
      console.error('[LiveStreamContext] Failed to switch microphone:', err);
      toast({ title: 'Error', description: 'Failed to switch microphone', variant: 'destructive' });
    }
  }, []);

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
    resetMediaInit,
    raiseHand: raiseHandFn,
    lowerHand: lowerHandFn,
    getDevices,
    switchCamera,
    switchMicrophone,
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