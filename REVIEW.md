# Tone Platform — Combined Project Review

**Date:** Aug 21, 2026
**Projects:** `gateway/` (API Gateway) + `tone-your-social-voice/` (Frontend SPA)

---

## Overview

Two projects form the **Tone** social media platform:

| Project | Role | Lines | Files |
|---------|------|-------|-------|
| `gateway/` | Express API gateway (Vercel) | ~4,800 | 64 |
| `tone-your-social-voice/` | React SPA frontend | ~98,000 | 440 |

Architecture: **React SPA → API Layer → Gateway Client → API Gateway → 13 Backend Projects**

---

## `gateway/` — API Gateway

### Strengths

- Clean 29-module architecture with well-separated concerns (auth, routing, registry, config, monitoring, events)
- Dual-mode infrastructure DB (`src/infrastructure/database/infrastructureDb.ts`) — Backend + in-memory fallback enables local dev without external deps
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
4. **Auth verification not domain-scoped** — `src/auth/index.ts:158-194` — `getAuthCredentials(domain)` filters by domain and caches per-domain (line 50), but `verifyViaSupabase`/`getSupabaseClient`/`getAnonClient` call it with no argument and default to `'users'`, so JWT fallback always uses the `users` project's credentials, not the requested domain's.
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

- **Hardcoded Supabase references scrubbed from docs (Aug 14, 2026)** — all three documentation files (`PROJECT_REVIEW.md`, `tone-api-gateway.md`, `REVIEW.md` + subfolder copies) sanitized of direct Supabase project IDs, URLs, and service keys. All paths reference the gateway only. No `.env` files modified.
- **TDZ crash + missing `makeSystemCall` fix (Aug 14, 2026)** — `src/hooks/useCall.ts` destructured `CallContext` values outside the provider, causing `ReferenceError: Cannot access before initialization`. Fixed by moving destructuring inside the function body. `makeSystemCall` was never defined in `CallContext`; added and wired through the provider.
- **Realtime channel authorization (Aug 14, 2026, commit `67ce1bd`)** — `GET /api/realtime/subscribe/:channel` now returns `403` unless the channel is the caller's own `calls:<userId>` (previously any authenticated client could subscribe to `calls:<victim>` and read/spoof call signaling); both subscribe and publish validate the `calls:<id>` channel format (`400`). The remaining production caveat is unchanged: the SSE hub is process-local and Vercel Hobby caps function duration at 300s, so signaling is for local dev / best-effort in production.
- **Realtime SSE bridge + ICE endpoint (Aug 14, 2026)** — `ibadsixx/gateway` commit `29f9559`: new `src/realtime/channelHub.ts` (in-memory SSE fan-out hub) and `src/api/realtime.ts` mounted at `/api/realtime` — `GET /api/realtime/subscribe/:channel` (SSE, auth, `init` connId, 25s heartbeat, cleanup on close), `POST /api/realtime/publish` (`{channel, event, payload, excludeConnId}` → `{ok, delivered}`), `GET /api/realtime/ice-servers` (Google STUN + TURN from `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL`, OpenRelay fallback). Powers the frontend's call signaling. Pre-existing `busboy` type errors (`TS2307`/`TS7006` in `src/api/routes.ts`) are unchanged from the base commit; note that the hub is process-local (single Vercel instance).
- **Removed hardcoded Supabase keys** — `src/infrastructure/database/infrastructureDb.ts:483-485` now retrieves `INFRA_SUPABASE_URL` and `INFRA_SUPABASE_KEY` from `process.env` instead of embedding `service_role` keys in fallback data. Committed keys eliminated from source code.
- **`/api/system/databases` removed** — the endpoint that exposed all service keys has been deleted from the gateway source (`src/api/routes.ts:242`); the remaining `/api/system/*` endpoints except `/health` are gated behind `authenticateAdmin` (still 503 while `ADMIN_API_KEY` is undefined).
- **`jose`/`zod`/`pg` are unused** — `package.json` lists them, but `jose` is not imported anywhere (JWT is done manually with `crypto`); no `jose` ESM bug affects auth.
- **Gateway client bug fixed** — `src/lib/gateway.ts:80` had a `ReferenceError: row is not defined` bug in `applyFilters`. The `row` variable was referenced outside its scope. Fixed with arrow function + simplified negation logic.
- **Gateway client column selection fix** — `src/lib/gateway.ts:326-340` added `parseSelectColumns()` and `hasNestedJoins()` helpers. Complex select strings with PostgREST nested joins (e.g., `group_members!...(...)`) now correctly return full rows instead of being broken by naive comma-splitting.
- **Groups page fixes** — Added `privacy` field to `Group` interface (`src/hooks/useGroups.ts`), updated `GroupCard` to display privacy icons (Globe/Lock/EyeOff), added privacy selector to `CreateGroupDialog`, updated `createGroup` to accept privacy param.
- **Profile page migrated to API layer** — `src/pages/ProfilePage.tsx` and `src/hooks/useProfile.tsx` now use `profilesApi.getProfileByUsername()` and `profilesApi.getProfileById()` instead of direct `gateway.from('profiles')` calls.
- **Gateway deploy target** — pushed fix to `ibadsixx/gateway` GitHub repo, deployed to `https://gateway-iota-two.vercel.app` (commit `efcfa65`).
- **Registered ~80 missing gateway domains** — "Failed to load friends"/"Failed to load other names: Not found" toasts traced to `GET /api/:domain` returning 404 for tables never registered in the live infra DB (feature flags are enabled only for `infrastructure_projects` domains at cold start, `api/[...slug].ts:45-49`; the 60s `refreshRegistry` reloads projects but does not re-enable flags). Every frontend-queried table found in a registered project now has a domain (98/105), each cloned from the host project's credentials. Re-audited Aug 2, 2026: 7 tables still lack a domain (`media_library`, `restricted_users`, `trusted_devices` — created by migrations in the users project but missed by the probe; `blocks` — only `blocking` registered, name mismatch; `blocked_nicknames`, `hashtag_follows`, `message_audios`), and `avatars`/`covers`/`group_covers` are storage buckets, not tables. Config-only change; no gateway source modified, no keys written to files.
- **Feature flags re-enabled on registry refresh** — gateway `e3ee66d` (`src/dev.ts`): the 60s `refreshRegistry()` now calls `featureFlags.enable(domain)` after each reload, so domains registered in the live infra DB activate on the next refresh cycle instead of waiting for a Vercel cold start.
- **Chat RPCs replaced with gateway table queries** — frontend `c57b6f2`: `get_or_create_dm`, `get_conversations_with_info`, `mark_messages_read`, `get_message_read_status`, `get_my_read_message_ids`, `mark_message_delivered` 42P01 on live calls (joins span multiple projects, e.g. `relation "blocks" does not exist`). Replaced in `src/api/conversations.ts` (+161: `getOrCreateDM`, `markConversationMessagesRead`, `getConversationReadStatus`, `getMyReadMessageIds`, `markMessageDelivered`), `src/hooks/useConversations.ts`, `src/hooks/useMessagingSystem.ts`.
- **Call state stuck after WebRTC disconnect fixed (Aug 19, 2026, frontend `ae5a69b`)** — `onConnectionStateChange` handler in `src/contexts/call/CallContext.tsx:127-158` now sends `call-ended` signal to the remote peer + logs to DB before calling `resetCallState()` on `'failed'`/`'disconnected'` (including ICE restart failure). Previously the remote peer was never notified, leaving it stuck in `connecting`/`connected` and rejecting new calls with "busy". Added `beforeunload` listener (`CallContext.tsx:397-411`) to send `call-ended` on tab close.
- **Voice call audio race condition fixed (Aug 19, 2026, frontend `ae5a69b`)** — `ActiveCallWindow.tsx:116-123` `useEffect` that attaches `remoteStream` to `<audio>` now includes `status` in its dependency array. Without it, the effect ran before the ref was available when the component first mounted (both `remoteStream` and `status: 'connected'` set in the same state update). Also added autoplay retry on user gesture when browser blocks `.play()`.
- **Stuck-busy self-healing fixed (Aug 21, 2026, frontend `b5c54ff`)** — the Aug 19 fix only covered graceful disconnects; three holes still left peers permanently non-idle so every incoming call got auto-"busy": (1) a crashed/killed tab never ran cleanup, leaving the cross-tab localStorage counter (`tone-call-active-count:<uid>`) >0 **forever — surviving reloads**; (2) Vercel Hobby kills SSE at 300s, so calls >5 min always hit a signaling reconnect gap where a published `call-ended` is lost with no replay; (3) the busy reply never verified the local call was alive and there was no callee ring timeout. Fixes in `CallContext.tsx` + `callTabCoordinator.ts`: counter entries now carry a heartbeat timestamp (15s interval while in a call) and entries stale >75s are cleared on read — legacy bare-number values are treated as stale, so already-stuck users heal on next page load; incoming `call-request` self-heals when the own peer connection is `failed`/`closed`/missing instead of replying busy; a watchdog ends zombie `'connected'` calls whose peer connection died silently; a 45s ring timeout auto-releases unanswered incoming calls; `call-ended` publishes retry twice on `delivered=0`; `resetCallState()` only decrements the counter if this tab entered (`inCallRef`). `npx tsc --noEmit` ✓ 0 errors; eslint ✓ 0 errors (1 pre-existing warning); build ✓.
- **Facebook-style call log messages added to chat (Aug 21, 2026, frontend `2042cfb`)** — missed / ended / declined / disconnected calls now leave one system message in the shared DM (caller writes it, same single-writer rule as call_history). No schema change: new `src/lib/callLog.ts` encodes `{status, callType, duration}` as a JSON envelope in plaintext `content` with `is_system: true` (the `message_type` enum has no `'call'` value); `sendCallLogMessage()` in `src/api/conversations.ts` resolves the DM via `getOrCreateDM` + inserts; `CallContext.logCallMessage()` fires alongside every existing `logCallToDb()` site (`endCall`, remote `call-ended`, no-answer/connection timeouts, `call-rejected`, `notifyRemoteAndReset` — which now records `completed` when the peer had connected); `MessageBubble.tsx` renders the row as a centered pill (red for missed/disconnected, icons per type/status, duration + time), `MiniChatWindow.tsx` shows a compact pill, and conversation-list previews show readable labels via `previewContent()` in `useConversations.ts`. Fire-and-forget — a failed write never blocks teardown. **Follow-up (`e195da5`):** the gateway client's `postgres_changes` listeners never fire (no server push), so an already-open chat never showed the new entry until reload — `sendCallLogMessage` now dispatches a `tone:call-log` window event after a successful insert, and `useConversations` listens for it to refresh the list preview + refetch the open conversation. tsc ✓ 0 errors; eslint ✓ 0 errors (3 pre-existing warnings); build ✓.

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
- ~~`src/integrations/supabase/client.ts:7` — `SUPABASE_ANON_KEY` set to `VITE_API_GATEWAY_URL` instead of actual anon key, misleading for developers~~ **RESOLVED** — `client.ts` is now a type-only re-export (`export type { Database }`); no client is created and no env vars are read
- No Content Security Policy headers on `index.html`

