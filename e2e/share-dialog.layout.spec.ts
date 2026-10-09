// Layout regression for the group "Share" dialog.
//
// Renders the REAL ShareGroupDialog in a real browser at the viewports from
// message.md (320, 375, 768, 1366 + a short viewport) and asserts the dialog
// never overflows the page/viewport, the right-aligned "Share now" button and
// the far-right "Friend's profile" option stay inside it, and the horizontal
// friends strip scrolls instead of widening the panel.
//
// Run: npx playwright test -c playwright.layout.config.ts
import { test, expect, type Page, type Route } from '@playwright/test';

const VIEWER = 'viewer-uuid-0001';
const FRIEND_COUNT = 12;

const SESSION_USER = {
  id: VIEWER,
  email: 'viewer@example.com',
  user_metadata: { username: 'viewer', display_name: 'Viewer Person' },
};

const FRIENDS = Array.from({ length: FRIEND_COUNT }, (_, i) => {
  const other = `friend-${i}`;
  const viewerIsRequester = i % 2 === 0;
  return {
    id: `friendship-${i}`,
    requester_id: viewerIsRequester ? VIEWER : other,
    receiver_id: viewerIsRequester ? other : VIEWER,
    status: 'accepted',
    created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
  };
});

const PROFILES = [
  { id: VIEWER, username: 'viewer', display_name: 'Viewer Person', profile_pic: null },
  ...FRIENDS.map((_, i) => ({
    id: `friend-${i}`,
    username: `friend_${i}`,
    // Long names, to prove labels truncate/wrap instead of widening the dialog.
    display_name: `Friend Number ${i} With A Very Long Name`,
    profile_pic: null,
  })),
];

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

async function installGatewayMock(page: Page) {
  // Only the Gateway table calls (`/api/<table>`); never the app modules that
  // live under `/src/api/**`.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS });
    }
    if (pathname.endsWith('/api/friends')) {
      return route.fulfill({ json: FRIENDS, headers: CORS_HEADERS });
    }
    if (pathname.endsWith('/api/profiles')) {
      return route.fulfill({ json: PROFILES, headers: CORS_HEADERS });
    }
    if (pathname.endsWith('/api/posts')) {
      return route.fulfill({ status: 201, json: [{ id: 'post-1' }], headers: CORS_HEADERS });
    }
    return route.fulfill({ json: [], headers: CORS_HEADERS });
    }
  );
}

async function openHarness(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem(
      'tone-auth-token',
      JSON.stringify({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      })
    );
  }, SESSION_USER);
  await installGatewayMock(page);
  await page.goto('/e2e/share-harness.html');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Friend Number 0 With A Very Long Name')).toBeVisible();
}

interface Metrics {
  pageScrollWidth: number;
  bodyScrollWidth: number;
  innerWidth: number;
  innerHeight: number;
  dialog: { left: number; right: number; width: number; height: number; top: number; bottom: number };
  shareNow: { left: number; right: number } | null;
  friendProfile: { left: number; right: number } | null;
  close: { left: number; right: number } | null;
  strip: { clientWidth: number; scrollWidth: number; left: number; right: number } | null;
  body: { clientHeight: number; scrollHeight: number } | null;
}

async function measure(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const rect = dialog.getBoundingClientRect();
    const buttons = Array.from(dialog.querySelectorAll('button')) as HTMLElement[];
    const find = (text: string) => buttons.find((b) => (b.textContent || '').includes(text)) || null;
    const rel = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    };
    const shareNow = find('Share now');
    const friendProfile = find("Friend's profile");
    const close = find('Close');
    const strip = dialog.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    const body = dialog.querySelector('.overflow-y-auto') as HTMLElement | null;
    const stripRect = strip?.getBoundingClientRect();
    return {
      pageScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dialog: { left: rect.left, right: rect.right, width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom },
      shareNow: rel(shareNow),
      friendProfile: rel(friendProfile),
      close: rel(close),
      strip: strip && stripRect
        ? { clientWidth: strip.clientWidth, scrollWidth: strip.scrollWidth, left: stripRect.left, right: stripRect.right }
        : null,
      body: body ? { clientHeight: body.clientHeight, scrollHeight: body.scrollHeight } : null,
    };
  });
}

