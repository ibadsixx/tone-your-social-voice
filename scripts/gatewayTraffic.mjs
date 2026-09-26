//
// Run: npx vite --port 8080   (in another shell)
//      node scripts/gatewayTraffic.mjs
//
// Full gateway traffic for the Home page, broken down by table and phase, with
// the feed's own read singled out. do.md §4, §5, §16, §17.
import { chromium } from 'playwright';

const APP = process.env.APP_URL || 'http://localhost:8080';
const GW = 'gateway-iota-two.vercel.app';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let phase = 'boot';
const log = [];
page.on('request', r => {
  if (!r.url().includes(GW)) return;
  const u = new URL(r.url());
  const table = (u.pathname.match(/\/api\/([a-z_]+)/i) || [, '?'])[1];
  const h = r.headers();
  log.push({
    phase, table,
    select: (h['x-select'] || u.searchParams.get('select') || '').replace(/\s+/g, ' ').trim(),
    range: h['x-range'] || u.searchParams.get('range') || '',
  });
});

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="post"]', { timeout: 45000 });
await page.waitForTimeout(2500);
phase = 'settled-first-paint';
const boot = log.length;
const first = await page.locator('[data-testid="post"]').count();

const beforeScroll = log.length;
for (let i = 0; i < 4; i++) {
  phase = `scroll-round-${i + 1}`;
  await page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 250));
  });
  await page.waitForTimeout(900);
  if ((await page.getByText(/all caught up/i).count()) > 0) break;
}
await page.waitForTimeout(400);
const final = await page.locator('[data-testid="post"]').count();

console.log(`feed: ${first} posts -> ${final} posts`);
console.log(`gateway requests: ${log.length} total | ${beforeScroll} before scrolling | ${log.length - beforeScroll} while scrolling\n`);

const byTable = {};
for (const e of log) byTable[e.table] = (byTable[e.table] || 0) + 1;
console.log('all requests by table:');
for (const [k, v] of Object.entries(byTable).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}x  ${k}`);

console.log('\nposts-table requests, with their projection and phase:');
log.filter(e => e.table === 'posts').forEach((e, i) => {
  console.log(`  ${String(i + 1).padStart(3)}x [${e.phase}] range=${e.range || '-'} select=${e.select.slice(0, 70) || '(all columns)'}`);
});

await browser.close();
