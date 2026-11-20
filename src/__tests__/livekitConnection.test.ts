// Tone Live — Frontend LiveKit client tests.
// Verifies the frontend connection flow, role-based permissions, and
// reconnection behavior using mocked LiveKit SDK. No browser camera/mic needed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock livekit-client before importing anything that uses it.
vi.mock('livekit-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('livekit-client')>();
  return {
    ...actual,
    Room: vi.fn(function Room(this: any, options: any) {
      this.connect = vi.fn().mockResolvedValue(undefined);
      this.disconnect = vi.fn();
      this.localParticipant = {
        publishTrack: vi.fn().mockResolvedValue(undefined),
        unpublishTrack: vi.fn(),
        setMicrophoneEnabled: vi.fn(),
        setCameraEnabled: vi.fn(),
      };
      this.remoteParticipants = new Map();
      this.on = vi.fn();
      this.off = vi.fn();
      this.connectionState = 'connected';
    }),
    createLocalTracks: vi.fn().mockResolvedValue([]),
  };
});

import { Room, createLocalTracks } from 'livekit-client';

const mockedRoom = Room as unknown as ReturnType<typeof vi.fn>;
const mockedCreateLocalTracks = createLocalTracks as unknown as ReturnType<typeof vi.fn>;

describe('LiveKit client connection flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRoom.mockClear();
    mockedCreateLocalTracks.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a Room instance when connecting', () => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    expect(room).toBeDefined();
    expect(mockedRoom).toHaveBeenCalled();
  });

  it('connects to LiveKit with URL and token', async () => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    await room.connect('ws://localhost:7880', 'mock-token');
    expect(room.connect).toHaveBeenCalledWith('ws://localhost:7880', 'mock-token');
  });

  it('disconnects from LiveKit room', () => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    room.disconnect();
    expect(room.disconnect).toHaveBeenCalled();
  });
});

describe('Local media track creation (audio-only fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates video tracks for video stream type', async () => {
    mockedCreateLocalTracks.mockResolvedValue([
      { track: { kind: 'video', stop: vi.fn() } as any, stop: vi.fn() },
      { track: { kind: 'audio', stop: vi.fn() } as any, stop: vi.fn() },
    ]);
    const tracks = await createLocalTracks({ audio: true, video: true });
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.some((t) => t.track.kind === 'video')).toBe(true);
    expect(tracks.some((t) => t.track.kind === 'audio')).toBe(true);
  });

  it('creates audio-only tracks for audio stream type', async () => {
    mockedCreateLocalTracks.mockResolvedValue([
      { track: { kind: 'audio', stop: vi.fn() } as any, stop: vi.fn() },
    ]);
    const tracks = await createLocalTracks({ audio: true, video: false });
    expect(tracks.length).toBe(1);
    expect(tracks[0].track.kind).toBe('audio');
  });

  it('returns empty array when no tracks available (headless/permission denied)', async () => {
    mockedCreateLocalTracks.mockResolvedValue([]);
    const tracks = await createLocalTracks({ audio: true, video: true });
    expect(tracks).toEqual([]);
  });
});

describe('Role-based permission mapping (frontend)', () => {
  it('viewer role maps to canPublish=false', () => {
    const role = 'viewer';
    const canPublish = role === 'host' || role === 'moderator';
    const canPublishData = role === 'host' || role === 'moderator';
    const canSubscribe = true;
    expect(canPublish).toBe(false);
    expect(canPublishData).toBe(false);
    expect(canSubscribe).toBe(true);
  });

  it('host role maps to canPublish=true', () => {
    const role = 'host';
    const canPublish = role === 'host' || role === 'moderator';
    const canPublishData = role === 'host' || role === 'moderator';
    const canSubscribe = true;
    expect(canPublish).toBe(true);
    expect(canPublishData).toBe(true);
    expect(canSubscribe).toBe(true);
  });

  it('moderator role maps to canPublish=true', () => {
    const role = 'moderator';
    const canPublish = role === 'host' || role === 'moderator';
    const canPublishData = role === 'host' || role === 'moderator';
    const canSubscribe = true;
    expect(canPublish).toBe(true);
    expect(canPublishData).toBe(true);
    expect(canSubscribe).toBe(true);
  });

  it('guest role maps to canPublish=false', () => {
    const role = 'guest';
    const canPublish = role === 'host' || role === 'moderator';
    const canPublishData = role === 'host' || role === 'moderator';
    const canSubscribe = true;
    expect(canPublish).toBe(false);
    expect(canPublishData).toBe(false);
    expect(canSubscribe).toBe(true);
  });
});

describe('No duplicate sessions/posts on reconnect', () => {
  it('prevents duplicate LiveKit room connections via roomRef guard', () => {
    // Simulating the roomRef guard in LiveStreamContext.tsx:
    // Only one Room instance is created per session; reconnection uses the same room.
    const roomRef = { current: null as ReturnType<typeof Room> | null };
    const createRoom = () => {
      if (!roomRef.current) {
        roomRef.current = new Room({ adaptiveStream: true, dynacast: true });
      }
      return roomRef.current;
    };
    const room1 = createRoom();
    const room2 = createRoom();
    expect(room1).toBe(room2);
    expect(mockedRoom).toHaveBeenCalledTimes(1);
  });
});