### Bugs

- `src/hooks/usePosts.tsx:80-82` — `getUserPosts` calls `usePosts()` as a plain function, breaking Rules of Hooks
- ~~`src/lib/gateway.ts:81` — broken negation logic in `applyFilters`: `!matches` condition makes negation always true~~ **FIXED**
- `src/lib/gateway.ts:516-522` — `send()` on channels is a no-op for server; real-time updates to other users won't work. **Call signaling now bypasses this** via the gateway SSE bridge (`src/lib/callRealtime.ts`, Aug 14, 2026); the mock `GatewayChannel` is still used for non-call realtime.
- ~~`src/api/stories.ts:29-31` — `hasActiveStories` always returned `false` due to wrong count extraction from the `_countOnly` path~~ **NO LONGER PRESENT** — current implementation uses `.select('id').gt('expires_at', ...).limit(1)` + `length > 0`; no count extraction involved
- `src/hooks/useStories.ts:217-223` — story view count race condition (read-then-write, not atomic)
- `src/App.tsx:46` — `QueryClient` created at module scope, persists between test runs
- ~~`src/lib/gateway.ts:326-340` — column selection broken with PostgREST nested joins; complex select strings returned partial columns~~ **FIXED** — `parseSelectColumns()` + `hasNestedJoins()` helpers added
- ~~`src/lib/gateway.ts:183-227` — join cardinality inverted: to-one joins (`!fk`, `:alias` on `_id`/FK columns) resolved as arrays, so `post.profiles` was an array and author names fell back to "Unknown"~~ **FIXED** — `JoinSpec` gained `kind: 'one' | 'many'` (line 189); `effectiveIsArray = kind === 'many'` (line 508)
- ~~`src/lib/gateway.ts:514-522` — column selection stripped the join key (`relatedCol`), so zero rows ever matched embedded joins even with correct cardinality~~ **FIXED** — picker always retains `spec.relatedCol` (line 516)
- `src/lib/gateway.ts:492-550` — join failures were swallowed silently (`if (!res.ok) continue;`, empty rows, bare `catch { continue; }`); now emits `console.warn` diagnostics (fetch failure, empty rows, unmatched keys, thrown errors) so profiles-domain outages surface instead of hiding behind "Unknown"
- ~~`src/lib/gateway.ts` — `not()` operator serialized as `{col}=not.{op}.{value}`, which parsed to the wrong column/operator and silently matched nothing~~ **FIXED (Aug 2, 2026)** — both builders now emit PostgREST-correct `not.{col}={op}.{value}` (`parseFilter()`); `is` handles `null`/`true`/`false`; count joins return `[{ count }]`; bulk `.update()` without `id=eq.` falls back to fetch → client-side filter → per-id `PUT /api/v1/:domain/:id` (`_bulkUpdate`, 401 → session refresh)
- `src/hooks/usePeopleYouMayKnow.ts` (Aug 2, 2026) — the gateway's `/api/rpc/:function` proxy (`src/api/routes.ts:283`, mounted at `routes.ts:390`) is auth-gated and routes to the `users` project by default (only `seed_default_ad_topics` is overridden), so `get_people_you_may_know` was unusable on the live deployment (no working Bearer token — sign-up 400, sign-in 401). Root cause pinned Aug 4, 2026 to GoTrue on the users project returning `500 "Database error creating new user"` (failing trigger/constraint on `auth.users`), not a gateway bug — FIXED live (dead `on_auth_user_created` trigger dropped; sign-up/sign-in now work; see `sql/fix_auth_users_project.sql`). The hook still reproduces the RPC client-side from 4 table queries (profiles, friends, followers, blocks) with a mutual-friend graph. Trade-off: fetches entire `profiles`/`friends` tables per render
- Error/retry UX (Aug 2, 2026) — `useNotifications`, `useFollowedHashtagsFeed`, `useExplorePosts` expose `error` + `refresh`/`retry`; `NotificationsDropdown`, `NotificationsPage`, `FollowedHashtags`, `Search` render error states with Retry buttons instead of silent empty/spinner states
- **Calls via gateway SSE + voice audio fix (Aug 14, 2026, commit `e1ab7e6`)** — `src/lib/callRealtime.ts` + `src/contexts/call/useCallSignaling.ts` replaced the local-only mock `GatewayChannel` for signaling with the gateway SSE bridge (`GET /api/realtime/subscribe/:channel` + `POST /api/realtime/publish`; Bearer auth, 401 → session refresh, exponential-backoff reconnect). Call buttons in `MiniChatWindow` were **no-ops** (no `onClick`) and are now wired to `initiateCall` (voice/video), disabled while in call; `CallContext.initiateCall` early-return now toasts instead of failing silently. Voice calls had **no audio output** (remote stream was only attached to the video element rendered for video calls) — `ActiveCallWindow` now attaches the remote stream to a hidden `<audio>` element when `callType === 'voice'`.
- **WebRTC ICE/TURN from gateway (Aug 14, 2026)** — `src/services/webrtc.ts` fetches `/api/realtime/ice-servers` (cached, STUN-only fallback) and lazily creates the `RTCPeerConnection` on first use so the fetched servers apply; `cleanup()` no longer recreates the connection.
- **Chat input + messaging dialogs (Aug 14, 2026)** — `MessageInput.tsx` groups the text field + send button in one atomic non-wrapping flex container (send can no longer wrap below the input); `CreateChannelDialog`/`CreateGroupChatDialog`/`ChatInfoPanel` replaced the unrouted RPCs (`create_channel_conversation`, `create_group_conversation`, `update_messaging_controls`) with gateway table inserts/updates (`conversations`, `conversation_participants`, `allow_message_sharing`) and accept `currentUserId` so the creator is inserted as owner/admin; `ChatWindowManager` moved the minimized window from `left-4` to `right-20`. `npx tsc --noEmit` ✓ 0 errors.
- **Calls system audit fixes (Aug 14, 2026, commit `4c78c9c`)** — (1) call history now writes exactly one caller-owned row per call: the `call-ended` handler only logs on the outgoing side (was `!isOutgoing` with reversed arg order → receiver-ended calls logged 0 times, caller-ended twice) and the 20s connection-failure timeout logs `failed`; matches the schema's RLS `auth.uid() = caller_id` (migration `20260127221309`). (2) `ice-candidate` frames queue whenever `hasRemoteDescription()` is false, fixing candidates dropped during the `connecting` window. (3) new `src/contexts/call/callTabCoordinator.ts` — cross-tab localStorage counter + storage events prevent double-ring/double-accept and auto-answer `call-busy`. (4) `send()` returns `{ok, delivered}`; `initiateCall` toasts "User May Be Offline" on 0 deliveries. (5) `webrtc.ts` ICE cache now TTLs (5 min), retries on failure (no more STUN-only pinning), and refreshes the session on 401. (6) `useConnectionQuality` reads `getPeerConnection()` per tick instead of a render-time snapshot. `npx tsc --noEmit` ✓ 0 errors; eslint 0 errors (1 pre-existing `react-refresh` warning).
- ~~**Call state cleanup bug (Aug 14, 2026)** — `src/contexts/call/CallContext.tsx` `onConnectionStateChange` handler (line 127-157) calls `resetCallState()` on 'failed'/'disconnected' WITHOUT sending `call-ended` signal to the remote peer. Callee's status stays non-idle → subsequent call attempts are rejected with "busy" even though no call is active. The `endCall()` function (line 558-584) does send `call-ended` before reset, but the connection-state-change path does not.~~ **FIXED (Aug 19, 2026, `ae5a69b`)** — `notifyRemoteAndReset()` helper sends `call-ended` + logs to DB before `resetCallState()` in both `'failed'` and `'disconnected'` (ICE restart failure) paths. Added `beforeunload` listener for tab close.
- ~~**No audio during connected WebRTC calls (Aug 14, 2026)** — `src/services/webrtc.ts` `ontrack` handler fires and `remoteStream` is set in state, but `ActiveCallWindow` `<audio>` element may not produce sound. Possible causes: (1) autoplay policy blocks `.play()` when called from an async chain where the user gesture has expired, (2) `event.streams[0]` may be undefined in some edge cases (no fallback to create MediaStream from track), (3) mic obtained but audio track not added to RTCPeerConnection. Audio path traced through all files — code flow appears correct.~~ **FIXED (Aug 19, 2026, `ae5a69b`)** — root cause was a race condition: `useEffect` at `ActiveCallWindow.tsx:116-123` depended on `[remoteStream, callType]` but not `status`, so it ran before the `<audio>` ref mounted. Added `status` to deps + autoplay retry on user gesture.

