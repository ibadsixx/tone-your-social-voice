// Browser-side harness for the real-browser Tone Live P2P test.
// It uses the production LivePeerManager and LiveSignalingClient modules, but
// replaces only the Edge Function transport with the test double in mock-signaling-server.mjs.

import {
  LivePeerManager,
  type InboundP2PSignal,
} from '../src/services/liveP2P';
import { LiveSignalingClient } from '../src/services/liveSignalingClient';

interface CandidatePairInfo {
  localType: string;
  remoteType: string;
  state: string;
  nominated: boolean;
}

interface HarnessStatus {
  userId: string;
  sessionId: string;
  signaling: string;
  connection: string;
  localTracks: number;
  remoteTracks: number;
  peers: number;
  peerStates: Record<string, string>;
  candidatePairs: CandidatePairInfo[];
  localAudioEnabled: boolean;
  localVideoEnabled: boolean;
  sessionEnded: boolean;
  inbound: number;
  outbound: number;
  offers: number;
  answers: number;
  ice: number;
  error: string | null;
}

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('session') || 'p2p-e2e-session';
const userId = params.get('user') || 'unknown-user';
const edgeBaseUrl = params.get('edgeBaseUrl') || window.location.origin;
const media = params.get('media') === 'video' ? 'video' : 'audio';
const role = (params.get('role') || 'host') as 'host' | 'moderator' | 'guest' | 'viewer';
const injectedAuthToken = (window as unknown as { __phase5AuthToken?: string }).__phase5AuthToken;

const status: HarnessStatus = {
  userId,
  sessionId,
  signaling: 'idle',
  connection: 'new',
  localTracks: 0,
  remoteTracks: 0,
  peers: 0,
  peerStates: {},
  candidatePairs: [],
  localAudioEnabled: false,
  localVideoEnabled: false,
  sessionEnded: false,
  inbound: 0,
  outbound: 0,
  offers: 0,
  answers: 0,
  ice: 0,
  error: null,
};
(window as unknown as { __p2pStatus: HarnessStatus }).__p2pStatus = status;

function render() {
  const el = document.getElementById('status');
  if (el) el.textContent = JSON.stringify(status, null, 2);
}

// Test-only instrumentation: capture the RTCPeerConnection instances the
// production manager creates so getStats() can report the selected candidate
// pair type. No production code is changed.
const NativeRTCPeerConnection = window.RTCPeerConnection;
const trackedConnections = new Set<RTCPeerConnection>();
class TrackedRTCPeerConnection extends NativeRTCPeerConnection {
  constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
    super(...args);
    trackedConnections.add(this);
  }
}
window.RTCPeerConnection = TrackedRTCPeerConnection as unknown as typeof RTCPeerConnection;

async function sampleCandidatePairs(): Promise<void> {
  const pairs: CandidatePairInfo[] = [];
  for (const pc of trackedConnections) {
    if (pc.connectionState === 'closed') continue;
    try {
      const stats = await pc.getStats();
      let selected: Record<string, unknown> | null = null;
      stats.forEach((report) => {
        const value = report as unknown as Record<string, unknown>;
        if (value.type === 'candidate-pair' && value.state === 'succeeded' && value.nominated === true) {
          selected = value;
        }
      });
      if (!selected) continue;
      const chosen = selected as Record<string, unknown>;
      const local = stats.get(String(chosen.localCandidateId)) as unknown as Record<string, unknown> | undefined;
      const remote = stats.get(String(chosen.remoteCandidateId)) as unknown as Record<string, unknown> | undefined;
      pairs.push({
        localType: String(local?.candidateType ?? 'unknown'),
        remoteType: String(remote?.candidateType ?? 'unknown'),
        state: String(chosen.state ?? 'unknown'),
        nominated: chosen.nominated === true,
      });
    } catch {
      // Stats may be briefly unavailable during teardown; next sample will retry.
    }
  }
  status.candidatePairs = pairs;
  render();
}
setInterval(() => { void sampleCandidatePairs(); }, 500);

function syncLocalState(): void {
  const stream = manager?.getLocalStream();
  status.localAudioEnabled = Boolean(stream?.getAudioTracks().some((track) => track.enabled));
  status.localVideoEnabled = Boolean(stream?.getVideoTracks().some((track) => track.enabled));
  render();
}

(window as unknown as {
  __phase5Actions: {
    setMuted: (muted: boolean) => void;
    setVideoEnabled: (enabled: boolean) => void;
    leave: () => void;
  };
}).__phase5Actions = {
  setMuted: (muted) => { manager?.setMuted(muted); syncLocalState(); },
  setVideoEnabled: (enabled) => { manager?.setVideoEnabled(enabled); syncLocalState(); },
  leave: () => {
    signaling?.close();
    manager?.close();
    status.signaling = 'closed';
    status.connection = 'closed';
    render();
  },
};

let manager: LivePeerManager | null = null;
let signaling: LiveSignalingClient | null = null;

async function handleMessage(message: InboundP2PSignal): Promise<void> {
  status.inbound++;
  if (!manager || message.fromUserId === userId) return;

  if (message.type === 'session-ended') {
    status.sessionEnded = true;
    render();
    return;
  }

  if (message.type === 'join') {
    // Deterministic single offer per pair; perfect negotiation stays as backstop.
    if (userId.localeCompare(message.fromUserId) < 0) {
      await manager.offerTo(message.fromUserId);
      status.offers++;
    }
  } else if (message.type === 'leave') {
    manager.removePeer(message.state?.targetUserId ?? message.fromUserId);
  } else if (
    message.type === 'offer' ||
    message.type === 'answer' ||
    message.type === 'ice-candidate' ||
    message.type === 'renegotiate' ||
    message.type === 'ice-restart'
  ) {
    if (message.type === 'offer') status.offers++;
    if (message.type === 'answer') status.answers++;
    if (message.type === 'ice-candidate') status.ice++;
    await manager.handleSignal(message);
  }
  status.peers = manager.getPeerCount();
  render();
}

async function start(): Promise<void> {
  manager = new LivePeerManager({
    sessionId,
    localUserId: userId,
    role,
    onSignal: (signal) => {
      status.outbound++;
      signaling?.send(signal);
    },
    onRemoteStreamsChange: (streams) => {
      status.remoteTracks = Array.from(streams.values()).reduce(
        (total, stream) => total + stream.getTracks().length,
        0,
      );
      render();
    },
    onConnectionStateChange: (connection) => {
      status.connection = String(connection);
      render();
    },
    onPeerStateChange: (peerId, peerState) => {
      status.peerStates[peerId] = String(peerState);
      render();
    },
  });

  const local = await manager.initLocalMedia(media);
  status.localTracks = local?.getTracks().length ?? 0;
  syncLocalState();

  signaling = new LiveSignalingClient({
    edgeBaseUrl,
    sessionId,
    getAuthToken: () => injectedAuthToken || userId,
    onMessage: (message) => {
      void handleMessage(message).catch((error: Error) => {
        status.error = error.message;
        render();
      });
    },
    onConnectionStateChange: (connection) => {
      status.signaling = connection;
      render();
    },
  });
  await signaling.connect();
  render();
}

start().catch((error: Error) => {
  status.error = error.message;
  render();
});
