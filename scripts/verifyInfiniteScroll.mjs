//
// Run: npx vite --port 8080   (in another shell)
//      node scripts/verifyInfiniteScroll.mjs
//
// Live verification of do.md's infinite-scroll feed against the real app and the
// real Gateway. Run with: node scripts/verifyInfiniteScroll.mjs
//
// This is the §515 bar — "verified that scrolling automatically loads additional
// posts and that no 'Load more posts' button remains anywhere in the Feed" —
// exercised in a real browser with a real IntersectionObserver, a real scroll
// and real network traffic, rather than in jsdom with a hand-driven callback.

import { chromium } from 'playwright';

const APP = process.env.APP_URL || 'http://localhost:8080';
const OUT = '/tmp/opencode/shots';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  return pass;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Every request the app makes, so "one read for the whole feed" is measured
// rather than assumed.
// `useHomeFeed` reads the unfiltered `GET /api/posts` — the whole authorized
// timeline, which is the one request the feed is allowed to make. The reels
// strip on the same page reads a *filtered* /api/posts, so it is tracked
// separately rather than being mistaken for pagination.
const GW = 'gateway-iota-two.vercel.app';
const feedReads = [];
let scrollStarted = false;
let feedReadsWhileScrolling = 0;
page.on('request', r => {
  if (!r.url().includes(GW)) return;
  const u = new URL(r.url());
  if (u.pathname !== '/api/posts' || u.search) return; // filtered reads are not the feed
  feedReads.push(Date.now());
  if (scrollStarted) feedReadsWhileScrolling++;
});

const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(String(e)));

await page.goto(APP, { waitUntil: 'domcontentloaded' });

// The feed must render for a guest without a click.
await page.waitForSelector('[data-testid="post"]', { timeout: 45000 });
const pageSize = 10;

/** How many post cards are currently in the DOM. */
const postCount = () => page.locator('[data-testid="post"]').count();
/** Post ids, in DOM order — used to prove order, dedupe and append-not-replace. */
const postIds = () => page.$$eval('[data-testid="post"]', els => els.map(e => e.getAttribute('data-post-id') || e.textContent.slice(0, 40)));

const initial = await postCount();
const initialIds = await postIds();
const feedReadsAfterFirstPaint = feedReads.length;

check('feed renders without any click', initial > 0, `${initial} posts on first paint`);
check('first paint is exactly one page', initial === pageSize, `${initial} posts, page size ${pageSize}`);
check('the feed itself makes exactly one read on first paint', feedReadsAfterFirstPaint === 1, `${feedReadsAfterFirstPaint} feed read(s)`);

await page.screenshot({ path: `${OUT}/01-first-page.png`, fullPage: false });

// --- §1: the button must be gone -------------------------------------------
const buttonText = await page.getByText('Load more posts', { exact: false }).count();
const loadMoreButtons = await page.locator('button', { hasText: /load more/i }).count();
check('§1 no "Load more posts" button in the feed', buttonText === 0 && loadMoreButtons === 0,
  `${buttonText} text matches, ${loadMoreButtons} buttons`);

// --- §3/§5: scrolling must load more, automatically -------------------------
const observed = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="feed-sentinel"]');
  return { hasSentinel: !!el, inDom: !!document.querySelector('div[aria-hidden="true"][data-testid="feed-sentinel"]') };
});
check('§3 a sentinel element sits at the end of the feed', observed.hasSentinel);

scrollStarted = true;
let total = initial;
let revealedOrder = [...initialIds];
let rounds = 0;

for (let i = 0; i < 6; i++) {
  // Scroll the way a person does: to the bottom, in steps, so the observer's
  // 800px band is actually crossed.
  await page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 250));
  });
  await page.waitForTimeout(700);
  rounds++;
  total = await postCount();
  const ids = await postIds();
  revealedOrder = ids;

  console.log(`  round ${rounds}: ${total} posts in DOM, ${feedReads.length} feed read(s) total`);

  if (total === revealedOrder.length && ids.length) {
    // keep going until the end marker shows or nothing changes
  }
  if (total > 0 && (await page.getByText(/all caught up/i).count()) > 0) break;
  if (total === initial && i > 0 && rounds > 1) break;
}

// --- results ---------------------------------------------------------------
console.log(`\nafter ${rounds} scroll round(s): ${total} posts, ${feedReads.length} feed read(s) total`);

const grew = total > initial;
check('§2 scrolling automatically appended more posts', grew, `${initial} → ${total}`);

check('§2 the first page was kept, not re-fetched',
  JSON.stringify(revealedOrder.slice(0, initial)) === JSON.stringify(initialIds));

check('§9/§10 no post is duplicated', new Set(revealedOrder).size === revealedOrder.length,
  `${revealedOrder.length} cards, ${new Set(revealedOrder).size} unique`);

check('§13 the feed reports it is at the end',
  (await page.getByText(/all caught up/i).count()) > 0);

check('§4 the whole feed came from a single read', feedReads.length === 1,
  `${feedReads.length} read(s) served ${revealedOrder.length} posts`);
check('§5 scrolling added no further feed reads', feedReadsWhileScrolling === 0,
  `${feedReadsWhileScrolling} extra read(s) while appending ${revealedOrder.length - initial} posts`);

await page.screenshot({ path: `${OUT}/02-end-of-feed.png`, fullPage: false });
await page.screenshot({ path: `${OUT}/03-full-page.png`, fullPage: true });

check('no uncaught page errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

// --- report ----------------------------------------------------------------
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join('; '));
  process.exitCode = 1;
}

await browser.close();