### Code Quality

**Massive files (>1000 lines):**

| File | Lines |
|------|-------|
| `src/integrations/supabase/types.ts` | 5005 (auto-generated) |
| `src/pages/PageDetail.tsx` | 1939 |
| `src/pages/Messages.tsx` | 1596 |
| `src/components/PrivacyCheckup.tsx` | 1331 |
| `src/components/CreateStoryDialog.tsx` | 1346 |
| `src/pages/Editor.tsx` | 1248 |
| `src/pages/EditorPublish.tsx` | 1199 |
| `src/components/messages/ChatInfoPanel.tsx` | 1182 |
| `src/api/users.ts` | 1153 |
| `src/components/AboutSection.tsx` | 1076 |
| `src/lib/gateway.ts` | 1146 |

**API layer partially used** — 13 of 89 hooks import from `src/api/`:
- `src/hooks/usePosts.tsx` — `postsApi`
- `src/hooks/usePost.ts` — `postsApi`
- `src/hooks/useHomeFeed.ts` — `postsApi`
- `src/hooks/useGroups.ts` — `groupsApi`
- `src/hooks/useProfile.tsx` — `profilesApi`
- `src/hooks/useFriendship.ts` — `blockingApi`
- `src/hooks/useBlocks.ts` — `blockingApi`
- `src/hooks/useContentFiltering.ts` — `blockingApi`
- `src/hooks/usePeopleYouMayKnow.ts` — `blockingApi`
- `src/hooks/useAdPreferences.ts` — `adsApi`
- `src/hooks/useNotifications.ts` — `notificationsApi` + `profilesApi`
- `src/hooks/useConversations.ts` — `conversationsApi` (added Aug 4, 2026)
- `src/hooks/useMessagingSystem.ts` — `conversationsApi` (added Aug 4, 2026)

