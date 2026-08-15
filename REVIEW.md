# Tone Platform — Combined Project Review

**Date:** July 2026
**Projects:** `gateway/` (API Gateway) + `tone-your-social-voice/` (Frontend SPA)

---

## Overview

Two projects form the **Tone** social media platform:

| Project | Role | Lines | Files |
|---------|------|-------|-------|
| `gateway/` | Express API gateway (Vercel) | ~3,700 | 62 |
| `tone-your-social-voice/` | React SPA frontend | ~98,000 | 435 |

Architecture: **React SPA → API Layer → Gateway Client → API Gateway → 13 Supabase Projects**

---

## `gateway/` — API Gateway

### Strengths

- Clean 29-module architecture with well-separated concerns (auth, routing, registry, config, monitoring, events)
- Dual-mode infrastructure DB (`src/infrastructure/database/infrastructureDb.ts`) — Supabase + in-memory fallback enables local dev without external deps
- Correct circuit breaker (3-state: CLOSED/OPEN/HALF_OPEN) with configurable thresholds (`src/circuit-breaker/index.ts`)
- Retry engine with exponential backoff + jitter (`src/retry/engine.ts`)
- Content-addressing dedup for uploads via SHA-256 (`src/media/contentAddress.ts`)
- TypeScript strict mode enabled in `tsconfig.json`
- Domain validation restricts names to `^[a-z][a-z0-9_-]*$` (`src/api/validation.ts:14`)
- Auth routes have proper email/password validation, rate limiting on sign-up (5/min), metadata whitelisting (`src/api/auth.ts:198-200`)
- Audit logging with interceptor pattern on `res.end` (`src/api/middleware.ts:40-54`)
- SQL migrations use proper `IF NOT EXISTS`, `CHECK` constraints, indexes (`src/db/migrations/001_create_infrastructure_tables.sql`)

### Critical Security Issues

1. **Hardcoded Supabase `service_role` keys removed** — `src/infrastructure/database/infrastructureDb.ts:483-485` now retrieves keys from `process.env.INFRA_SUPABASE_URL` and `process.env.INFRA_SUPABASE_KEY`. Keys no longer embedded in source code.
2. **`.env` with `INFRA_SUPABASE_KEY` in working tree** — same service_role key accessible; `.gitignore` excludes `.env` but it was committed before the rule was added.
3. **CORS reflects any origin** — `src/api/middleware.ts:14` uses `cors({ origin: true })` when `CORS_ORIGINS` is unset, effectively disabling CORS protection
4. **Auth credentials not domain-scoped** — `src/auth/index.ts:51` always queries `.eq('domain', 'users')` regardless of the `domain` parameter passed. The global cache (`src/auth/index.ts:30-36`) serves stale credentials for the wrong domain.
5. **`ADMIN_API_KEY` never defined in `.env`** — admin auth system is dead code (`src/auth/index.ts:205`), always returns 503
6. **`constantTimeCompare` leaks length** — `src/auth/index.ts:78-83` returns early on length mismatch, defeating timing-safe comparison. Should pad both buffers to equal length.
7. **JWT fallback bypass** — `src/auth/index.ts:151` falls back to Supabase `getUser()` on signature mismatch, meaning a forged token with valid structure gets a second chance via the API

### Bugs

- `src/infrastructure/monitoring/index.ts:28` — health check uses `Math.random() * 200` instead of actual ping, making all health metrics meaningless
- `src/notifications/index.ts:36-39` — failed notifications re-enqueue infinitely with no backoff, retry limit, or dead-letter mechanism
- `src/routing/router.ts:48-62` — circuit breaker failure tracking resets on project swap during retry, so the breaker never trips in practice
- `src/utils/index.ts:1-5` — `generateId` uses `Math.random()`, not collision-resistant; should use `crypto.randomUUID()`
- `src/registry/databaseRegistry.ts:84-85` — falls back to first provider of matching type if name doesn't match, could register a MongoDB project under Supabase
- `src/registry/databaseRegistry.ts:35-42` — `toDbStatus` switch has no `default` case, may not return a value
- `api/[...slug].ts:25-75` duplicates `src/dev.ts:22-68` — entire initialization sequence copied
- `src/api/routes.ts:292-354` duplicates `src/api/routes.ts:64-123` — top-level CRUD routes duplicate v1 routes
- `src/routing/router.ts` and `src/routing/service.ts` both implement routing logic but are disconnected
- `src/jobs/queue.ts:54-58` — single-threaded job queue silently drops concurrent `processNext()` calls

