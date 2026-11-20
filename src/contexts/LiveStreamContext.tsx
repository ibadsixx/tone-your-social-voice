// Tone Live — browser-to-browser WebRTC (P2P) media transport.
//
// This context keeps the existing Tone Live state model and UI contract while
// replacing the old media-server transport with:
//   - LivePeerManager: one RTCPeerConnection per remote participant
//   - LiveSignalingClient: authenticated Gateway WebSocket signaling
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
import {
  createLiveStream,
  getLiveStream,
  getActiveLiveStreams,
  updateLiveStream,
  endLiveStream,
  getStreamParticipants,
  addStreamParticipant,
  updateStreamParticipant,
  removeStreamParticipant,
  removeStreamParticipantById,
  raiseHand,
  lowerHand,
  createLivePost,
  updateLivePostStatus,
  type LiveSession,
  type LiveParticipant,
  type CreateSessionData,
} from '@/api/liveStreams';
import {
  LivePeerManager,
  type InboundP2PSignal,
  type OutboundP2PSignal,
} from '@/services/liveP2P';
import {
  LiveSignalingClient,
  type SignalingConnectionState,
} from '@/services/liveSignalingClient';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL as string;

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
  peerCount: number;
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
  raiseHand: () => Promise<void>;
  lowerHand: () => Promise<void>;
  dismissHand: (userId: string) => Promise<void>;
  getDevices: () => Promise<void>;
  switchCamera: (deviceId: string) => Promise<void>;
  switchMicrophone: (deviceId: string) => Promise<void>;
}

const LiveStreamContext = createContext<LiveStreamContextType | undefined>(undefined);

function getAuthToken(): string | null {
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
}

const INITIAL_STATE: LiveStreamState = {
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
  peerCount: 0,
};