const VIEWPORTS = [
  { label: 'mobile 320x568', width: 320, height: 568 },
  { label: 'mobile 375x667', width: 375, height: 667 },
  { label: 'tablet 768x1024', width: 768, height: 1024 },
  { label: 'desktop 1366x768', width: 1366, height: 768 },
  { label: 'short 375x420', width: 375, height: 420 },
];

test.describe('group Share dialog layout', () => {
  test('never overflows and keeps every control inside the dialog', async ({ page }) => {
    await openHarness(page);

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(150);
      const m = await measure(page);

      expect(m.pageScrollWidth, `${vp.label}: page has horizontal overflow`).toBeLessThanOrEqual(m.innerWidth + 1);
      expect(m.bodyScrollWidth, `${vp.label}: body has horizontal overflow`).toBeLessThanOrEqual(m.innerWidth + 1);

      expect(m.dialog.left, `${vp.label}: dialog clipped on the left`).toBeGreaterThanOrEqual(-1);
      expect(m.dialog.right, `${vp.label}: dialog clipped on the right`).toBeLessThanOrEqual(m.innerWidth + 1);
      expect(m.dialog.width, `${vp.label}: dialog edge-to-edge, no gutter`).toBeLessThanOrEqual(vp.width - 24);

      expect(m.shareNow, `${vp.label}: Share now button missing`).not.toBeNull();
      expect(m.shareNow!.right, `${vp.label}: Share now clipped`).toBeLessThanOrEqual(m.dialog.right + 1);
      expect(m.shareNow!.left, `${vp.label}: Share now off-screen`).toBeGreaterThanOrEqual(m.dialog.left - 1);

      expect(m.friendProfile, `${vp.label}: Friend's profile option missing`).not.toBeNull();
      expect(m.friendProfile!.right, `${vp.label}: Friend's profile clipped`).toBeLessThanOrEqual(m.dialog.right + 1);

      expect(m.close, `${vp.label}: close control off-screen`).not.toBeNull();
      expect(m.close!.right, `${vp.label}: close control clipped`).toBeLessThanOrEqual(m.innerWidth + 1);
      expect(m.close!.left, `${vp.label}: close control off-screen`).toBeGreaterThanOrEqual(0);

      // The horizontal friends strip must scroll within the dialog, not widen it.
      expect(m.strip, `${vp.label}: friends strip missing`).not.toBeNull();
      expect(m.strip!.right, `${vp.label}: friend strip overflows the dialog`).toBeLessThanOrEqual(m.dialog.right + 1);
      expect(m.strip!.scrollWidth, `${vp.label}: friend strip should be horizontally scrollable`).toBeGreaterThan(m.strip!.clientWidth);

      if (vp.height <= 500) {
        // The dialog must fit the viewport and scroll its body internally.
        expect(m.dialog.top, `${vp.label}: dialog clipped at the top`).toBeGreaterThanOrEqual(-1);
        expect(m.dialog.bottom, `${vp.label}: dialog clipped at the bottom`).toBeLessThanOrEqual(m.innerHeight + 1);
        expect(m.body, `${vp.label}: inner body missing`).not.toBeNull();
        expect(m.body!.scrollHeight, `${vp.label}: body does not scroll on short viewport`).toBeGreaterThan(m.body!.clientHeight);
      }
    }
  });

  test('friends remain selectable and Share now still posts', async ({ page }) => {
    await openHarness(page);

    let posted = false;
    await page.route(
      (url) => url.pathname === '/api/posts',
      async (route) => {
        posted = true;
        await route.fulfill({ status: 201, json: [{ id: 'post-1' }], headers: CORS_HEADERS });
      }
    );

    // Clicking a friend fires the existing "Sent!" toast (selection behaviour preserved).
    await page.getByText('Friend Number 3 With A Very Long Name').click();
    await expect(page.getByText(/Shared with Friend Number 3/).first()).toBeVisible();

    await page.getByPlaceholder('Say something about this...').fill('Hello group');
    await page.getByRole('button', { name: 'Share now' }).click();
    await expect.poll(() => posted).toBe(true);
  });
});
