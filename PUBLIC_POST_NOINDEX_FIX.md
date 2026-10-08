# Fix Report — Public Post `noindex` Caused by Transient Fetch Errors

**Date:** 2026-10-07
**Scope:** `tone-your-social-voice` (frontend)
**Affected post:** `79e1b123-f135-4f1b-b2c7-648a56321b18`
**GSC symptom:** excluded by `noindex` tag (crawl 2026-09-29)
**Type of fix:** state-classification fix in the post fetch. No SEO rule, privacy rule, sitemap, robots, gateway, or database change.

---

## 0. Root cause (for context)

For `/post/:id`, the only frontend noindex path is:

```
src/pages/PublicContentPage.tsx   (applyNoIndexSeo, when post === null && notFound === true)
```

`src/hooks/usePost.ts` collapsed two very different outcomes into `notFound = true`:

1. a **genuinely missing / unauthorized** post (an authoritative negative), and
2. a **transient fetch / API / transport error** (no authoritative answer at all).

Consequently, a single failed render of a **public** post sent `noindex,follow`, which is what GSC recorded. The post itself is `audience_type = public`, `visibility = public`, `status = published`, and renders `index,follow` when the fetch succeeds — so this was a runtime failure path, not a permanent public-post SEO rule.

The fix separates these states so a transient failure can never turn into `noindex`.

---

## 1. Exact files changed

| File | Change |
| --- | --- |
| `src/hooks/usePost.ts` | **Core fix.** Post-fetch state machine: transient failures no longer become `notFound`; new `error` state; small bounded retry. |
| `src/pages/PublicContentPage.tsx` | Consumes the new `error` / `refetch`; adds a recoverable "couldn't load / Try again" view. **`applyNoIndexSeo` is left in place and still runs on `notFound`.** |
| `src/__tests__/publicContentSeo.test.tsx` | Added test `A2` — transient error must never emit `noindex`. |
| `src/__tests__/usePostTransientError.test.tsx` | New — hook state-classification tests (9 tests). |
| `src/__tests__/publicContentTransientError.test.tsx` | New — route → hook → page → `document.head` integration tests (2 tests). |

No other file was modified.

---

## 2. Exact state distinction implemented

`usePost` now exposes `{ post, loading, notFound, error, refetch }`:

- **A. LOADING** — request in progress: `loading = true`, `notFound = false`, `error = null`. No noindex.
- **B. SUCCESSFUL POST** — `post` set, `error = null`. The existing SEO logic (`buildContentSeo`) determines indexability, unchanged.
- **C. CONFIRMED NOT FOUND / DENIED** — `notFound = true` **only** when:
  - an authorized read succeeds and returns no row (`data === null && error == null`); or
  - the defense-in-depth visibility guard (`isPostVisibleToViewer`) denies the returned row; or
  - there is no `:id` at all.
  This keeps `PublicContentPage`'s `notFound → applyNoIndexSeo` behavior for genuinely unavailable content.
- **D. TRANSIENT / API / NETWORK ERROR** — `error` set, `notFound = false`, `post = null`. Never reaches `applyNoIndexSeo`.

---

## 3. How confirmed not-found differs from transient error

- **Confirmed not-found** = the Gateway read **succeeded** (`error === null`) and returned **no row**. That is an authoritative negative: the post does not exist for this viewer, or the Gateway withheld it because it is not accessible. Also treated as confirmed: a returned row the viewer may not see (defense in depth), and a missing `:id`.
- **Transient error** = anything that prevented an authoritative answer:
  - a returned error (`{ message, code }`): network failure, timeout, Gateway 5xx, transport failure, malformed/unexpected temporary response, temporary Supabase failure; or
  - a thrown exception/transport error.

  These set the separate `error` state and **never** `notFound`.

---

## 4. Whether retry was added / reused

**Added, small and bounded** — consistent with the existing hook architecture and `refetch`:

- `TRANSIENT_MAX_ATTEMPTS = 2`
- `TRANSIENT_RETRY_DELAY_MS = 250`

At most one retry after a short backoff. No aggressive polling, no infinite retry, no new API system. The existing `refetch` (already returned by `usePost`) is reused for the manual "Try again" action.

---

## 5. Tests and results

Command:

```
npx vitest run <18 affected test files>
```

Result: **18 files passed, 321 tests passed.**

Coverage of the required checks:

| # | Requirement | Where verified |
| --- | --- | --- |
| 1 | Successful PUBLIC → `index,follow` | existing `publicContentSeo.test.tsx` (public suite) + hook test 1 |
| 2 | Successful Friends → `noindex,follow` | `RESTRICTED_MATRIX` D/F + module tests |
| 3 | Successful Only Me → `noindex,follow` | `RESTRICTED_MATRIX` G + module tests |
| 4 | Confirmed missing → `noindex,follow` | test `J` + hook test 4 |
| 5 | Transient error does **not** set `notFound` | hook tests 5, 5b |
| 6 | Transient error does **not** call `applyNoIndexSeo` | page test `A2` + integration test 6 (asserts no `meta[robots]` is emitted at all) |
| 7 | Successful retry → public post becomes `index,follow` | hook tests 7, 7b + integration test 7 |
| 8 | Existing privacy behavior unchanged | `postVisibility.test.ts` (82), `RESTRICTED_MATRIX`, owner/friend tests K/L, `feedAudienceFiltering.test.ts` |

The integration test exercises the **real** `usePost` + **real** `PublicContentPage`: a Gateway 503 on both bounded attempts produces a recoverable error view with **no robots tag**, and a subsequent successful retry restores `index,follow` with a self-canonical.

---

## 6. TypeScript result

```
npx tsc --noEmit
```

**Clean — no errors.**

---

## 7. Build result

```
npx vite build
```

**✓ built successfully** (~22 s). Only the pre-existing chunk-size / dynamic-import warnings, unrelated to this change.

---

## 8. Confirmation: PUBLIC posts remain indexable

Yes. `applySeo` is invoked with `index: seo.isPublic`, unchanged. A loaded public + published post yields `index,follow` (existing tests + integration test 7).

---

## 9. Confirmation: Friends / Only Me / others remain noindex

Yes. The `notFound → applyNoIndexSeo` path is intact and audience-based indexability is untouched:

- Friends, Only Me, specific, custom_list, friends_except → `noindex,follow`
- draft / scheduled / archived → `noindex,follow`
- null / unknown / cased (`Public`, `PUBLIC`) audiences → `noindex,follow`
- genuinely missing / unauthorized / inaccessible posts → `noindex,follow`

Only a transient fetch failure no longer becomes `noindex`.

---

## 10. Confirmation: no sitemap / robots / Gateway / database changes

The following were **not** modified:

- sitemap generation
- `robots.txt`
- Gateway architecture
- database schema
- post audience rules
- guest privacy rules
- hashtag system
- profile SEO
- unrelated pages

`applyNoIndexSeo` was **not** deleted or bypassed.

---

## Summary

A transient read failure in `usePost` is now surfaced as a separate, recoverable `error` state (with one bounded retry) instead of `notFound`. Because `PublicContentPage` only applies `noindex` for `notFound`, a momentary Gateway/network failure can no longer de-index a genuinely public post, while every privacy and audience rule — including the noindex behavior for non-public, missing, and inaccessible content — is preserved.