The remaining 76 hooks call `gateway` directly, duplicating select strings and query logic across the codebase.

**React Query nearly unused despite being a dependency** — `@tanstack/react-query` is installed (`package.json:45`) and `QueryClientProvider` wraps the app (`App.tsx:49`), but only 1 of the 89 hooks (`src/hooks/useMusicLibrary.ts`) uses `useQuery`/`useMutation`; the rest use manual `useState`/`useEffect`/`fetch` — no caching, no dedup, no stale-while-revalidate, no background refetching.

**TypeScript strictness disabled** — `tsconfig.json:3-6`:
```
"noImplicitAny": false,
"noUnusedLocals": false,
"noUnusedParameters": false,
"strict": false,
"strictNullChecks": false
```
13 `(fb as any)` casts (16 `as any` total) in `gateway.ts` alone. Most hooks use `catch (error: any)`.

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
| System endpoints admin-gated but dead | `ADMIN_API_KEY` unset → 503; `/api/system/databases` removed (Aug 2026) | `src/api/routes.ts:235` | — | **Medium** |
| Private keys in localStorage | XSS compromises encryption | — | `src/hooks/useEncryptionKeys.ts:100` | **Critical** |
| CORS wide open | CSRF / data exfiltration | `src/api/middleware.ts:14` | — | **High** |
| Client-side filtering | Performance cliff at scale | — | `src/lib/gateway.ts:303` | **High** |
| Near-zero test coverage | No regression safety net | 0 tests | 4 tests for 98K LOC | **High** |
| Auth credentials not domain-scoped | Cross-domain auth bypass | `src/auth/index.ts:51` | — | **High** |
| `/api/rpc` auth-gated & users-only | RPC-backed features fall back to client-side emulation (full-table fetches); proxy exists (`routes.ts:283`) but needs a token + domain routing | gateway | `usePeopleYouMayKnow` | **Medium** |
| In-memory state on serverless | All state resets on cold starts | All services | — | **Medium** |
| API layer partially used | Duplicated queries in remaining hooks | — | 13/89 hooks use it | **Medium** |
| TypeScript strictness off | Fewer bugs caught at compile time | — | tsconfig | **Medium** |
| React Query nearly unused | No caching, dedup, or background refetch | — | 1/89 hooks use it | **Medium** |
| Call signaling was local-only mock | Calls couldn't ring across browsers | — | `GatewayChannel` mock → `callRealtime.ts` SSE client | **Fixed Aug 14, 2026** — gateway SSE bridge (`/api/realtime`) + WebRTC ICE/TURN from gateway |
| Call state stuck after WebRTC disconnect | Remote peer stays "busy" indefinitely after connection failure | — | `CallContext.tsx:127-157` missing `call-ended` signal | **Fixed Aug 19, 2026** — sends `call-ended` + DB log before `resetCallState()`; `beforeunload` listener for tab close |
| Stuck-busy relapse (crashed tab / lost signals) | Crashed tab's localStorage counter blocks all incoming calls forever (survives reloads); `call-ended` lost in SSE reconnect gaps leaves zombie state; busy reply never checked call liveness | — | `CallContext.tsx` + `callTabCoordinator.ts` | **Fixed Aug 21, 2026 (`b5c54ff`)** — heartbeat + 75s staleness self-heal, zombie-check before busy, watchdog, 45s ring timeout, `call-ended` retry on `delivered=0` |
| No audio during voice calls | Remote stream never attaches to `<audio>` element | — | `ActiveCallWindow.tsx:116-123` missing `status` dep | **Fixed Aug 19, 2026** — added `status` to effect deps + autoplay retry |
| Calls left no trace in chat (unlike Messenger) | Missed/ended/declined/disconnected calls invisible in conversation history | — | Call log system messages (`2042cfb`): `callLog.ts` + `sendCallLogMessage()` + `CallContext.logCallMessage()` + pill rendering in `MessageBubble`/`MiniChatWindow` | **Fixed Aug 21, 2026** — one caller-owned system row per call via JSON envelope in `content` (no schema change); readable previews; busy dials intentionally not logged |

