// Tone Live — MOCKED WEBRTC TESTS.
// These tests exercise the real LivePeerManager with a deterministic fake
// RTCPeerConnection. They are NOT real browser/media tests (see final report).
//
// Covers: one PC per peer, idempotent offers, offer/answer, ICE exchange,
// glare handling, STUN-only config, local media reuse and full cleanup.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LivePeerManager, getLiveIceServers, type LivePeerManagerOptions } from './liveP2P';

class FakeTrack {
  enabled = true;
  constructor(public readonly kind: 'audio' | 'video') {}
  stop(): void { this.enabled = false; }
}

class FakeMediaStream {
  private readonly tracks: FakeTrack[] = [];
  addTrack(track: FakeTrack): void { this.tracks.push(track); }
  removeTrack(track: FakeTrack): void {
    const idx = this.tracks.indexOf(track);
    if (idx >= 0) this.tracks.splice(idx, 1);
  }
  getTracks(): FakeTrack[] { return [...this.tracks]; }
  getVideoTracks(): FakeTrack[] { return this.tracks.filter((t) => t.kind === 'video'); }
  getAudioTracks(): FakeTrack[] { return this.tracks.filter((t) => t.kind === 'audio'); }
}

class FakeRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  addedIceCandidates: unknown[] = [];
  addedTracks: FakeTrack[] = [];
  iceRestartRequested = false;
  onicecandidate: ((event: { candidate: { sdpMid: string | null; sdpMLineIndex: number | null; candidate: string } | null }) => void) | null = null;
  ontrack: ((event: { track: FakeTrack }) => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  closed = false;

  constructor(public readonly configuration: RTCConfiguration) {}

  async setLocalDescription(desc?: RTCSessionDescriptionInit): Promise<void> {
    if (desc?.type === 'offer') {
      if ((desc as RTCSessionDescriptionInit & { iceRestart?: boolean }).iceRestart) {
        this.iceRestartRequested = true;
      }
      this.signalingState = 'have-local-offer';
      this.localDescription = { type: 'offer', sdp: desc.sdp ?? 'local-offer' } as RTCSessionDescription;
    } else {
      this.signalingState = 'stable';
      this.localDescription = { type: 'answer', sdp: 'local-answer' } as RTCSessionDescription;
    }
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc as RTCSessionDescription;
    this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
  }

  async addIceCandidate(candidate: unknown): Promise<void> {
    this.addedIceCandidates.push(candidate);
  }

  addTrack(track: FakeTrack): void { this.addedTracks.push(track); }
  getSenders(): Array<{ track: FakeTrack | null; replaceTrack: (t: FakeTrack) => Promise<void> }> {
    return this.addedTracks.map((track) => ({ track, replaceTrack: async () => {} }));
  }
  close(): void {
    this.closed = true;
    this.connectionState = 'closed';
    this.onconnectionstatechange?.();
  }
}

const createdConnections: FakeRTCPeerConnection[] = [];
let getUserMediaCalls = 0;

beforeEach(() => {
  createdConnections.length = 0;
  getUserMediaCalls = 0;
  (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
    class extends FakeRTCPeerConnection {
      constructor(config: RTCConfiguration) {
        super(config);
        createdConnections.push(this);
      }
    };
  (globalThis as unknown as { MediaStream: unknown }).MediaStream = FakeMediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => {
        getUserMediaCalls++;
        const stream = new FakeMediaStream();
        if (constraints.audio) stream.addTrack(new FakeTrack('audio'));
        if (constraints.video) stream.addTrack(new FakeTrack('video'));
        return stream;
      }),
      enumerateDevices: vi.fn(async () => []),
    },
  });
});

function makeManager(overrides: Partial<LivePeerManagerOptions> = {}) {
  const signals: Array<Record<string, unknown>> = [];
  const streams: Array<Map<string, MediaStream>> = [];
  const manager = new LivePeerManager({
    sessionId: 'session-1',
    localUserId: 'user-a',
    role: 'host',
    onSignal: (signal) => signals.push(signal as unknown as Record<string, unknown>),
    onRemoteStreamsChange: (map) => streams.push(map),
    onConnectionStateChange: () => {},
    ...overrides,
  });
  return { manager, signals, streams };
}

