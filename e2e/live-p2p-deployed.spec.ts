// Real-browser WebRTC test against the DEPLOYED Gateway and Supabase-backed
// signaling. Tokens are injected into the page; they are never printed or put
// in URLs. Uses fake media devices because no physical devices are available.

import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';

interface AuthContext {
  gateway: string;
  host: { id: string; token: string; email: string };
  viewer: { id: string; token: string; email: string };
  outsider: { id: string; token: string; email: string };
}

interface CandidatePairInfo {
  localType: string;
  remoteType: string;
  state: string;
  nominated: boolean;
}

interface HarnessStatus {
  userId: string;
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
  error: string | null;
}

const AUTH_FILE = process.env.PHASE5_AUTH_FILE || '/tmp/opencode/phase5-auth.json';
const auth: AuthContext = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
let deployedSessionId = '';

async function api(path: string, token: string, body?: unknown) {
  const response = await fetch(`${auth.gateway}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  return { status: response.status, json };
}

test.beforeAll(async () => {
  const created = await api('/api/live/sessions', auth.host.token, {
    stream_type: 'video',
    title: `Phase 5 deployed browser test ${Date.now()}`,
    audience_type: 'public',
  });
  expect(created.status).toBe(201);
  deployedSessionId = String(created.json.id);

  for (const token of [auth.viewer.token, auth.outsider.token]) {
    const joined = await api(`/api/live/sessions/${deployedSessionId}/participants`, token, {});
    expect(joined.status).toBe(201);
  }
});

function status(page: Page): Promise<HarnessStatus> {
  return page.evaluate(() => (window as unknown as { __p2pStatus: HarnessStatus }).__p2pStatus);
}

async function openParticipant(
  browser: Browser,
  user: { id: string; token: string },
  role: 'host' | 'viewer',
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript((token) => {
    (window as unknown as { __phase5AuthToken: string }).__phase5AuthToken = token;
  }, user.token);
  const params = new URLSearchParams({
    session: deployedSessionId,
    user: user.id,
    role,
    media: 'video',
    gateway: auth.gateway,
  });
  await page.goto(`/e2e/live-p2p-harness.html?${params.toString()}`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => status(page), { message: `${role}: harness started` }).not.toBeUndefined();
  return page;
}

async function expectConnected(page: Page, label: string, expectedPeers: number): Promise<void> {
  await expect.poll(async () => (await status(page)).signaling, { message: `${label}: signaling` }).toBe('connected');
  await expect.poll(async () => (await status(page)).localTracks, { message: `${label}: local media` }).toBeGreaterThan(0);
  await expect.poll(async () => (await status(page)).peers, { message: `${label}: peers` }).toBe(expectedPeers);
  await expect.poll(async () => {
    const s = await status(page);
    return Object.values(s.peerStates).filter((state) => state === 'connected').length;
  }, { message: `${label}: connected peer connections` }).toBe(expectedPeers);
  await expect.poll(async () => (await status(page)).remoteTracks, { message: `${label}: remote tracks` })
    .toBeGreaterThanOrEqual(expectedPeers);
  await expect.poll(async () => {
    const s = await status(page);
    return s.candidatePairs.filter((pair) => pair.state === 'succeeded' && pair.nominated).length;
  }, { message: `${label}: selected candidate pairs` }).toBe(expectedPeers);
}

test.describe('Tone Live deployed authenticated WebRTC', () => {
  test('two authenticated users connect, toggle devices, end, and leave', async ({ browser }) => {
    const host = await openParticipant(browser, auth.host, 'host');
    const viewer = await openParticipant(browser, auth.viewer, 'viewer');

    await expectConnected(host, 'host', 1);
    await expectConnected(viewer, 'viewer', 1);

    const connected = await Promise.all([status(host), status(viewer)]);
    connected.forEach((s, index) => {
      const label = index === 0 ? 'host' : 'viewer';
      console.log(`${label}:`, JSON.stringify(s));
      expect(s.error).toBeNull();
      expect(s.candidatePairs.every((p) => p.localType !== 'relay' && p.remoteType !== 'relay')).toBe(true);
    });

    await host.evaluate(() => (window as unknown as { __phase5Actions: { setMuted: (v: boolean) => void } }).__phase5Actions.setMuted(true));
    await expect.poll(async () => (await status(host)).localAudioEnabled, { message: 'mute' }).toBe(false);
    await host.evaluate(() => (window as unknown as { __phase5Actions: { setMuted: (v: boolean) => void } }).__phase5Actions.setMuted(false));
    await expect.poll(async () => (await status(host)).localAudioEnabled, { message: 'unmute' }).toBe(true);

    await host.evaluate(() => (window as unknown as { __phase5Actions: { setVideoEnabled: (v: boolean) => void } }).__phase5Actions.setVideoEnabled(false));
    await expect.poll(async () => (await status(host)).localVideoEnabled, { message: 'camera off' }).toBe(false);
    await host.evaluate(() => (window as unknown as { __phase5Actions: { setVideoEnabled: (v: boolean) => void } }).__phase5Actions.setVideoEnabled(true));
    await expect.poll(async () => (await status(host)).localVideoEnabled, { message: 'camera on' }).toBe(true);

    const ended = await api(`/api/live/sessions/${deployedSessionId}/end`, auth.host.token);
    expect(ended.status).toBe(200);
    await expect.poll(async () => (await status(host)).sessionEnded, { message: 'host saw session-ended' }).toBe(true);
    await expect.poll(async () => (await status(viewer)).sessionEnded, { message: 'viewer saw session-ended' }).toBe(true);

    await viewer.evaluate(() => (window as unknown as { __phase5Actions: { leave: () => void } }).__phase5Actions.leave());
    await expect.poll(async () => (await status(host)).peers, { message: 'host sees viewer leave' }).toBe(0);
  });

  test('three authenticated users form a full mesh', async ({ browser }) => {
    const host = await openParticipant(browser, auth.host, 'host');
    const viewer = await openParticipant(browser, auth.viewer, 'viewer');
    const outsider = await openParticipant(browser, auth.outsider, 'viewer');

    await expectConnected(host, 'host', 2);
    await expectConnected(viewer, 'viewer', 2);
    await expectConnected(outsider, 'outsider', 2);

    const states = await Promise.all([status(host), status(viewer), status(outsider)]);
    states.forEach((s, index) => {
      console.log(`${['host', 'viewer', 'outsider'][index]}:`, JSON.stringify(s));
      expect(s.error).toBeNull();
      expect(s.candidatePairs).toHaveLength(2);
      expect(s.candidatePairs.every((p) => p.localType !== 'relay' && p.remoteType !== 'relay')).toBe(true);
    });
  });
});