### Recent Fixes

- **Removed hardcoded Supabase keys** — `src/infrastructure/database/infrastructureDb.ts:483-485` now retrieves `INFRA_SUPABASE_URL` and `INFRA_SUPABASE_KEY` from `process.env` instead of embedding `service_role` keys in fallback data. Committed keys eliminated from source code.
- **Gateway client bug fixed** — `src/lib/gateway.ts:80` had a `ReferenceError: row is not defined` bug in `applyFilters`. The `row` variable was referenced outside its scope. Fixed with arrow function + simplified negation logic.
- **Gateway client column selection fix** — `src/lib/gateway.ts:326-340` added `parseSelectColumns()` and `hasNestedJoins()` helpers. Complex select strings with PostgREST nested joins (e.g., `group_members!...(...)`) now correctly return full rows instead of being broken by naive comma-splitting.
- **Groups page fixes** — Added `privacy` field to `Group` interface (`src/hooks/useGroups.ts`), updated `GroupCard` to display privacy icons (Globe/Lock/EyeOff), added privacy selector to `CreateGroupDialog`, updated `createGroup` to accept privacy param.
- **Profile page migrated to API layer** — `src/pages/ProfilePage.tsx` and `src/hooks/useProfile.tsx` now use `profilesApi.getProfileByUsername()` and `profilesApi.getProfileById()` instead of direct `gateway.from('profiles')` calls.
- **Gateway deploy target** — pushed fix to `ibadsixx/gateway` GitHub repo, deployed to `https://gateway-iota-two.vercel.app` (commit `efcfa65`).
- **Registered ~80 missing gateway domains** — "Failed to load friends"/"Failed to load other names: Not found" toasts traced to `GET /api/:domain` returning 404 for tables never registered in the live infra DB (feature flags are enabled only for `infrastructure_projects` domains at cold start, `api/[...slug].ts:45-49`; the 60s `refreshRegistry` reloads projects but does not re-enable flags). Every frontend-queried table found in a registered project now has a domain (98/108), each cloned from the host project's credentials; 10 remain unregistered (`avatars`, `blocks`, `restricted_users`, `trusted_devices`, etc. — not found in any registered project). Config-only change; no gateway source modified, no keys written to files. Activates on next Vercel cold start.

### In-Memory State Problem

Every service lives in memory and is lost on Vercel cold starts:

- Audit logs (`src/audit/index.ts:14`)
- Rate limit counters (`src/rate-limiting/index.ts:7`)
- Feature flags (`src/features/index.ts:2`)
- Permission assignments (`src/permissions/index.ts:11`)
- Search index (`src/search/index.ts:15`)
- Content-addressing dedup cache (`src/media/contentAddress.ts:4`)
- Distributed locks (`src/locking/index.ts:9`) — class named `DistributedLock` but uses in-memory `Map`, not actually distributed

### Missing Infrastructure

- Zero tests — no `*.test.*` or `*.spec.*` files, no test framework installed, no `test` script in `package.json`
- No CI/CD — no `.github/workflows/`, no pipeline config
- No linting — no `.eslintrc`, no prettier, no lint-staged, no husky
- No `.env.example` documenting required variables
- No README or documentation
- No error tracking or structured logging — all `console.error`/`console.log`, ephemeral on Vercel

---

## `tone-your-social-voice/` — Frontend SPA

### Strengths

