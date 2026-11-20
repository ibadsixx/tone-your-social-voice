// Tone Live — browser-to-browser WebRTC media engine (P2P mesh).
//
// This is a NEW service used only by Tone Live. The private 1:1 calling code in
// src/services/webrtc.ts is deliberately untouched.
//
// Transport: native RTCPeerConnection / MediaStream / getUserMedia. Signaling is
// carried by the Gateway WebSocket (see liveSignalingClient.ts); this module
// only produces and consumes signaling messages.
//
// Topology: one RTCPeerConnection per remote participant (full mesh). Existing
// peers create the offer when a newcomer joins, so a newcomer never offers on
// join. Perfect negotiation is layered on top to survive simultaneous
// renegotiation / glare.
//
// Capacity is deliberately bounded. With N publishing peers there are N(N-1)/2
// peer connections and each publisher sends N-1 independent media streams.
// At ~1.2 Mbps per forwarded video stream that is ~3.6 Mbps uplink for 4
// publishers and ~6 Mbps for 6. Practically keep live video to <=4-6 publishing
// peers on normal residential connections; additional viewers are subscribe-only
// and still cost N-1 downlinks each. There is no SFU, so do not treat this as a
// large-audience or production-scale broadcast solution.
//
// ICE: STUN-only and configurable through VITE_LIVE_STUN_SERVERS. There is no
// TURN server here. STUN-only P2P is best-effort: symmetric NATs and restrictive
// firewalls can prevent a direct connection.

import type { StreamRole } from '@/contexts/LiveStreamContext';

export interface IceCandidateSignal {
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  candidate: string;
  usernameFragment?: string | null;
}

export interface OutboundP2PSignal {
  id: string;
  sessionId: string;
  /** Omit for a session-wide broadcast. */
  toUserId?: string;
  type: 'offer' | 'answer' | 'ice-candidate' | 'renegotiate' | 'ice-restart' | 'participant-state';
  sdp?: string;
  candidate?: IceCandidateSignal;
  state?: { isMuted?: boolean; isVideoOff?: boolean; raisedHand?: boolean; role?: StreamRole; targetUserId?: string };
}

export interface InboundP2PSignal {
  id: string;
  sessionId: string;
  fromUserId: string;
  toUserId?: string;
  type: string;
  sdp?: string;
  candidate?: IceCandidateSignal;
  state?: { isMuted?: boolean; isVideoOff?: boolean; raisedHand?: boolean; role?: StreamRole; targetUserId?: string };
}

const DEFAULT_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
];

/** Configurable, STUN-only ICE configuration. No TURN is configured. */
export function getLiveIceServers(): RTCIceServer[] {
  const configured = (import.meta.env.VITE_LIVE_STUN_SERVERS as string | undefined)?.trim();
  const urls = configured
    ? configured.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_STUN_SERVERS;
  return urls.map((url) => ({ urls: url }));
}

export interface LivePeerManagerOptions {
  sessionId: string;
  localUserId: string;
  role: StreamRole;
  onSignal: (signal: OutboundP2PSignal) => void;
  onRemoteStreamsChange: (streams: Map<string, MediaStream>) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState | 'new') => void;
  onPeerStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
  onIceRestart?: (peerId: string) => void;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  stream: MediaStream;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** True once the initial offer/answer exchange has started for this peer. */
  offered: boolean;
  lastState: RTCPeerConnectionState | 'new';
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Manages a P2P mesh: one RTCPeerConnection per remote participant, perfect
 * negotiation, ICE candidate exchange, ICE restart, track lifecycle and clean
 * teardown. It is UI-framework agnostic and safe to unit test with mocked RTC.
 */
export class LivePeerManager {
  private readonly peers = new Map<string, PeerEntry>();
  private localStream: MediaStream | null = null;
  private closed = false;
  private videoEnabled = true;
  private audioEnabled = true;

  constructor(private readonly options: LivePeerManagerOptions) {}

  /** The local MediaStream, if getUserMedia has succeeded. */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStreams(): Map<string, MediaStream> {
    const streams = new Map<string, MediaStream>();
    for (const [id, entry] of this.peers) streams.set(id, entry.stream);
    return streams;
  }

  /** Flatten all remote tracks into one MediaStream for the existing UI. */
  getCombinedRemoteStream(): MediaStream | null {
    const combined = new MediaStream();
    let count = 0;
    for (const entry of this.peers.values()) {
      for (const track of entry.stream.getTracks()) {
        combined.addTrack(track);
        count++;
      }
    }
    return count > 0 ? combined : null;
  }

  /** Number of live peer connections (used for participant caps / telemetry). */
  getPeerCount(): number {
    return this.peers.size;
  }

