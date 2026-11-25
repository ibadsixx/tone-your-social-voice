// Real-browser Tone Live P2P verification.
// Two and three independent Chromium contexts acquire real (fake-device)
// microphone media, exchange SDP/ICE through a local signaling double, and
// establish real RTCPeerConnection media channels. This test does NOT assert
// production Edge Function behavior; those Functions have their own sources.

import { expect, test, type Browser, type Page } from '@playwright/test';

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

const MOCK_EDGE_BASE = 'http://127.0.0.1:8787';

function harnessUrl(session: string, user: string, media: 'audio' | 'video' = 'audio'): string {
  const params = new URLSearchParams({ session, user, edgeBaseUrl: MOCK_EDGE_BASE });
  if (media === 'video') params.set('media', 'video');
  return `/e2e/live-p2p-harness.html?${params.toString()}`;
}

function status(page: Page): Promise<HarnessStatus> {
  return page.evaluate(() => (window as unknown as { __p2pStatus: HarnessStatus }).__p2pStatus);
}

async function openParticipant(
  browser: Browser,
  session: string,
  user: string,
  media: 'audio' | 'video' = 'audio',
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(harnessUrl(session, user, media), { waitUntil: 'domcontentloaded' });
  await expect.poll(() => status(page), { message: `${user}: harness started` })
    .not.toBeUndefined();
  return page;
}

async function expectConnected(page: Page, user: string, expectedPeers: number): Promise<void> {
  await expect.poll(async () => (await status(page)).signaling, {
    message: `${user}: signaling connected`,
  }).toBe('connected');

  await expect.poll(async () => (await status(page)).localTracks, {
    message: `${user}: local media acquired`,
  }).toBeGreaterThan(0);

  await expect.poll(async () => (await status(page)).peers, {
    message: `${user}: peer count`,
  }).toBe(expectedPeers);

  await expect.poll(async () => {
    const s = await status(page);
    return Object.values(s.peerStates).filter((state) => state === 'connected').length;
  }, { message: `${user}: connected RTCPeerConnections` }).toBe(expectedPeers);

  await expect.poll(async () => (await status(page)).remoteTracks, {
    message: `${user}: remote tracks`,
  }).toBeGreaterThanOrEqual(1);

  await expect.poll(async () => {
    const s = await status(page);
    return s.candidatePairs.filter((pair) => pair.state === 'succeeded' && pair.nominated).length;
  }, { message: `${user}: selected ICE candidate pairs` }).toBe(expectedPeers);
}

