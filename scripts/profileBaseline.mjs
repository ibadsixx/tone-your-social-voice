// BASELINE measurement of the Profile content pages, before the do.md rewrite.
// Records, per tab: how many items render, what the Gateway is asked for, and
// whether any "Load more" control exists. This is the "before" number the
// one-item-at-a-time change has to be measured against.
//
// Run: npx vite --port 8080   (in another shell)
//      node scripts/profileBaseline.mjs
import { chromium } from 'playwright';

const APP = process.env.APP_URL || 'http://localhost:8080';
const GW = 'gateway-iota-two.vercel.app';
const USER = process.env.PROFILE_USER || 'Hadjer'; // the most prolific author

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let log = [];
page.on('request', r => {
  if (r.url().includes(GW)) {
    const u = new URL(r.url());
    log.push({ table: (u.pathname.match(/\/api\/([a-z_]+)/i) || [, '?'])[1], path: u.pathname, search: u.search });
  }
});

async function settle(ms = 2500) { await page.waitForTimeout(ms); }

async function report(label) {
  console.log(`\n=== ${label} ===`);
  const counts = {};
  for (const e of log) {
    const key = e.table + (e.search ? e.search.slice(0, 60) : '');
    counts[key] = (counts[key] || 0) + 1;
  }
  console.log(`gateway requests: ${log.length}`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(v).padStart(3)}x /api/${k}`);
  }
  const loadMore = await page.locator('button', { hasText: /load more|show more/i }).count();
  console.log(`"Load more"/"Show more" buttons visible: ${loadMore}`);
  const anyText = await page.locator('text=/load more|show more/i').count();
  console.log(`any "load more"/"show more" text nodes: ${anyText}`);
}

await page.goto(`${APP}/profile/${USER}`, { waitUntil: 'domcontentloaded' });
await settle(3500);

console.log(`Profile: ${USER}`);
console.log(`URL: ${page.url()}`);
console.log(`posts rendered on the Posts tab: ${await page.locator('[data-testid="post"]').count()}`);
const tabLabels = await page.locator('button, a[role="tab"], [role="tab"]').allInnerTexts();
console.log(`tabs/controls found: ${JSON.stringify(tabLabels.map(t => t.trim()).filter(Boolean).slice(0, 25))}`);

await report('Posts tab, initial load');

// Does scrolling load anything more today?
const before = await page.locator('[data-testid="post"]').count();
await page.evaluate(async () => {
  for (let y = 0; y <= document.body.scrollHeight + 1500; y += 500) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 200));
  }
});
await settle(2000);
const after = await page.locator('[data-testid="post"]').count();
console.log(`\nafter scrolling to the bottom: ${before} -> ${after} posts`);
await report('Posts tab, after scrolling to the bottom');

await page.screenshot({ path: '/tmp/opencode/shots/profile-baseline-posts.png', fullPage: false });
await browser.close();