  /**
   * Acquire local camera/microphone once. Video failure falls back to audio
   * only. This method never calls getUserMedia twice while a stream exists.
   */
  async initLocalMedia(streamType: 'video' | 'audio'): Promise<MediaStream | null> {
    if (this.localStream) return this.localStream;
    if (this.closed) return null;

    const wantVideo = streamType === 'video';
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantVideo ? { width: { ideal: 720 }, height: { ideal: 1280 } } : false,
      });
    } catch (error) {
      if (!wantVideo) throw error;
      // Video permission denied — fall back to audio-only rather than failing.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    this.localStream = stream;
    this.videoEnabled = stream.getVideoTracks().length > 0;
    this.audioEnabled = stream.getAudioTracks().length > 0;

    // Add the new local tracks to every peer that already exists and renegotiate.
    for (const peerId of Array.from(this.peers.keys())) {
      const entry = this.peers.get(peerId);
      if (!entry) continue;
      for (const track of stream.getTracks()) {
        try {
          entry.pc.addTrack(track, stream);
        } catch {
          // Track may already be attached; safe to ignore.
        }
      }
      await this.negotiate(peerId, 'renegotiate');
    }
    return stream;
  }

  /** Ensure exactly one RTCPeerConnection exists for a remote user. */
  async ensurePeer(remoteUserId: string): Promise<RTCPeerConnection> {
    if (remoteUserId === this.options.localUserId) throw new Error('cannot peer with self');
    const existing = this.peers.get(remoteUserId);
    if (existing) return existing.pc;
    if (this.closed) throw new Error('peer manager is closed');

    const pc = new RTCPeerConnection({ iceServers: getLiveIceServers(), bundlePolicy: 'max-bundle' });
    const polite = this.options.localUserId.localeCompare(remoteUserId) < 0;
    const entry: PeerEntry = {
      pc,
      stream: new MediaStream(),
      polite,
      makingOffer: false,
      ignoreOffer: false,
      offered: false,
      lastState: 'new',
    };
    this.peers.set(remoteUserId, entry);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.options.onSignal({
        id: newId(),
        sessionId: this.options.sessionId,
        toUserId: remoteUserId,
        type: 'ice-candidate',
        candidate: {
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          candidate: event.candidate.candidate,
          usernameFragment: (event.candidate as RTCIceCandidate & { usernameFragment?: string }).usernameFragment ?? null,
        },
      });
    };

    pc.ontrack = (event) => {
      // event.streams[0] may contain all sender tracks; add each track once.
      for (const track of event.track ? [event.track] : []) {
        if (!entry.stream.getTracks().includes(track)) entry.stream.addTrack(track);
      }
      this.emitRemoteStreams();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      entry.lastState = state;
      this.options.onPeerStateChange?.(remoteUserId, state);
      const worst = Array.from(this.peers.values()).some((p) => p.pc.connectionState === 'failed')
        ? 'failed'
        : Array.from(this.peers.values()).some((p) => p.pc.connectionState === 'connecting')
          ? 'connecting'
          : Array.from(this.peers.values()).every((p) => p.pc.connectionState === 'connected')
            ? 'connected'
            : state;
      this.options.onConnectionStateChange(worst);

      if (state === 'failed') {
        // ICE restart on failure; the client is notified so it can surface it.
        this.options.onIceRestart?.(remoteUserId);
        this.restartIce(remoteUserId).catch(() => { /* best effort */ });
      }
      if (state === 'closed') {
        this.peers.delete(remoteUserId);
        this.emitRemoteStreams();
      }
    };

    // Perfect negotiation: only the impolite peer auto-offers on negotiation
    // needed, reducing glare. The polite peer still handles collisions.
    pc.onnegotiationneeded = async () => {
      if (polite && entry.makingOffer) return;
      await this.negotiate(remoteUserId, 'renegotiate');
    };

    this.emitRemoteStreams();
    return pc;
  }

  /**
   * Create/send the initial SDP offer for a peer. Idempotent: both the REST
   * join event and the WebSocket join event may announce the same newcomer.
   */
  async offerTo(remoteUserId: string): Promise<void> {
    const entry = this.peers.get(remoteUserId);
    if (entry?.offered) return;
    await this.ensurePeer(remoteUserId);
    const current = this.peers.get(remoteUserId);
    if (!current || current.offered) return;
    current.offered = true;
    await this.negotiate(remoteUserId, 'offer');
  }

  private async negotiate(remoteUserId: string, type: 'offer' | 'renegotiate' | 'ice-restart'): Promise<void> {
    const entry = this.peers.get(remoteUserId);
    if (!entry || this.closed) return;
    try {
      entry.makingOffer = true;
      if (type === 'ice-restart') {
        await entry.pc.setLocalDescription({ type: 'offer', iceRestart: true } as RTCSessionDescriptionInit);
      } else {
        await entry.pc.setLocalDescription();
      }
      const description = entry.pc.localDescription;
      if (description) {
        this.options.onSignal({
          id: newId(),
          sessionId: this.options.sessionId,
          toUserId: remoteUserId,
          type,
          sdp: description.sdp,
        });
      }
    } finally {
      entry.makingOffer = false;
    }
  }

  /** Restart ICE for one peer or all peers. */
  async restartIce(remoteUserId?: string): Promise<void> {
    const targets = remoteUserId ? [remoteUserId] : Array.from(this.peers.keys());
    for (const id of targets) {
      await this.negotiate(id, 'ice-restart');
    }
  }

  /** Consume an inbound signaling message. */
  async handleSignal(message: InboundP2PSignal): Promise<void> {
    if (this.closed) return;
    const from = message.fromUserId;
    if (!from || from === this.options.localUserId) return;

    if (message.type === 'ice-candidate') {
      const entry = this.peers.get(from);
      if (!entry || !message.candidate) return;
      try {
        await entry.pc.addIceCandidate(message.candidate as RTCIceCandidateInit);
      } catch (error) {
        if (!entry.ignoreOffer) throw error;
        // Ignore stray candidates from an offer we rejected (glare).
      }
      return;
    }

    if (message.type === 'offer' || message.type === 'renegotiate' || message.type === 'ice-restart') {
      if (!message.sdp) return;
      await this.ensurePeer(from);
      const entry = this.peers.get(from);
      if (!entry) return;
      const offerCollision = entry.makingOffer || entry.pc.signalingState !== 'stable';
      entry.ignoreOffer = !entry.polite && offerCollision;
      if (entry.ignoreOffer) return;
      entry.offered = true; // we answered; do not also offer on a later join event

      await entry.pc.setRemoteDescription({ type: 'offer', sdp: message.sdp });
      await entry.pc.setLocalDescription();
      const answer = entry.pc.localDescription;
      if (answer) {
        this.options.onSignal({
          id: newId(),
          sessionId: this.options.sessionId,
          toUserId: from,
          type: 'answer',
          sdp: answer.sdp,
        });
      }
      return;
    }

    if (message.type === 'answer') {
      const entry = this.peers.get(from);
      if (!entry || !message.sdp || entry.pc.signalingState !== 'have-local-offer') return;
      await entry.pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
      return;
    }
  }

  /** Toggling tracks does not require renegotiation in modern WebRTC. */
  setMuted(muted: boolean): void {
    this.audioEnabled = !muted;
    this.localStream?.getAudioTracks().forEach((track) => { track.enabled = this.audioEnabled; });
  }

  setVideoEnabled(enabled: boolean): void {
    this.videoEnabled = enabled;
    this.localStream?.getVideoTracks().forEach((track) => { track.enabled = this.videoEnabled; });
  }

  /** Replace the camera track and renegotiate every peer. */
  async switchCamera(deviceId: string): Promise<void> {
    if (!this.localStream) return;
    const old = this.localStream.getVideoTracks()[0];
    const replacement = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }, audio: false,
    });
    const track = replacement.getVideoTracks()[0];
    if (!track) return;
    if (old) {
      old.stop();
      this.localStream.removeTrack(old);
    }
    track.enabled = this.videoEnabled;
    this.localStream.addTrack(track);
    for (const [peerId, entry] of this.peers) {
      const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      else entry.pc.addTrack(track, this.localStream);
    }
    await Promise.all(Array.from(this.peers.keys()).map((id) => this.negotiate(id, 'renegotiate')));
  }

  /** Replace the microphone track and renegotiate every peer. */
  async switchMicrophone(deviceId: string): Promise<void> {
    if (!this.localStream) return;
    const old = this.localStream.getAudioTracks()[0];
    const replacement = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } }, video: false,
    });
    const track = replacement.getAudioTracks()[0];
    if (!track) return;
    if (old) {
      old.stop();
      this.localStream.removeTrack(old);
    }
    track.enabled = this.audioEnabled;
    this.localStream.addTrack(track);
    for (const entry of this.peers.values()) {
      const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(track);
      else entry.pc.addTrack(track, this.localStream);
    }
    await Promise.all(Array.from(this.peers.keys()).map((id) => this.negotiate(id, 'renegotiate')));
  }

  /** Remove a participant's peer connection and tracks on leave. */
  removePeer(remoteUserId: string): void {
    const entry = this.peers.get(remoteUserId);
    if (!entry) return;
    try { entry.pc.close(); } catch { /* ignore */ }
    for (const track of entry.stream.getTracks()) {
      try { track.stop(); } catch { /* ignore */ }
    }
    this.peers.delete(remoteUserId);
    this.emitRemoteStreams();
    this.options.onConnectionStateChange(this.peers.size === 0 ? 'new' : 'connected');
  }

  private emitRemoteStreams(): void {
    const streams = new Map<string, MediaStream>();
    for (const [id, entry] of this.peers) streams.set(id, entry.stream);
    this.options.onRemoteStreamsChange(streams);
  }

  /** Full teardown: stop local media and close every peer connection. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.peers.values()) {
      try { entry.pc.close(); } catch { /* ignore */ }
      for (const track of entry.stream.getTracks()) {
        try { track.stop(); } catch { /* ignore */ }
      }
    }
    this.peers.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
      });
      this.localStream = null;
    }
    this.emitRemoteStreams();
  }
}
