//
// Run: npx vite --port 8080   (in another shell)
//      node scripts/verifyLazyReactions.mjs
//
// The correctness half of the lazy-reactions change: a card the reader is
// actually looking at must always have its reaction data, and a card that has
// been read must never be re-requested. Scrolling is gradual, like a reader,
// rather than a jump to the bottom.
import { chromium } from 'playwright';

const APP = process.env.APP_URL || 'http://localhost:8080';
const GW = 'gateway-iota-two.vercel.app';
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const requested = new Map(); // postId -> count
page.on('request', r => {
  const m = r.url().match(ID);
  if (r.url().includes(GW) && r.url().includes('/reaction-users') && m) {
    requested.set(m[0], (requested.get(m[0]) || 0) + 1);
  }
});

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="post"]', { timeout: 45000 });
await page.waitForTimeout(2500);

const total = await page.evaluate(() => document.body.scrollHeight);
let misses = 0;
let steps = 0;
let maxRatio = 0;

for (let y = 0; y <= total + 2000; y += 400) {
  await page.evaluate(v => window.scrollTo(0, v), y);
  await page.waitForTimeout(320);
  steps++;

  // After settling, every post overlapping the viewport must have been asked for.
  const visible = await page.$$eval('[data-testid="post"]', els =>
    els
      .filter(e => {
        const r = e.getBoundingClientRect();
        return r.bottom > -200 && r.top < window.innerHeight + 600;
      })
      .map(e => e.getAttribute('data-post-id'))
      .filter(Boolean)
  );
  maxRatio = Math.max(maxRatio, visible.length / Math.max(1, requested.size));
  const missing = visible.filter(id => !requested.has(id));
  if (missing.length) {
    misses += missing.length;
    console.log(`  y=${y}: ${missing.length} visible post(s) with no reaction data yet`);
  }
}

const finalPosts = await page.locator('[data-testid="post"]').count();
const dupes = [...requested.values()].filter(c => c > 1);

console.log(`\nposts revealed: ${finalPosts}`);
console.log(`distinct posts asked for reactions: ${requested.size}`);
console.log(`scroll steps: ${steps}`);
console.log(`visible-but-unrequested observations: ${misses}  ${misses === 0 ? 'PASS' : 'FAIL'}`);
console.log(`posts requested more than once: ${dupes.length}  ${dupes.length === 0 ? 'PASS' : 'FAIL'}`);

await page.screenshot({ path: '/tmp/opencode/shots/04-gradual-scroll.png', fullPage: false });
await browser.close();

if (misses > 0 || dupes.length > 0) process.exitCode = 1;