export const LiveStreamProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [state, setState] = useState<LiveStreamState>(INITIAL_STATE);

  const streamRef = useRef<LiveSession | null>(null);
  const peerManagerRef = useRef<LivePeerManager | null>(null);
  const signalingRef = useRef<LiveSignalingClient | null>(null);
  const mediaInitAttemptedRef = useRef(false);
  const livePostCreatedRef = useRef(false);
  const myRoleRef = useRef<StreamRole>('viewer');

  const cleanupMedia = useCallback(() => {
    signalingRef.current?.close();
    signalingRef.current = null;
    peerManagerRef.current?.close();
    peerManagerRef.current = null;
    mediaInitAttemptedRef.current = false;
  }, []);

  // -------------------------------------------------------------------------
  // Signaling message dispatch
  // -------------------------------------------------------------------------
  const handleSignalingMessage = useCallback((message: InboundP2PSignal) => {
    const manager = peerManagerRef.current;
    if (!manager || !user) return;
    const from = message.fromUserId;
    if (!from || from === user.id) return;

    switch (message.type) {
      case 'join': {
        // A new participant connected. Existing peers initiate the offer; the
        // newcomer waits for offers, which avoids duplicate/glare offers.
        manager.offerTo(from).catch((error: Error) => {
          console.warn('[LiveStream] offer to', from, 'failed:', error.message);
        });
        break;
      }
      case 'leave': {
        manager.removePeer(message.state?.targetUserId ?? from);
        setState((prev) => ({ ...prev, peerCount: manager.getPeerCount() }));
        break;
      }
      case 'session-ended': {
        // The host ended the broadcast; tear down all peer connections.
        cleanupMedia();
        setState((prev) => ({
          ...prev,
          isConnected: false,
          connectionState: 'ended',
          remoteStream: null,
          peerCount: 0,
        }));
        break;
      }
      case 'participant-state': {
        if (message.state) {
          const target = message.state.targetUserId ?? from;
          setState((prev) => ({
            ...prev,
            participants: prev.participants.map((p) =>
              p.user_id === target
                ? {
                    ...p,
                    ...(message.state!.isMuted !== undefined ? { is_muted: message.state!.isMuted } : {}),
                    ...(message.state!.isVideoOff !== undefined ? { is_video_off: message.state!.isVideoOff } : {}),
                    ...(message.state!.raisedHand !== undefined ? { raised_hand: message.state!.raisedHand } : {}),
                    ...(message.state!.role !== undefined ? { role: message.state!.role } : {}),
                  }
                : p),
          }));
        }
        break;
      }
      case 'offer':
      case 'answer':
      case 'ice-candidate':
      case 'renegotiate':
      case 'ice-restart':
        manager.handleSignal(message).catch((error: Error) => {
          console.warn('[LiveStream] signal handling failed:', error.message);
        });
        break;
      default:
        break;
    }
  }, [user, cleanupMedia]);

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------
  const connectSignaling = useCallback(async (sessionId: string) => {
    signalingRef.current?.close();
    const client = new LiveSignalingClient({
      gatewayUrl: GATEWAY_URL,
      sessionId,
      getAuthToken,
      onMessage: handleSignalingMessage,
      onConnectionStateChange: (connection: SignalingConnectionState) => {
        setState((prev) => ({
          ...prev,
          connectionState: connection,
          isConnected: connection === 'connected',
          error: connection === 'failed' ? 'Signaling connection failed' : prev.error,
        }));
      },
    });
    signalingRef.current = client;
    await client.connect();
  }, [handleSignalingMessage]);

  // -------------------------------------------------------------------------
  // Local media
  // -------------------------------------------------------------------------
  const initMedia = useCallback(async (streamType: StreamType): Promise<MediaStream | null> => {
    if (mediaInitAttemptedRef.current && peerManagerRef.current?.getLocalStream()) {
      return peerManagerRef.current.getLocalStream();
    }
    if (!streamRef.current) return null;

    let manager = peerManagerRef.current;
    if (!manager) {
      manager = new LivePeerManager({
        sessionId: streamRef.current.id,
        localUserId: user?.id ?? 'unknown',
        role: myRoleRef.current,
        onSignal: (signal: OutboundP2PSignal) => signalingRef.current?.send(signal),
        onRemoteStreamsChange: () => {
          setState((prev) => ({ ...prev, remoteStream: manager!.getCombinedRemoteStream() }));
        },
        onConnectionStateChange: (connection) => {
          setState((prev) => ({ ...prev, connectionState: String(connection) }));
        },
        onPeerStateChange: () => {
          setState((prev) => ({ ...prev, peerCount: manager!.getPeerCount() }));
        },
      });
      peerManagerRef.current = manager;
    }

    try {
      const stream = await manager.initLocalMedia(streamType);
      if (stream) {
        mediaInitAttemptedRef.current = true;
        const audioOnly = stream.getVideoTracks().length === 0;
        setState((prev) => ({
          ...prev,
          localStream: stream,
          isMuted: stream.getAudioTracks().length === 0,
          isVideoOff: audioOnly,
        }));
        if (streamType === 'video' && audioOnly) {
          toast({ title: 'Video unavailable, audio-only mode', description: 'Camera access failed.', variant: 'default' });
        }
      }
      return stream;
    } catch (error) {
      console.warn('[LiveStream] media init failed:', (error as Error).message);
      throw error;
    }
  }, [toast, user]);

  // -------------------------------------------------------------------------
  // Active streams
  // -------------------------------------------------------------------------
  const getActiveStreams = useCallback(async () => {
    try {
      const { data, error } = await getActiveLiveStreams();
      if (error) throw error;
      setState((prev) => ({ ...prev, error: null }));
      return data ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load active streams';
      setState((prev) => ({ ...prev, error: message }));
      toast({ title: 'Error', description: message, variant: 'destructive' });
      return [];
    }
  }, [toast]);

  // -------------------------------------------------------------------------
  // Start a broadcast (host)
  // -------------------------------------------------------------------------
  const startStream = useCallback(async (data: CreateSessionData) => {
    if (!user) throw new Error('Authentication required');
    cleanupMedia();
    livePostCreatedRef.current = false;
    myRoleRef.current = 'host';

    try {
      setState((prev) => ({ ...prev, error: null }));
      const { data: stream, error } = await createLiveStream({
        ...data,
        host_id: user.id,
        status: 'live' as never,
        started_at: new Date().toISOString(),
        viewer_count: 0,
      } as unknown as CreateSessionData);
      if (error) throw error;
      if (!stream) throw new Error('Failed to create stream');

      streamRef.current = stream;

      let mediaStream: MediaStream | null = null;
      try {
        mediaStream = await initMedia(data.stream_type);
      } catch (mediaErr) {
        console.warn('[LiveStream] host media init failed:', (mediaErr as Error).message);
      }

      // Exactly one LIVE post per session (Gateway enforces idempotency too).
      let livePostId: string | null = null;
      if (mediaStream && mediaStream.getTracks().length > 0 && !livePostCreatedRef.current) {
        livePostCreatedRef.current = true;
        const { data: postData } = await createLivePost({
          host_id: user.id,
          title: data.title ?? null,
          stream_type: data.stream_type,
          audience_type: data.audience_type,
          audience_user_ids: data.audience_user_ids,
          audience_excluded_user_ids: data.audience_excluded_user_ids,
          audience_list_id: data.audience_list_id,
          live_session_id: stream.id,
        });
        livePostId = postData?.id ?? null;
      }

      await connectSignaling(stream.id);

      setState((prev) => ({
        ...prev,
        stream,
        isHost: true,
        viewerCount: 1,
        livePostId,
        participants: [{
          id: `${stream.id}-${user.id}`,
          session_id: stream.id,
          user_id: user.id,
          role: 'host',
          joined_at: new Date().toISOString(),
          left_at: null,
          is_muted: data.stream_type === 'audio',
          is_video_off: data.stream_type === 'audio',
          raised_hand: false,
        }],
      }));

      toast({ title: 'Live stream started', description: `Your ${data.stream_type} stream is now live (P2P)` });
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start stream';
      setState((prev) => ({ ...prev, error: message }));
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [user, cleanupMedia, initMedia, createLivePost, connectSignaling, toast]);

  // -------------------------------------------------------------------------
  // End a broadcast (host only)
  // -------------------------------------------------------------------------
  const endStream = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      await endLiveStream(stream.id);
      if (state.livePostId) {
        await updateLivePostStatus(state.livePostId, 'ended').catch(() => undefined);
      }
      cleanupMedia();
      setState((prev) => ({
        ...prev,
        stream: { ...prev.stream!, status: 'ended' },
        isConnected: false,
        connectionState: 'ended',
        localStream: null,
        remoteStream: null,
        peerCount: 0,
      }));
      toast({ title: 'Stream ended' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end stream';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [state.livePostId, cleanupMedia, toast]);

  const toggleRecording = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      const next = !stream.recording;
      const { data } = await updateLiveStream(stream.id, { recording: next } as never);
      if (data) {
        streamRef.current = data;
        setState((prev) => ({ ...prev, stream: data }));
      }
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  }, [toast]);

  // -------------------------------------------------------------------------
  // Join a broadcast (viewer)
  // -------------------------------------------------------------------------
  const joinStream = useCallback(async (streamId: string) => {
    if (!user) throw new Error('Authentication required');
    cleanupMedia();
    myRoleRef.current = 'viewer';

    try {
      setState((prev) => ({ ...prev, error: null }));
      const { data: stream, error } = await getLiveStream(streamId);
      if (error) throw error;
      if (!stream) return;
      streamRef.current = stream;

      if (stream.host_id !== user.id) {
        await addStreamParticipant(streamId, user.id, 'viewer');
      }

      // Viewers are subscribe-only by default: no local media is acquired, so
      // frontend state alone cannot grant publishing permission.
      await connectSignaling(streamId);

      const { data: participants } = await getStreamParticipants(streamId);
      setState((prev) => ({
        ...prev,
        stream,
        isHost: stream.host_id === user.id,
        viewerCount: (participants?.length ?? 0) || (stream.viewer_count ?? 0) + 1,
        participants: participants ?? [],
        localStream: null,
      }));
      toast({ title: 'Joined stream', description: 'Connected over peer-to-peer WebRTC' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join stream';
      setState((prev) => ({ ...prev, error: message }));
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }, [user, cleanupMedia, connectSignaling, toast]);

  // -------------------------------------------------------------------------
  // Leave — viewers leave the session; hosts do NOT end it implicitly.
  // -------------------------------------------------------------------------
  const leaveStream = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      if (stream.host_id !== user?.id) {
        await removeStreamParticipant(stream.id, user!.id);
      }
      // Deliberate host disconnect: no endLiveStream() here. A temporary
      // network interruption must not terminate the host's broadcast.
      cleanupMedia();
      setState({
        ...INITIAL_STATE,
        stream: stream.host_id === user?.id ? { ...stream, status: 'ended' } : null,
      });
      toast({ title: 'Left stream' });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  }, [user, cleanupMedia, toast]);

  // -------------------------------------------------------------------------
  // Media controls
  // -------------------------------------------------------------------------
  const publishParticipantState = useCallback((partial: {
    isMuted?: boolean; isVideoOff?: boolean; raisedHand?: boolean;
  }) => {
    const stream = streamRef.current;
    if (!stream || !user) return;
    signalingRef.current?.send({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sessionId: stream.id,
      type: 'participant-state',
      state: partial,
    } as OutboundP2PSignal);
  }, [user]);

  const toggleMute = useCallback(() => {
    const nextMuted = !state.isMuted;
    peerManagerRef.current?.setMuted(nextMuted);
    setState((prev) => ({ ...prev, isMuted: nextMuted }));
    publishParticipantState({ isMuted: nextMuted });
  }, [state.isMuted, publishParticipantState]);

  const toggleVideo = useCallback(() => {
    const nextOff = !state.isVideoOff;
    peerManagerRef.current?.setVideoEnabled(!nextOff);
    setState((prev) => ({ ...prev, isVideoOff: nextOff }));
    publishParticipantState({ isVideoOff: nextOff });
  }, [state.isVideoOff, publishParticipantState]);

  const raiseHandFn = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream || !user) return;
    await raiseHand(stream.id, user.id);
    setState((prev) => ({ ...prev, raisedHand: true }));
    publishParticipantState({ raisedHand: true });
  }, [user, publishParticipantState]);

  const lowerHandFn = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream || !user) return;
    await lowerHand(stream.id, user.id);
    setState((prev) => ({ ...prev, raisedHand: false }));
    publishParticipantState({ raisedHand: false });
  }, [user, publishParticipantState]);

  // Host/moderator dismisses another participant's raised hand. The Gateway
  // authorizes the moderation action; the client only reflects the result.
  const dismissHand = useCallback(async (userId: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    await lowerHand(stream.id, userId);
    setState((prev) => ({
      ...prev,
      participants: prev.participants.map((p) => p.user_id === userId ? { ...p, raised_hand: false } : p),
    }));
  }, []);

  // -------------------------------------------------------------------------
  // Participant moderation — all role decisions are Gateway-authorized.
  // -------------------------------------------------------------------------
  const addParticipant = useCallback(async (userId: string, role: 'moderator' | 'guest' | 'viewer') => {
    const stream = streamRef.current;
    if (!stream) return;
    const { data } = await addStreamParticipant(stream.id, userId, role);
    if (data) setState((prev) => ({ ...prev, participants: [...prev.participants.filter((p) => p.user_id !== userId), data] }));
  }, []);

  const removeParticipant = useCallback(async (userId: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    await removeStreamParticipantById(stream.id, userId);
    setState((prev) => ({ ...prev, participants: prev.participants.filter((p) => p.user_id !== userId) }));
  }, []);

  const updateParticipantRole = useCallback(async (userId: string, role: StreamRole) => {
    const stream = streamRef.current;
    if (!stream) return;
    const { data } = await updateStreamParticipant(stream.id, userId, { role });
    if (data) {
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) => p.user_id === userId ? data : p),
      }));
      if (userId === user?.id) myRoleRef.current = role;
    }
  }, [user]);

  // -------------------------------------------------------------------------
  // Devices
  // -------------------------------------------------------------------------
  const getDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setState((prev) => ({
        ...prev,
        devices: all
          .filter((d) => d.kind === 'videoinput' || d.kind === 'audioinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind as 'videoinput' | 'audioinput' })),
      }));
    } catch (err) {
      console.warn('[LiveStream] device enumeration failed:', (err as Error).message);
    }
  }, []);

  const switchCamera = useCallback(async (deviceId: string) => {
    try {
      await peerManagerRef.current?.switchCamera(deviceId);
    } catch (err) {
      toast({ title: 'Camera switch failed', description: (err as Error).message, variant: 'destructive' });
    }
  }, [toast]);

  const switchMicrophone = useCallback(async (deviceId: string) => {
    try {
      await peerManagerRef.current?.switchMicrophone(deviceId);
    } catch (err) {
      toast({ title: 'Microphone switch failed', description: (err as Error).message, variant: 'destructive' });
    }
  }, [toast]);

  const resetMediaInit = useCallback(() => {
    mediaInitAttemptedRef.current = false;
    livePostCreatedRef.current = false;
  }, []);

  // Full teardown if the provider unmounts while connected.
  useEffect(() => () => {
    signalingRef.current?.close();
    peerManagerRef.current?.close();
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
    dismissHand,
    getDevices,
    switchCamera,
    switchMicrophone,
  };

  return <LiveStreamContext.Provider value={value}>{children}</LiveStreamContext.Provider>;
};

export const useLiveStream = (): LiveStreamContextType => {
  const context = useContext(LiveStreamContext);
  if (!context) throw new Error('useLiveStream must be used within a LiveStreamProvider');
  return context;
};
