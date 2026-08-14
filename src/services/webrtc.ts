// WebRTC Service for handling peer connections
// Uses public Google STUN servers plus a TURN relay (served by the gateway's
// /api/realtime/ice-servers endpoint) with ICE restart capability.

import { gateway } from '@/lib/gateway';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

function getToken(): string | null {
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

const ICE_CACHE_TTL = 5 * 60 * 1000;
let iceServersCache: Promise<RTCIceServer[]> | null = null;
let iceServersCachedAt = 0;

function loadIceServers(): Promise<RTCIceServer[]> {
  if (iceServersCache && Date.now() - iceServersCachedAt < ICE_CACHE_TTL) {
    return iceServersCache;
  }

  iceServersCache = (async () => {
    if (!GATEWAY_URL) return DEFAULT_ICE_SERVERS;
    try {
      let token = getToken();
      let res = await fetch(`${GATEWAY_URL}/api/realtime/ice-servers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status === 401) {
        await gateway.auth.refreshSession();
        token = getToken();
        res = await fetch(`${GATEWAY_URL}/api/realtime/ice-servers`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      }

      if (!res.ok) throw new Error(`ICE config failed (${res.status})`);
      const json = await res.json();
      if (Array.isArray(json?.iceServers) && json.iceServers.length > 0) {
        iceServersCachedAt = Date.now();
        return json.iceServers as RTCIceServer[];
      }
      throw new Error('ICE config returned no servers');
    } catch {
      // Never cache a failure: retry on the next call instead of staying on
      // STUN-only for the whole session (which breaks symmetric-NAT users).
      iceServersCache = null;
      return DEFAULT_ICE_SERVERS;
    }
  })();

  return iceServersCache;
}

export type CallType = 'voice' | 'video';

export interface CallSignal {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accepted' | 'call-rejected' | 'call-ended' | 'call-busy';
  from: string;
  to: string;
  callType: CallType;
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit | null;
  callerInfo?: {
    id: string;
    username: string;
    displayName: string;
    profilePic?: string;
  };
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  
  private onRemoteStream: ((stream: MediaStream) => void) | null = null;
  private onIceCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null;
  private onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;
  
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;

  constructor() {
    // Peer connection is created lazily (on first media/negotiation call) so
    // it can use the ICE/TURN config fetched from the gateway.
  }

  private async ensurePeerConnection(): Promise<RTCPeerConnection> {
    if (this.peerConnection) return this.peerConnection;
    const iceServers = await loadIceServers();
    this.createPeerConnection(iceServers);
    return this.peerConnection!;
  }

  private createPeerConnection(iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS) {
    console.log('[WebRTC] Creating peer connection');
    this.peerConnection = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
    });
    
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        console.log('[WebRTC] ICE candidate generated');
        this.onIceCandidate(event.candidate.toJSON());
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('[WebRTC] ICE connection state:', state);
      
      // Handle ICE connection failures
      if (state === 'failed') {
        console.log('[WebRTC] ICE connection failed, attempting restart...');
        this.restartIce().catch(console.error);
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state:', this.peerConnection?.iceGatheringState);
    };

    this.peerConnection.onsignalingstatechange = () => {
      console.log('[WebRTC] Signaling state:', this.peerConnection?.signalingState);
    };

    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Track received:', event.track.kind);
      if (event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (this.onRemoteStream) {
          this.onRemoteStream(event.streams[0]);
        }
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('[WebRTC] Connection state:', state);
      if (this.peerConnection && this.onConnectionStateChange && state) {
        this.onConnectionStateChange(state);
      }
    };

    this.peerConnection.onnegotiationneeded = () => {
      console.log('[WebRTC] Negotiation needed');
    };
  }

  setOnRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStream = callback;
  }

  setOnIceCandidate(callback: (candidate: RTCIceCandidateInit) => void) {
    this.onIceCandidate = callback;
  }

  setOnConnectionStateChange(callback: (state: RTCPeerConnectionState) => void) {
    this.onConnectionStateChange = callback;
  }

  async getLocalStream(callType: CallType): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: callType === 'video' ? { 
        width: { ideal: 1280, max: 1920 }, 
        height: { ideal: 720, max: 1080 }, 
        facingMode: 'user',
        frameRate: { ideal: 30, max: 60 },
      } : false,
    };

    try {
      console.log('[WebRTC] Requesting media with constraints:', constraints);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[WebRTC] Got local stream with tracks:', this.localStream.getTracks().map(t => t.kind));

      await this.ensurePeerConnection();
      if (!this.peerConnection) throw new Error('Peer connection not initialized');

      // Add tracks to peer connection
      this.localStream.getTracks().forEach((track) => {
        if (this.peerConnection && this.localStream) {
          console.log('[WebRTC] Adding track to peer connection:', track.kind);
          this.peerConnection.addTrack(track, this.localStream);
        }
      });

      return this.localStream;
    } catch (error) {
      console.error('[WebRTC] Error accessing media devices:', error);
      throw error;
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    await this.ensurePeerConnection();
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    console.log('[WebRTC] Creating offer');
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    
    console.log('[WebRTC] Setting local description (offer)');
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    await this.ensurePeerConnection();
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    console.log('[WebRTC] Creating answer');
    const answer = await this.peerConnection.createAnswer();
    console.log('[WebRTC] Setting local description (answer)');
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    await this.ensurePeerConnection();
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    console.log('[WebRTC] Setting remote description, type:', description.type);
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(description));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    await this.ensurePeerConnection();
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    // Check if we have a remote description set
    if (!this.peerConnection.remoteDescription) {
      console.warn('[WebRTC] Cannot add ICE candidate without remote description');
      throw new Error('Remote description not set');
    }

    try {
      console.log('[WebRTC] Adding ICE candidate');
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[WebRTC] Error adding ICE candidate:', error);
      throw error;
    }
  }

  async restartIce(): Promise<void> {
    await this.ensurePeerConnection();
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebRTC] Max reconnect attempts reached');
      throw new Error('Max reconnect attempts reached');
    }

    this.reconnectAttempts++;
    console.log('[WebRTC] Restarting ICE, attempt:', this.reconnectAttempts);

    try {
      this.peerConnection.restartIce();
      
      // Create new offer with ICE restart
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);
      
      console.log('[WebRTC] ICE restart initiated successfully');
    } catch (error) {
      console.error('[WebRTC] ICE restart failed:', error);
      throw error;
    }
  }

  toggleMute(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
        console.log('[WebRTC] Audio track enabled:', track.enabled);
      });
    }
  }

  toggleVideo(videoOff: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !videoOff;
        console.log('[WebRTC] Video track enabled:', track.enabled);
      });
    }
  }

  getLocalStream2(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getPeerConnection(): RTCPeerConnection | null {
    return this.peerConnection;
  }

  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null;
  }

  getSignalingState(): RTCSignalingState | null {
    return this.peerConnection?.signalingState || null;
  }

  hasRemoteDescription(): boolean {
    return this.peerConnection?.remoteDescription !== null && this.peerConnection?.remoteDescription !== undefined;
  }

  cleanup() {
    console.log('[WebRTC] Cleaning up');
    
    // Stop all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        console.log('[WebRTC] Stopped track:', track.kind);
      });
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.reconnectAttempts = 0;
    
    // Clear callbacks
    this.onRemoteStream = null;
    this.onIceCandidate = null;
    this.onConnectionStateChange = null;

    // Peer connection is recreated lazily on the next call via ensurePeerConnection.
  }
}

export const webrtcService = new WebRTCService();
