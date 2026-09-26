// Walks each Profile content tab and records what renders and what is requested.
// Baseline for do.md's one-item-at-a-time rewrite.
//
// Run: npx vite --port 8080   (in another shell)
//      node scripts/profileTabsBaseline.mjs
import { chromium } from 'playwright';

const APP = process.env.APP_URL || 'http://localhost:8080';
const GW = 'gateway-iota-two.vercel.app';
const USER = process.env.PROFILE_USER || 'Hadjer';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let log = [];
page.on('request', r => {
  if (!r.url().includes(GW)) return;
  const u = new URL(r.url());
  log.push(`/api/${(u.pathname.match(/\/api\/([a-z_]+)/i) || [, '?'])[1]}${u.search}`.slice(0, 110));
});

async function snapshot(label) {
  const before = log.length;
  // Trigger a tab by clicking its visible label.
  const tab = page.locator('button, [role="tab"]', { hasText: new RegExp(`^${label}$`, 'i') }).first();
  const exists = await tab.count();
  if (!exists) {
    console.log(`\n=== ${label} tab === NOT PRESENT`);
    return;
  }
  await tab.click();
  await page.waitForTimeout(3000);

  const imgs = await page.locator('img').count();
  const videos = await page.locator('video').count();
  const posts = await page.locator('[data-testid="post"]').count();
  const loadMore = await page.locator('button', { hasText: /load more|show more/i }).count();
  const reqs = log.slice(before);
  const uniq = [...new Set(reqs)];

  console.log(`\n=== ${label} tab ===`);
  console.log(`  post cards: ${posts} | <img>: ${imgs} | <video>: ${videos} | load-more buttons: ${loadMore}`);
  console.log(`  gateway requests on tab open: ${reqs.length}`);
  uniq.slice(0, 8).forEach(r => console.log(`    ${r}`));

  // Does scrolling add content?
  const h0 = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight + 1200; y += 500) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 200));
    }
  });
  await page.waitForTimeout(2000);
  const after = posts ? await page.locator('[data-testid="post"]').count() : null;
  const h1 = await page.evaluate(() => document.body.scrollHeight);
  console.log(`  after scrolling: posts ${posts} -> ${after} | page height ${h0} -> ${h1} | +${log.length - reqs.length} requests`);
  await page.screenshot({ path: `/tmp/opencode/shots/profile-baseline-${label.toLowerCase()}.png` });
}

await page.goto(`${APP}/profile/${USER}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
console.log(`Profile: ${USER}`);

for (const t of ['Photos', 'Reels', 'Shared', 'Posts']) await snapshot(t);

await browser.close();