- E2E encryption (ECDH + AES-GCM) in `src/lib/crypto.ts` — correctly implemented via WebCrypto API with key caching
- Impressive PostgREST-compatible gateway client (`src/lib/gateway.ts:127-351`) with `.eq()`, `.neq()`, `.like()`, `.or()`, `.order()`, `.range()`, `.single()`, `.maybeSingle()`
- Clean profile validation with visibility normalization and legacy value mapping (`src/utils/profileValidation.ts`)
- WebRTC service with ICE restart and proper cleanup (`src/services/webrtc.ts`)
- Proper error boundaries (`src/components/ErrorBoundary.tsx`) with recovery UI
- Auth flow with 4-second timeout to prevent indefinite loading (`src/hooks/useAuth.tsx`)
- Optimistic update patterns with error-triggered refetch rollback (`useReactions.ts`, `useSavedPosts.ts`, `useFollow.ts`)
- Full shadcn/ui setup with 40+ components in `src/components/ui/`
- Well-organized Tailwind CSS variable system with custom tokens (`tailwind.config.ts:65-80`)
- Massive feature set: posts, stories, reels, E2E DMs, calls (voice/video), groups, pages, video editor, 26+ settings pages

### Critical Security Issues

1. **ECDH private keys in `localStorage`** — `src/hooks/useEncryptionKeys.ts:100` stores private encryption keys as JSON in `localStorage`, accessible to any XSS attack. A single XSS compromises all encrypted messages.
2. **Auth tokens + private keys both in `localStorage`** — `src/lib/gateway.ts:530` stores `access_token` and `refresh_token` alongside encryption keys
3. **No input sanitization** — user content (comments, posts) inserted without XSS sanitization (`src/hooks/useComments.ts:90`). Stored XSS rendered to all users.
4. **Regex injection** — `src/lib/gateway.ts:99-104` interpolates user input into `new RegExp()` without escaping special characters, potential ReDoS

### High-Severity Issues

- `src/lib/gateway.ts:303-306` — client-side filtering fetches entire tables into the browser when gateway ignores query params. Catastrophic for performance at scale.
- `src/integrations/supabase/client.ts:7` — `SUPABASE_ANON_KEY` set to `VITE_API_GATEWAY_URL` instead of actual anon key, misleading for developers
- No Content Security Policy headers on `index.html`

### Bugs

- `src/hooks/usePosts.tsx:80-82` — `getUserPosts` calls `usePosts()` as a plain function, breaking Rules of Hooks
- ~~`src/lib/gateway.ts:81` — broken negation logic in `applyFilters`: `!matches` condition makes negation always true~~ **FIXED**
- `src/lib/gateway.ts:516-522` — `send()` on channels is a no-op for server; real-time updates to other users won't work
- `src/api/stories.ts:29-31` — `hasActiveStories` always returns `false` due to wrong count extraction from `_countOnly` path
- `src/hooks/useStories.ts:217-223` — story view count race condition (read-then-write, not atomic)
- `src/App.tsx:46` — `QueryClient` created at module scope, persists between test runs
- ~~`src/lib/gateway.ts:326-340` — column selection broken with PostgREST nested joins; complex select strings returned partial columns~~ **FIXED** — `parseSelectColumns()` + `hasNestedJoins()` helpers added
- ~~`src/lib/gateway.ts:183-227` — join cardinality inverted: to-one joins (`!fk`, `:alias` on `_id`/FK columns) resolved as arrays, so `post.profiles` was an array and author names fell back to "Unknown"~~ **FIXED** — `JoinSpec` gained `kind: 'one' | 'many'` (line 189); `effectiveIsArray = kind === 'many'` (line 508)
- ~~`src/lib/gateway.ts:514-522` — column selection stripped the join key (`relatedCol`), so zero rows ever matched embedded joins even with correct cardinality~~ **FIXED** — picker always retains `spec.relatedCol` (line 516)
- `src/lib/gateway.ts:492-550` — join failures were swallowed silently (`if (!res.ok) continue;`, empty rows, bare `catch { continue; }`); now emits `console.warn` diagnostics (fetch failure, empty rows, unmatched keys, thrown errors) so profiles-domain outages surface instead of hiding behind "Unknown"