describe('Tone Live P2P engine (mocked WebRTC)', () => {
  it('uses STUN-only ICE configuration', () => {
    const servers = getLiveIceServers();
    expect(servers.length).toBeGreaterThan(0);
    expect(servers.every((s) => String(s.urls).startsWith('stun:'))).toBe(true);
    expect(servers.some((s) => String(s.urls).startsWith('turn:'))).toBe(false);
  });

  it('acquires local media once and reuses the same stream', async () => {
    const { manager } = makeManager();
    const first = await manager.initLocalMedia('video');
    const second = await manager.initLocalMedia('video');
    expect(first).toBe(second);
    expect(getUserMediaCalls).toBe(1);
    manager.close();
  });

  it('creates exactly one peer connection and one initial offer per remote peer', async () => {
    const { manager, signals } = makeManager();
    await manager.offerTo('user-b');
    await manager.offerTo('user-b'); // duplicate join events must not re-offer
    expect(createdConnections.length).toBe(1);
    const offers = signals.filter((s) => s.type === 'offer');
    expect(offers.length).toBe(1);
    expect(offers[0].toUserId).toBe('user-b');
    expect(offers[0].sessionId).toBe('session-1');
    manager.close();
  });

  it('answers an inbound offer and consumes ICE candidates', async () => {
    const { manager, signals } = makeManager();
    await manager.handleSignal({
      id: 'offer-1', sessionId: 'session-1', fromUserId: 'user-b',
      type: 'offer', sdp: 'remote-offer',
    });
    const answers = signals.filter((s) => s.type === 'answer');
    expect(answers.length).toBe(1);
    expect(answers[0].toUserId).toBe('user-b');

    await manager.handleSignal({
      id: 'ice-1', sessionId: 'session-1', fromUserId: 'user-b',
      type: 'ice-candidate',
      candidate: { sdpMid: '0', sdpMLineIndex: 0, candidate: 'candidate:1' },
    });
    expect(createdConnections[0].addedIceCandidates.length).toBe(1);
    manager.close();
  });

  it('ignores an offer collision on the impolite peer', async () => {
    // 'user-b' > 'user-a', so this manager is impolite and must ignore glare.
    const { manager, signals } = makeManager({ localUserId: 'user-b' });
    await manager.offerTo('user-a');
    createdConnections[0].signalingState = 'have-local-offer';
    await manager.handleSignal({
      id: 'offer-2', sessionId: 'session-1', fromUserId: 'user-a',
      type: 'offer', sdp: 'glare-offer',
    });
    expect(signals.filter((s) => s.type === 'answer').length).toBe(0);
    manager.close();
  });

  it('queues early ICE candidates and emits them once remote SDP arrives', async () => {
    const { manager, signals } = makeManager();
    await manager.offerTo('user-b');
    createdConnections[0].onicecandidate?.({
      candidate: { sdpMid: '0', sdpMLineIndex: 0, candidate: 'candidate:host' },
    });
    // No remote SDP yet: the candidate must not be applied by the peer.
    expect(signals.filter((s) => s.type === 'ice-candidate')).toHaveLength(0);

    createdConnections[0].signalingState = 'have-local-offer';
    await manager.handleSignal({
      id: 'answer-1', sessionId: 'session-1', fromUserId: 'user-b',
      type: 'answer', sdp: 'remote-answer',
    });
    const candidates = signals.filter((s) => s.type === 'ice-candidate');
    expect(candidates.length).toBe(1);
    expect(candidates[0].candidate).toMatchObject({ sdpMid: '0', candidate: 'candidate:host' });
    manager.close();
  });

  it('supports multiple participants without duplicate peer connections', async () => {
    const { manager, signals } = makeManager();
    await Promise.all(['user-b', 'user-c', 'user-d'].map((id) => manager.offerTo(id)));
    await manager.offerTo('user-b');
    expect(createdConnections.length).toBe(3);
    expect(manager.getPeerCount()).toBe(3);
    expect(signals.filter((s) => s.type === 'offer').length).toBe(3);
    manager.close();
  });

  it('subscribes remote tracks and publishes stream updates', async () => {
    const { manager, streams } = makeManager();
    await manager.offerTo('user-b');
    const remoteTrack = new FakeTrack('video');
    createdConnections[0].ontrack?.({ track: remoteTrack });
    const latest = streams[streams.length - 1];
    expect(latest.get('user-b')?.getTracks()).toContain(remoteTrack);
    expect(manager.getCombinedRemoteStream()?.getTracks()).toContain(remoteTrack);
    manager.close();
  });

  it('supports audio-only initialization and mute/video toggles', async () => {
    const { manager } = makeManager();
    const stream = await manager.initLocalMedia('audio');
    expect(stream?.getVideoTracks().length).toBe(0);
    const audio = (stream as unknown as FakeMediaStream).getAudioTracks()[0];
    manager.setMuted(true);
    expect(audio.enabled).toBe(false);
    manager.setMuted(false);
    expect(audio.enabled).toBe(true);
    // No video track exists in audio-only mode; toggling must not throw.
    expect(() => manager.setVideoEnabled(false)).not.toThrow();
    manager.close();
  });

  it('replaces camera and microphone tracks and renegotiates', async () => {
    const { manager, signals } = makeManager();
    const local = await manager.initLocalMedia('video');
    expect(local?.getVideoTracks().length).toBe(1);
    expect(local?.getAudioTracks().length).toBe(1);
    await manager.offerTo('user-b');
    await manager.switchCamera('camera-2');
    await manager.switchMicrophone('mic-2');
    expect(local?.getVideoTracks()[0].enabled).toBe(true);
    expect(local?.getAudioTracks()[0].enabled).toBe(true);
    expect(signals.filter((s) => s.type === 'renegotiate').length).toBeGreaterThanOrEqual(2);
    manager.close();
  });

  it('performs an ICE restart with the correct SDP flag', async () => {
    const { manager, signals } = makeManager();
    await manager.offerTo('user-b');
    await manager.restartIce('user-b');
    expect(createdConnections[0].iceRestartRequested).toBe(true);
    expect(signals.filter((s) => s.type === 'ice-restart').length).toBe(1);
    manager.close();
  });

  it('closes peers and stops tracks on leave and full teardown', async () => {
    const { manager } = makeManager();
    const local = await manager.initLocalMedia('video');
    await manager.offerTo('user-b');
    const tracks = (local as unknown as FakeMediaStream).getTracks();
    manager.removePeer('user-b');
    expect(createdConnections[0].closed).toBe(true);
    expect(manager.getPeerCount()).toBe(0);
    manager.close();
    expect(tracks.every((t) => !t.enabled)).toBe(true);
  });
});
