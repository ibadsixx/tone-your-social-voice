// Browser-side harness for the real-browser Tone Live P2P test.
// It uses the production LivePeerManager and LiveSignalingClient modules, but
// replaces only the Gateway with the test double in mock-signaling-server.mjs.

import {
  LivePeerManager,
  type InboundP2PSignal,
} from '../src/services/liveP2P';
import { LiveSignalingClient } from '../src/services/liveSignalingClient';

interface HarnessStatus {
  userId: string;
  sessionId: string;
  signaling: string;
  connection: string;
  localTracks: number;
  remoteTracks: number;
  peers: number;
  peerStates: Record<string, string>;
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
const gatewayUrl = params.get('gateway') || window.location.origin;

const status: HarnessStatus = {
  userId,
  sessionId,
  signaling: 'idle',
  connection: 'new',
  localTracks: 0,
  remoteTracks: 0,
  peers: 0,
  peerStates: {},
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

let manager: LivePeerManager | null = null;
let signaling: LiveSignalingClient | null = null;

async function handleMessage(message: InboundP2PSignal): Promise<void> {
  status.inbound++;
  if (!manager || message.fromUserId === userId) return;

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
    role: 'host',
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

  const local = await manager.initLocalMedia('audio');
  status.localTracks = local?.getTracks().length ?? 0;
  render();

  signaling = new LiveSignalingClient({
    gatewayUrl,
    sessionId,
    getAuthToken: () => userId,
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