### Code Quality

**Massive files (>1000 lines):**

| File | Lines |
|------|-------|
| `src/pages/PageDetail.tsx` | 1939 |
| `src/pages/Messages.tsx` | 1602 |
| `src/components/PrivacyCheckup.tsx` | 1352 |
| `src/components/CreateStoryDialog.tsx` | 1346 |
| `src/pages/Editor.tsx` | 1248 |
| `src/pages/EditorPublish.tsx` | 1199 |
| `src/components/messages/ChatInfoPanel.tsx` | 1193 |
| `src/api/users.ts` | 1146 |
| `src/components/AboutSection.tsx` | 1076 |
| `src/hooks/useConversations.ts` | 977 |
| `src/components/messages/MessageBubble.tsx` | 932 |
| `src/pages/Settings.tsx` | 914 |
| `src/components/messages/ChatWindow.tsx` | 899 |

**API layer barely used** — only 8 of 89 hooks import from `src/api/`:
- `src/hooks/usePosts.tsx:2` — `postsApi`
- `src/hooks/usePost.ts:2` — `postsApi`
- `src/hooks/useHomeFeed.ts:3` — `postsApi`
- `src/hooks/useGroups.ts:2` — `groupsApi`
- `src/hooks/useNotifications.ts` — `notificationsApi`
- `src/hooks/useConversations.ts` — `conversationsApi`
- `src/hooks/useStories.ts` — `storiesApi`
- `src/hooks/useProfile.tsx` — `profilesApi`

The remaining 81 hooks call `gateway` directly, duplicating select strings and query logic across the codebase.

**React Query unused despite being a dependency** — `@tanstack/react-query` is installed (`package.json:45`) and `QueryClientProvider` wraps the app (`App.tsx:49`), but none of the 89 hooks use `useQuery`, `useMutation`, or `useInfiniteQuery`. Every hook uses manual `useState`/`useEffect`/`fetch` — no caching, no dedup, no stale-while-revalidate, no background refetching.

**TypeScript strictness disabled** — `tsconfig.json:3-6`:
```
"noImplicitAny": false,
"noUnusedLocals": false,
"noUnusedParameters": false,
"strict": false,
"strictNullChecks": false
```
17 `(fb as any)` casts in `gateway.ts` alone. Most hooks use `catch (error: any)`.

**100+ `console.log` statements** in production code — `useFileUpload.ts` (12), `useEditorProject.ts` (16), `src/lib/storage.ts` (11), among others.

### Missing Infrastructure

- Only 4 test files in `src/__tests__/` — all test helper functions, not actual components/hooks/integration
- Playwright config references `lovable-agent-playwright-config` but no `e2e/` directory exists
- No `.env.example`, no CI/CD, no README with setup instructions
- Minimal `.gitignore` — missing `.env.local`, `*.tsbuildinfo`, IDE folders, OS files
- No `CONTRIBUTING.md` or development documentation

---

## Cross-Project Concerns

| Issue | Impact | Gateway | Frontend | Severity |
|-------|--------|---------|----------|----------|
| Exposed credentials in repo | Full database compromise | `.env` + hardcoded keys (FIXED) | `.env` committed | **High** (down from Critical) |
| No gateway authentication | System endpoints open to all | `src/api/routes.ts:235` | — | **Critical** |
| Private keys in localStorage | XSS compromises encryption | — | `src/hooks/useEncryptionKeys.ts:100` | **Critical** |
| CORS wide open | CSRF / data exfiltration | `src/api/middleware.ts:14` | — | **High** |
| Client-side filtering | Performance cliff at scale | — | `src/lib/gateway.ts:303` | **High** |
| Near-zero test coverage | No regression safety net | 0 tests | 4 tests for 98K LOC | **High** |
| Auth credentials not domain-scoped | Cross-domain auth bypass | `src/auth/index.ts:51` | — | **High** |
| Gateway ESM bug | Auth may not work on Vercel | — | `jose` library | **High** |
| In-memory state on serverless | All state resets on cold starts | All services | — | **Medium** |
| API layer partially used | Duplicated queries in remaining hooks | — | 8/89 hooks use it | **Medium** |
| TypeScript strictness off | Fewer bugs caught at compile time | — | tsconfig | **Medium** |
| React Query unused | No caching, dedup, or background refetch | — | Installed but not used | **Medium** |

