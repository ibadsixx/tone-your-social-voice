// Real-browser Tone Live P2P verification.
// Two and three independent Chromium contexts acquire real (fake-device)
// microphone media, exchange SDP/ICE through a local signaling double, and
// establish real RTCPeerConnection media channels. This test does NOT assert
// production Gateway behavior; the production Gateway has its own unit tests.

import { expect, test, type Browser, type Page } from '@playwright/test';

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

const MOCK_GATEWAY = 'http://127.0.0.1:8787';

function harnessUrl(session: string, user: string): string {
  const params = new URLSearchParams({ session, user, gateway: MOCK_GATEWAY });
  return `/e2e/live-p2p-harness.html?${params.toString()}`;
}

function status(page: Page): Promise<HarnessStatus> {
  return page.evaluate(() => (window as unknown as { __p2pStatus: HarnessStatus }).__p2pStatus);
}

async function openParticipant(
  browser: Browser,
  session: string,
  user: string,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(harnessUrl(session, user), { waitUntil: 'domcontentloaded' });
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
      expect(s.remoteTracks).toBeGreaterThanOrEqual(2);
    });
    expect(states.reduce((n, s) => n + s.offers, 0)).toBeGreaterThanOrEqual(3);
    expect(states.reduce((n, s) => n + s.answers, 0)).toBeGreaterThanOrEqual(3);
    expect(states.reduce((n, s) => n + s.ice, 0)).toBeGreaterThanOrEqual(3);
  });
});