---

## Recommendations (Priority Order)

1. ~~Rotate exposed credentials immediately~~ **PARTIAL** — hardcoded keys removed from `infrastructureDb.ts`; keys now from `process.env`, but the local `gateway/.env` still holds the key and rotation of the previously-committed key is unconfirmed
2. **Add gateway authentication** — JWT validation before any data access; `/api/system/databases` already removed (Aug 2026)
3. **Fix CORS policy** — set explicit allowed origins in `src/api/middleware.ts:14`
4. **Move private keys out of `localStorage`** — use IndexedDB or in-memory-only storage for ECDH keys
5. **Fix the auth credential scoping** — `src/auth/index.ts:51` must query by actual domain, not hardcoded `'users'`
6. **Implement server-side query filtering** in the gateway — stop fetching entire tables to the browser
7. **Complete API layer migration** — move remaining 76 hooks off direct `gateway` calls to `src/api/` modules (posts, groups, profiles, blocking, ads, notifications, conversations now migrated)
8. **Adopt React Query** — replace manual `useState`/`useEffect`/`fetch` with `useQuery`/`useMutation` for caching and dedup
9. **Enable TypeScript strictness incrementally** — `strictNullChecks: true` first, then `noImplicitAny`
10. **Add tests** — prioritize auth, encryption, post creation, messaging, and the gateway client
11. **Decompose large files** — break 10 files over 1000 lines (excluding auto-generated `types.ts`) into smaller, focused modules
12. **Add CI/CD** — linting, type checking, tests on every push
13. **Add input sanitization** — XSS-proof all user-generated content before rendering
14. **Fix gateway bugs** — monitoring random values, notification infinite retry, circuit breaker reset on project swap
15. **Verify/restore profiles host project** — the data route returns `401` without a Bearer token; the `profiles` host resolves through the gateway and answers HTTP 401. Confirm reachability with a valid token (sign-up/sign-in were fixed Aug 4, 2026 — a token is now obtainable, so this can finally be verified); the profile page shows an empty state until resolved