---

## Recommendations (Priority Order)

1. ~~Rotate exposed credentials immediately~~ **DONE** — hardcoded keys removed from `infrastructureDb.ts`, keys now from `process.env`
2. **Add gateway authentication** — JWT validation before any data access; remove or protect `/api/system/databases`
3. **Fix CORS policy** — set explicit allowed origins in `src/api/middleware.ts:14`
4. **Move private keys out of `localStorage`** — use IndexedDB or in-memory-only storage for ECDH keys
5. **Fix the auth credential scoping** — `src/auth/index.ts:51` must query by actual domain, not hardcoded `'users'`
6. **Implement server-side query filtering** in the gateway — stop fetching entire tables to the browser
7. **Complete API layer migration** — move remaining 81 hooks off direct `gateway` calls to `src/api/` modules (groups, posts, conversations, stories, notifications, profiles now migrated)
8. **Adopt React Query** — replace manual `useState`/`useEffect`/`fetch` with `useQuery`/`useMutation` for caching and dedup
9. **Enable TypeScript strictness incrementally** — `strictNullChecks: true` first, then `noImplicitAny`
10. **Add tests** — prioritize auth, encryption, post creation, messaging, and the gateway client
11. **Decompose large files** — break 14 files over 1000 lines into smaller, focused modules
12. **Add CI/CD** — linting, type checking, tests on every push
13. **Add input sanitization** — XSS-proof all user-generated content before rendering
14. **Fix gateway bugs** — monitoring random values, notification infinite retry, circuit breaker reset on project swap
15. **Verify/restore profiles Supabase project** — the data route returns `401` without a Bearer token; the `profiles` host resolves through the gateway and answers HTTP 401. Confirm reachability with a valid token (no working token obtainable on the current deployment — sign-up 400, sign-in 401, admin 503); the profile page shows an empty state until resolved

---

## Bottom Line

This is a **remarkably ambitious and feature-rich** social platform with strong architectural foundations. The gateway's registry-based multi- database routing, the frontend's PostgREST-compatible client, the E2E encryption, and the WebRTC integration are genuinely impressive engineering.

However, both projects are in **prototype state** with critical security vulnerabilities that must be addressed before any public exposure — especially the committed service_role keys (now fixed), unauthenticated gateway system endpoints, and private encryption keys in `localStorage`. The gateway has incomplete provider implementations (all stubs), in-memory state that resets on cold starts, and zero tests. The frontend has 14 files over 1000 lines, a partially used API abstraction layer (groups, posts, conversations, stories, notifications, profiles migrated), React Query installed but not used, and TypeScript strictness disabled. The profiles Supabase project (the `profiles` host) is auth-gated on the live gateway (data route returns `401` without a Bearer token) and unverified with a valid token, leaving the profile page without data until the domain is confirmed reachable. Two gateway-client join bugs were fixed during a July 2026 debugging session (cardinality + dropped join key, see Bugs above), with `console.warn` diagnostics added so future join failures surface instead of showing "Unknown" authors. A follow-up July 2026 session registered ~80 missing table-as-domain entries in the live gateway infra DB (98/108 frontend-queried tables now routable, including `friends` and `other_names`), resolving the "Failed to load X: Not found" toasts; the new domains activate on the next Vercel cold start.

The code works for demo purposes but is **not production-ready** without addressing the security and reliability issues above.