test.describe('Tone Live real-browser P2P', () => {
  test('two independent browser sessions negotiate and connect media', async ({ browser }) => {
    const session = `p2p-2-${Date.now()}`;
    const alice = await openParticipant(browser, session, 'user-alice');
    const bob = await openParticipant(browser, session, 'user-bob');

    await expectConnected(alice, 'user-alice', 1);
    await expectConnected(bob, 'user-bob', 1);

    const states = await Promise.all([status(alice), status(bob)]);
    states.forEach((s, index) => {
      const user = index === 0 ? 'user-alice' : 'user-bob';
      console.log(`${user}:`, JSON.stringify(s));
      expect(s.error).toBeNull();
      expect(s.candidatePairs.length).toBeGreaterThanOrEqual(1);
      expect(s.candidatePairs.every((p) => p.localType !== 'relay' && p.remoteType !== 'relay')).toBe(true);
      expect(s.inbound).toBeGreaterThan(0);
      expect(s.outbound).toBeGreaterThan(0);
    });
    expect(states.reduce((n, s) => n + s.offers, 0)).toBeGreaterThanOrEqual(1);
    expect(states.reduce((n, s) => n + s.answers, 0)).toBeGreaterThanOrEqual(1);
    expect(states.reduce((n, s) => n + s.ice, 0)).toBeGreaterThanOrEqual(1);
  });

  test('three independent browser sessions form a full mesh', async ({ browser }) => {
    const session = `p2p-3-${Date.now()}`;
    const alice = await openParticipant(browser, session, 'mesh-alice');
    const bob = await openParticipant(browser, session, 'mesh-bob');
    const carol = await openParticipant(browser, session, 'mesh-carol');

    await Promise.all(
      [alice, bob, carol].map((page) =>
        expect.poll(async () => (await status(page)).peers, { message: 'mesh peer count' }).toBe(2),
      ),
    );
    await expectConnected(alice, 'mesh-alice', 2);
    await expectConnected(bob, 'mesh-bob', 2);
    await expectConnected(carol, 'mesh-carol', 2);

    const states = await Promise.all([status(alice), status(bob), status(carol)]);
    states.forEach((s, index) => {
      const user = ['mesh-alice', 'mesh-bob', 'mesh-carol'][index];
      console.log(`${user}:`, JSON.stringify(s));
      expect(s.error).toBeNull();
      expect(s.candidatePairs.length).toBeGreaterThanOrEqual(2);
      expect(s.candidatePairs.every((p) => p.localType !== 'relay' && p.remoteType !== 'relay')).toBe(true);
      expect(s.remoteTracks).toBeGreaterThanOrEqual(2);
    });
    expect(states.reduce((n, s) => n + s.offers, 0)).toBeGreaterThanOrEqual(3);
    expect(states.reduce((n, s) => n + s.answers, 0)).toBeGreaterThanOrEqual(3);
    expect(states.reduce((n, s) => n + s.ice, 0)).toBeGreaterThanOrEqual(3);
  });

  test('device toggles, participant leave, and host end are observed in browsers', async ({ browser }) => {
    const session = `p2p-lifecycle-${Date.now()}`;
    const alice = await openParticipant(browser, session, 'life-alice', 'video');
    const bob = await openParticipant(browser, session, 'life-bob', 'video');

    await expectConnected(alice, 'life-alice', 1);
    await expectConnected(bob, 'life-bob', 1);
    await expect.poll(async () => (await status(alice)).localVideoEnabled, { message: 'initial camera on' }).toBe(true);

    await alice.evaluate(() => (window as unknown as {
      __phase5Actions: { setMuted: (muted: boolean) => void };
    }).__phase5Actions.setMuted(true));
    await expect.poll(async () => (await status(alice)).localAudioEnabled, { message: 'mute' }).toBe(false);
    await alice.evaluate(() => (window as unknown as {
      __phase5Actions: { setMuted: (muted: boolean) => void };
    }).__phase5Actions.setMuted(false));
    await expect.poll(async () => (await status(alice)).localAudioEnabled, { message: 'unmute' }).toBe(true);

    await alice.evaluate(() => (window as unknown as {
      __phase5Actions: { setVideoEnabled: (enabled: boolean) => void };
    }).__phase5Actions.setVideoEnabled(false));
    await expect.poll(async () => (await status(alice)).localVideoEnabled, { message: 'camera off' }).toBe(false);
    await alice.evaluate(() => (window as unknown as {
      __phase5Actions: { setVideoEnabled: (enabled: boolean) => void };
    }).__phase5Actions.setVideoEnabled(true));
    await expect.poll(async () => (await status(alice)).localVideoEnabled, { message: 'camera on' }).toBe(true);

    await bob.evaluate(() => (window as unknown as {
      __phase5Actions: { leave: () => void };
    }).__phase5Actions.leave());
    await expect.poll(async () => (await status(alice)).peers, { message: 'host sees viewer leave' }).toBe(0);

    const ended = await fetch(`${MOCK_EDGE_BASE}/functions/v1/live/sessions/${session}/end`, { method: 'POST' });
    expect(ended.status).toBe(200);
    await expect.poll(async () => (await status(alice)).sessionEnded, { message: 'host sees session ended' }).toBe(true);
  });
});