---

## Bottom Line

This is a **remarkably ambitious and feature-rich** social platform with strong architectural foundations. The gateway's registry-based multi- database routing, the frontend's PostgREST-compatible client, the E2E encryption, and the WebRTC integration are genuinely impressive engineering.

However, both projects are in **prototype state** with critical security vulnerabilities that must be addressed before any public exposure — especially the committed service_role keys (now fixed), gateway system endpoints gated behind an undefined `ADMIN_API_KEY` (all 503; the key-exposing `/api/system/databases` endpoint has been removed), and private encryption keys in `localStorage`. The gateway has incomplete provider implementations (all stubs), in-memory state that resets on cold starts, and zero tests. The frontend has 10 files over 1000 lines (excluding auto-generated `types.ts`), a partially used API abstraction layer (posts, groups, profiles, blocking, ads, notifications, conversations migrated; 13/89 hooks), React Query installed but used by only 1 of 89 hooks, and TypeScript strictness disabled. The profiles host project is auth-gated on the live gateway (data route returns `401` without a Bearer token) and unverified with a valid token, leaving the profile page without data until the domain is confirmed reachable. Two gateway-client join bugs were fixed during a July 2026 debugging session (cardinality + dropped join key, see Bugs above), with `console.warn` diagnostics added so future join failures surface instead of showing "Unknown" authors. A follow-up July 2026 session registered ~80 missing table-as-domain entries in the live gateway infra DB (98/105 frontend-queried tables now routable, including `friends` and `other_names`), resolving the "Failed to load X: Not found" toasts; the new domains now activate on the next registry refresh — the gateway re-enables feature flags after each reload (`e3ee66d`), removing the cold-start wait. An Aug 2, 2026 session fixed the gateway-client `not.` operator serialization, added `is`/count-join support and a bulk-update fallback, reimplemented PeopleYouMayKnow client-side (the gateway's `/api/rpc/:function` proxy is auth-gated and defaults to the `users` project, and no working token could be obtained), and added error/retry states across the notifications and explore surfaces. An Aug 4, 2026 session replaced the broken cross-project chat RPCs with per-domain gateway table queries in `src/api/conversations.ts` (`c57b6f2`), fixing DM open/read-status/delivery flows that 42P01'd on the live gateway.

The code works for demo purposes but is **not production-ready** without addressing the security and reliability issues above.
