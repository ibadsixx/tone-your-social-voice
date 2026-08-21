# Project Review: Tone — Social Network for Mood & Connection

**Project Path:** `/workspaces/codespaces-blank/tone-your-social-voice`

**Purpose:** A full-featured social media platform (Facebook/Instagram-style) focused on mood-based expression and connection, built as a React SPA.

## Tech Stack

- **Frontend:** React 18, TypeScript 5, Vite 5, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend:** API Gateway (`https://gateway-iota-two.vercel.app`) → 13 backend projects
- **State Management:** TanStack React Query + React Context (no Redux)
- **Testing:** Playwright (E2E) + Vitest (unit)
- **Deployment:** Vercel + Cloud

## Key Features

1. **Posts** — text/media with mood/feeling tags, audience controls, scheduling, reactions, comments, mentions, hashtags
2. **Stories** — 24hr ephemeral content with music, polls, questions, stickers, highlights, analytics; full story editor with text overlays (8 fonts, weight/color, shadows, alignment, direction), @mention tagging, drawing/doodle tools (pen/neon/marker/eraser), filters (brightness/contrast/saturation/temperature/blur), music picker (library browser, URL import, trimmer), and drag-to-reposition
3. **Reels** — vertical 9:16 short-form video, double-tap to like, music overlay
4. **Direct Messaging** — E2E encrypted (ECDH + AES-GCM), GIFs, stickers, voice messages, polls, read receipts, typing indicators, vanish mode
5. **Voice/Video Calls** — WebRTC (STUN + TURN) with signaling through the gateway's SSE bridge, call history
6. **Groups** — public/private groups with membership roles and posts
7. **Pages** — business/brand profiles with analytics and activity logs
8. **Video Editor** — CapCut-style multi-track editor (video, audio, text, emoji layers), filters, effects, timeline trim/split, undo/redo, autosave
9. **Search** — people, pages, groups with keyboard nav + explore grid
10. **Hashtags** — follow, feed, analytics, notification settings
11. **Settings** — privacy checkup, ad prefs, activity log, blocked users, 2FA, display/accessibility (reduced motion, high contrast, font scaling)

## Architecture

- SPA with React Router (flat routing, ~30+ routes)
- Provider composition: Auth → Call → PageSwitch → Theme → Query → Tooltip
- **Unified API layer** (`src/api/`) — 14 domain modules with typed functions, sits between hooks/components and gateway client
- Custom hooks (~85+) encapsulate all API calls and business logic
- Layout: sticky header + fixed icon sidebar (tooltips) + main content + floating chat windows
- Database: 80+ tables with auto-generated TypeScript types, 230 SQL migrations
- 5 Edge Functions (geocoding, GIF search, audio transcription, scheduled posts, expired message cleanup)
- All 230 migrations applied via the gateway infrastructure layer

## Recent Changes

### Latest — Facebook-Style Call Log Messages in Chat (Aug 21, 2026, frontend `2042cfb`)

- **Call events now leave a message in the conversation** (previously calls vanished without a trace in chat, unlike Messenger) — every terminal call path writes **one system message to the shared DM**, written by the caller only (same single-writer rule as `call_history`), visible to both participants:
  - `ended` (with duration) — completed call; `missed` — no answer / caller cancelled before connect; `declined` — receiver rejected; `failed` ("disconnected") — connection timeout, ICE failure, or watchdog zombie teardown. Busy dials intentionally log nothing.
- **Storage without schema changes** (`src/lib/callLog.ts` new) — the `messages` table's `message_type` enum has no `'call'` value, so the row uses `is_system: true` + plaintext `content` holding a JSON envelope (`{"__call":{status,callType,duration}}`). `parseCallLog()` safely parses it and falls back to normal rendering for any other content (backward compatible).
- **API** (`src/api/conversations.ts`) — new `sendCallLogMessage()`: resolves/creates the DM via existing `getOrCreateDM`, inserts the system row. Fire-and-forget from `CallContext` — a failed write never blocks call teardown.
- **Live update fix (`e195da5`)** — the gateway client's `postgres_changes` listeners never fire (no server push), so an already-open chat/list never showed the new entry until a full reload — the reported "no message is showing up". `sendCallLogMessage` now dispatches a `tone:call-log` window event after a successful insert; `useConversations` listens for it, refreshes the list preview (debounced) and refetches the open conversation. Write failures are now logged (`console.warn`) instead of swallowed silently.
- **Hook-in points** (`src/contexts/call/CallContext.tsx`) — new `logCallMessage()` called alongside every existing `logCallToDb(...)` site: `endCall`, remote `call-ended`, no-answer timeout, 20s connection timeout, `call-rejected`, and `notifyRemoteAndReset()` (which now also records `completed` instead of `failed` when the peer had connected). Dep arrays updated.
- **Rendering** (`MessageBubble.tsx`, `MiniChatWindow.tsx`) — call-log rows render as a centered pill (not a bubble): red accent + `PhoneMissed`/`VideoOff` for missed/disconnected, `PhoneOff` for declined, `Phone`/`Video` for ended with duration (`1:05` style) and relative time. Conversation-list previews (`useConversations.ts` → `ConversationList`) show readable labels ("Missed voice call") via `previewContent()`; live INSERT listener picks the row up in an open chat like a normal message.
- **Verification:** `npx tsc --noEmit` ✓ 0 errors; eslint on changed files ✓ 0 errors (3 pre-existing warnings); `vite build` ✓ (25s). Commit `2042cfb` pushed to `ibadsixx/tone-your-social-voice`.

### Stuck-Busy Self-Healing (Aug 21, 2026, frontend `b5c54ff`)

- **Root cause of recurring "The user is currently in another call"** — the Aug 19 fix (`ae5a69b`) only covered *graceful* disconnects. Three holes still left a peer permanently non-idle, so every incoming `call-request` was auto-answered with `call-busy` (`src/contexts/call/CallContext.tsx`):
  1. **Stale cross-tab flag** — a tab crashed/killed mid-call never runs cleanup, so the localStorage counter (`tone-call-active-count:<uid>`) stayed >0 forever — surviving reloads — and `callTabCoordinator.isActive()` blocked all incoming calls.
  2. **Lost `call-ended` during SSE reconnect** — Vercel Hobby kills SSE streams at 300s, so calls longer than ~5 minutes always hit a signaling reconnect gap on both sides; an end/failed publish landing in that gap is lost (no replay on the gateway hub), leaving zombie `connecting`/`connected` state.
  3. **No self-healing** — the busy reply never verified the local call was actually alive; the callee had no ring timeout; nothing detected silent peer death.
- **Fixes:**
  - **Heartbeat + staleness for the cross-tab counter** (`src/contexts/call/callTabCoordinator.ts`) — entries now store `{count, ts}`; `CallContext` heartbeats every 15s while any call is active; entries stale >75s are cleared on read instead of reporting active. Legacy bare-number entries are treated as already stale, so users already stuck by the old format heal automatically on next page load (no manual cache clearing).
  - **Zombie-check before replying busy** (`CallContext.tsx` `call-request` handler) — when non-idle, the handler first reads `webrtc.getConnectionState()`: if `failed`/`closed`/missing, local state is reset and the incoming call is accepted instead of auto-busy.
  - **Watchdog interval** (`CallContext.tsx`) — while any call is active: heartbeats the coordinator and ends zombie `'connected'` calls whose peer connection died without firing the state-change callback (via the shared `notifyRemoteAndReset()`).
  - **45s callee ring timeout** (`CallContext.tsx`) — an unanswered incoming call auto-releases (sends `call-rejected`, marks resolved, resets), so a vanished caller cannot leave us ringing — and non-idle — indefinitely.
  - **`call-ended` delivery retry** (`publishCallEnded()` in `CallContext.tsx`) — retries twice (2s apart) when the publish reports `delivered=0`, covering the callee's typical SSE reconnect window.
  - **Counter decrement guard** — `resetCallState()` only calls `exitCall()` if this tab actually entered a call (`inCallRef`), preventing one tab's reset from zeroing another tab's legitimate count.
- **Verification:** `npx tsc --noEmit` ✓ 0 errors; eslint ✓ 0 errors (1 pre-existing `react-refresh` warning); `vite build` ✓ (30s). Commit `b5c54ff` pushed to `ibadsixx/tone-your-social-voice`.

### Call State Stuck Fix + Voice Audio Fix (Aug 19, 2026, frontend `ae5a69b`)

- **Fixed call state stuck after WebRTC disconnect** (`src/contexts/call/CallContext.tsx:127-158`) — `onConnectionStateChange` handler now sends `call-ended` signal to the remote peer + logs to DB before calling `resetCallState()` on `'failed'`/`'disconnected'` states (including ICE restart failure). Previously the remote peer was never notified, leaving it stuck in `connecting`/`connected` and rejecting new calls with "The user is currently in another call." Extracted `notifyRemoteAndReset()` helper for both paths. Added `logCallToDb` to `setupWebRTCCallbacks` dependency array.
- **Added `beforeunload` listener** (`src/contexts/call/CallContext.tsx:397-411`) — new `useEffect` sends `call-ended` to remote peer when user closes the tab mid-call, preventing stale state on the other side.
- **Fixed voice call audio race condition** (`src/components/calls/ActiveCallWindow.tsx:116-123`) — added `status` to the `useEffect` dependency array that attaches `remoteStream` to the `<audio>` element. Without it, the effect ran before the ref was available when the component first mounted (both `remoteStream` and `status: 'connected'` set in the same state update). Also added autoplay retry on user gesture (click/touchstart) when browser blocks `.play()`.
- **Verification:** `npx tsc --noEmit` ✓ 0 errors; eslint 0 errors (1 pre-existing `react-refresh` warning). Commit `ae5a69b` pushed to `ibadsixx/tone-your-social-voice`.

### Hardcoded Supabase References Scrubbed + TDZ Crash Fix (Aug 14, 2026)

- **Sanitized hardcoded Supabase references** (`PROJECT_REVIEW.md`, `tone-api-gateway.md`, `REVIEW.md` + subfolder copies) — removed all direct Supabase project IDs, URLs, and service keys from documentation. All paths now reference the gateway only. No `.env` files modified.
- **Fixed TDZ crash in `useCall`** (`src/hooks/useCall.ts`) — destructuring `makeSystemCall` and `endCall` from `CallContext` before the provider mounted caused a `ReferenceError: Cannot access before initialization`. Moved destructuring inside the function body so it runs after the provider provides the context value.
- **Fixed missing `makeSystemCall` in `CallContext`** — the hook referenced `makeSystemCall` which was never defined. Added the function to `CallContext` and wired it through the provider.

### Calls System Problem Audit & Fixes (Aug 14, 2026, frontend `4c78c9c`, gateway `67ce1bd`)

- **Call history: exactly one caller-owned row per call** (`src/contexts/call/CallContext.tsx`) — the schema is one row per call with RLS `auth.uid() = caller_id`; previously a receiver-ended call was logged **zero** times (receiver's `endCall` only logged when `isOutgoing`, and the remote `call-ended` handler only logged when `!isOutgoing`, with reversed arg order) and a caller-ended call was logged twice. The `call-ended` handler now records only on the outgoing side (`logCallToDb(user.id, remoteUser.id, ...)`), and the 20s connection-failure timeout now logs `failed` instead of nothing. Every terminal path (completed / missed / declined / busy / failed) now writes exactly one row, visible to both participants via `get_call_history`.
- **ICE candidates queued until remote description is set** (`src/contexts/call/CallContext.tsx`) — candidates arriving during negotiation used to hit `addIceCandidate` while the async `offer`/`answer` handler was still inside `setRemoteDescription`, throwing "Remote description not set" and dropping the candidate. The `ice-candidate` case now queues whenever `hasRemoteDescription()` is false and flushes after `setRemoteDescription` completes (already hooked in both handlers).
- **Gateway channel authorization** (`gateway/src/api/realtime.ts`, commit `67ce1bd`) — `GET /api/realtime/subscribe/:channel` previously let any authenticated client subscribe to *any* `calls:<id>` and read/spoof another user's signaling. Subscribe now only accepts your own `calls:<yourUserId>` (else `403`); both routes validate the `calls:<id>` format (`400`).
- **Delivery feedback** (`src/lib/callRealtime.ts`, `src/contexts/call/useCallSignaling.ts`, `CallContext`) — `publish` already returned `{delivered}` but the client ignored it. `send()` now returns `{ok, delivered}`; `initiateCall` toasts "User May Be Offline" when the `call-request` reaches 0 subscribers (still rings until the no-answer timeout).
- **Multi-tab coordination** (`src/contexts/call/callTabCoordinator.ts`, `CallContext`) — a shared localStorage counter (`tone-call-active-count`) + storage events: one tab's busy state now auto-answers `call-busy` for incoming calls, `acceptCall` guards against a double-accept across tabs, and a tab that accepts or rejects a call cancels the ring in the other tabs (via `tone-call-resolved` marker).
- **ICE config no longer stuck on a stale cache** (`src/services/webrtc.ts`) — `loadIceServers` cached its first result forever, pinning STUN-only (or a 401-failed config) for the whole session. It now caches successful results with a 5-minute TTL, retries on 401 after a session refresh, and never caches a failure.
- **Connection-quality stats read the live peer connection** (`src/contexts/call/useConnectionQuality.ts`) — the hook now takes the `WebRTCService` and reads `getPeerConnection()` at each collection tick, so it can't hold a stale `RTCPeerConnection` after `resetCallState()` recreates the service.
- **Verification:** `npx tsc --noEmit` ✓ 0 errors (frontend); gateway `tsc` shows only the pre-existing `busboy`/`routes.ts` errors. `eslint` on the changed files: 0 errors, 1 pre-existing warning (`react-refresh` on `useCall` export). Both commits pushed to `ibadsixx/tone-your-social-voice` (`4c78c9c`) and `ibadsixx/gateway` (`67ce1bd`).
- **Documented production caveat** (`tone-api-gateway.md`) — the SSE hub is process-local and Vercel Hobby functions cap at 300s, so gateway signaling is intended for local dev / best-effort in production; signals in flight during a subscriber reconnect are lost (no replay). Shared pub/sub or a long-lived relay would be needed for production-grade signaling.

### Latest — Calls via Gateway SSE, Voice Audio Fix, Chat UX (Aug 14, 2026)

- **Call signaling moved to the gateway SSE bridge** (`src/lib/callRealtime.ts`, `src/contexts/call/useCallSignaling.ts`, commit `e1ab7e6`) — signaling no longer uses the local-only mock `GatewayChannel`. A new `CallRealtimeChannel` client (`openCallChannel`) opens `GET /api/realtime/subscribe/:channel` (Bearer-token auth, 401 → `gateway.auth.refreshSession()`, exponential-backoff reconnect, SSE frame parser), and publishes via `POST /api/realtime/publish` with `excludeConnId` set so the sender does not echo its own events. `useCallSignaling` subscribes to `calls:<myId>` and publishes `call-signal` events to `calls:<target>`, so two browsers sharing the gateway instance now exchange offers/answers/ICE candidates (WebRTC media is still peer-to-peer).
- **Call buttons actually start calls** (`src/components/im/MiniChatWindow.tsx`) — the Phone/Video buttons had no `onClick` and did nothing; both are now wired to `initiateCall(user.id, {...}, 'voice' | 'video')` via `useCall()` and are disabled while a call is active.
- **Silent call failures now toast** (`src/contexts/call/CallContext.tsx`) — `initiateCall`'s early return (missing current user/profile/WebRTC) previously only logged; it now surfaces a toast so dead buttons are visible to the user.
- **Voice calls can now be heard** (`src/components/calls/ActiveCallWindow.tsx`) — the remote stream was only attached to a `<video>` element rendered for video calls, so voice calls had no audio output. Added a hidden `<audio ref={remoteAudioRef} autoPlay playsInline>` plus an effect that attaches `remoteStream` when `callType === 'voice'`.
- **ICE/TURN config fetched from the gateway** (`src/services/webrtc.ts`) — `webrtcService` now calls `GET /api/realtime/ice-servers` (cached, STUN-only fallback) and lazily creates the `RTCPeerConnection` on first use so the fetched servers are applied; `cleanup()` no longer recreates the connection. Servers: Google STUN plus a TURN relay (gateway env `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL`, defaulting to the Metered OpenRelay public relay).
- **Send button can't wrap below the input** (`src/components/messages/MessageInput.tsx`) — the text field and send/quick-emoji button are grouped in one atomic `flex flex-1 items-end gap-2` container (field `flex-1 min-w-0`, button `shrink-0`); only the action-buttons group wraps independently on narrow widths.
- **Channel/group creation + messaging controls via gateway table queries** (`src/components/messages/CreateChannelDialog.tsx`, `CreateGroupChatDialog.tsx`, `ChatInfoPanel.tsx`, `src/hooks/useConversationSettings.ts`) — replaced the RPCs `create_channel_conversation`, `create_group_conversation`, and `update_messaging_controls` (not routed to any project in the gateway) with `conversations` + `conversation_participants` inserts and an `allow_message_sharing` update. Dialogs now accept `currentUserId` so the creator is inserted as owner/admin.
- **Minimized chat window repositioned** (`src/components/im/ChatWindowManager.tsx`) — `minimizedSide` moved from `left-4` to `right-20` so it no longer overlaps the left icon rail.
- **Verification:** `npx tsc --noEmit` ✓ 0 errors. Gateway side (commit `29f9559`): new `src/realtime/channelHub.ts` (in-memory SSE fan-out hub) and `src/api/realtime.ts` (subscribe/publish/ice-servers) mounted at `/api/realtime` in `src/api/routes.ts`; pre-existing `busboy` type errors in the gateway (`TS2307`/`TS7006` in `src/api/routes.ts`) are unchanged from the base commit.

### Last 24 Hours — Gateway Client, PeopleYouMayKnow, Error/Retry UX (Aug 2, 2026)

- **`not.` operator fix (`src/lib/gateway.ts`)** — `not()` on both `PostgrestFilterBuilder` and `GatewayQueryBuilder` now serializes as PostgREST-correct `not.{col}={op}.{value}` instead of the previous `{col}=not.{op}.{value}`, which parsed to the wrong column/operator and silently matched nothing. A new `parseFilter()` helper handles `not.` prefixes for both top-level and `or=(...)` filters.
- **`is` operator (`src/lib/gateway.ts`)** — `matchFilter` now resolves `null`, `true`, and `false` values instead of treating everything except `null` as a string comparison.
- **Bulk update fallback (`src/lib/gateway.ts`)** — the gateway only supports single-row `PUT /api/v1/:domain/:id`, so `.update()` calls without an `id=eq.` filter now fetch all rows, apply filters client-side (`applyFilters`), and issue one PUT per matched `id` (`_bulkUpdate`). Handles 401 by refreshing the session (or clearing the token and redirecting to `/auth`). Trade-off: N+1 PUTs with no transaction — a mid-loop failure leaves partial updates.
- **Count joins (`src/lib/gateway.ts`)** — join specs whose columns are `count` now attach `[{ count: N }]` to the parent row instead of an empty/array result.
- **PeopleYouMayKnow without RPC (`src/hooks/usePeopleYouMayKnow.ts`)** — the gateway's `/api/rpc/:function` proxy (`gateway/src/api/routes.ts:283`, mounted at `routes.ts:390`) requires a Bearer token and routes to the `users` project by default (only `seed_default_ad_topics` is overridden to `ad_topics`), so `get_people_you_may_know` could not be exercised on the live deployment — no working token is obtainable (sign-up 400, sign-in 401). The hook now reproduces the RPC client-side from 4 parallel table queries (`profiles`, `friends`, `followers`, `blocks`): builds an undirected accepted-friend graph, counts mutual friends, excludes already-related/followed/blocked users, and sorts by `mutual_friends_count DESC, created_at DESC` to match the RPC. `blocks`/`followers` fetch failures degrade to "no blocks"/"no follows" with a `console.warn`. Trade-off: fetches the entire `profiles` and `friends` tables per render.
- **Error/retry UX** — `useNotifications`, `useFollowedHashtagsFeed`, and `useExplorePosts` now expose `error` state (plus a `retry` counter / `refresh()` that re-runs the effect). `NotificationsDropdown`, `NotificationsPage`, `FollowedHashtags`, and `Search` render error states with Retry buttons instead of silent empty/spinner states.
- **Verification:** `npx tsc --noEmit` ✓ 0 errors.

### Latest — Feature-Flag Refresh & Chat RPC Migration (Aug 4, 2026)

- **Gateway feature-flag refresh (`gateway/src/dev.ts`, commit `e3ee66d`)** — the 60s `refreshRegistry()` interval now calls `featureFlags.enable(domain)` for every domain after reload. This resolves the cold-start caveat below: domains registered in the live infra DB now activate on the next periodic refresh instead of requiring a Vercel instance restart.
- **Chat RPCs replaced with gateway table queries (`src/api/conversations.ts`, `src/hooks/useConversations.ts`, `src/hooks/useMessagingSystem.ts`, commit `c57b6f2`)** — the monolith-era chat RPCs (`get_or_create_dm`, `get_conversations_with_info`, `mark_messages_read`, `get_message_read_status`, `get_my_read_message_ids`, `mark_message_delivered`) join tables spread across multiple physical projects and 42P01 on every live call (e.g. `relation "blocks" does not exist` when opening a DM). They were replaced with per-domain gateway table queries: `getOrCreateDM`, `markConversationMessagesRead`, `getConversationReadStatus`, `getMyReadMessageIds`, `markMessageDelivered` added to `src/api/conversations.ts` (+161 lines); `useConversations.ts` and `useMessagingSystem.ts` rewritten to consume them. Matches the "do not route these RPCs anywhere" note in `tone-api-gateway.md`.
- **Verification:** `npx tsc --noEmit` ✓ 0 errors (both projects).

### Unified API Layer (`src/api/`)

- **Problem:** All 160+ source files imported `gateway` directly from `@/lib/gateway` and built raw Supabase-style queries inline. No abstraction between business logic and data access.
  - **Solution:** Created `src/api/` with 14 domain-specific modules (plus shared `client.ts`, `types.ts`, `users-types.ts`, and `index.ts` — 18 files total). Each exports typed functions (`createPost`, `getFeedPosts`, `updatePost`, `deletePost`, etc.) that encapsulate the gateway query construction.
- **Files created:**
  - `src/api/client.ts` — exports `gateway` instance, `API_URL`, `ApiResult<T>` type
  - `src/api/types.ts` — shared TypeScript interfaces (`Post`, `Comment`, `Story`, `Notification`, `Conversation`, `Message`, `Group`, `Page`, `Hashtag`)
  - `src/api/posts.ts` — 20+ functions: `createPost`, `createPostReturnAll`, `getFeedPosts`, `getPostById`, `getUserPosts`, `getExplorePosts`, `getReels`, `getReelById`, `getScheduledPosts`, `updatePost`, `deletePost`, etc.
  - `src/api/comments.ts` — `createComment`, `getCommentsByPost`, `updateComment`, `deleteComment`
  - `src/api/stories.ts` — `createStory`, `getActiveStories`, `hasActiveStories`, `deleteStory`
  - `src/api/profiles.ts` — `getProfileById`, `getProfileByUsername`, `updateProfile`, `searchProfiles`
  - `src/api/notifications.ts` — `getNotifications`, `createNotification`, `markAsRead`, `markAllAsRead`, `getUnreadCount`
  - `src/api/conversations.ts` — `getConversationsByIds`, `createConversation`, `getMessages`, `sendMessage`, `deleteMessage`, `getConversationMedia`
  - `src/api/groups.ts` — `getGroupById`, `createGroup`, `updateGroup`, `deleteGroup`, `getGroupsWithMembers`, `getGroupsByUser`, `getGroupMembers`, `joinGroup`, `leaveGroup`, `addGroupMembers`, `getGroupPosts`, `createGroupPost`, `getUserGroupPosts`, `getGroupMediaPosts`, `getGroupFollowStatus`, `unfollowGroup`, `followGroup`, `getUserPinnedGroups`, `getGroupPinStatus`, `pinGroup`, `unpinGroup`
  - `src/api/pages.ts` — `getPageById`, `createPage`, `updatePage`, `searchPages`
  - `src/api/blocking.ts` — `blockUser`, `unblockUser`, `getBlockedUsers`, `isBlocked`, `restrictUser`, `unrestrictUser`
  - `src/api/hashtags.ts` — `getHashtagByTag`, `createHashtag`, `searchHashtags`, `getTrendingHashtags`, `followHashtag`
  - `src/api/music.ts` — `searchMusic`, `getMusicById`
  - `src/api/advertisers.ts` — `createAdvertiser`, `getAdvertiserById`
  - `src/api/ads.ts` — ads, ad topics, saved ads, and ad interaction functions
  - `src/api/users.ts` — 40+ user/social-graph functions (friends, follows, followers, pokes, mentions, privacy, notification prefs, etc.)
  - `src/api/users-types.ts` — shared user-domain TypeScript interfaces
  - `src/api/index.ts` — barrel export of all domain APIs
- **Migrated files (Posts domain):**
  - `src/hooks/useHomeFeed.ts` — `postsApi.getFeedPosts()`, `postsApi.createPost()`
  - `src/hooks/usePost.ts` — `postsApi.getPostById()`
  - `src/hooks/usePosts.tsx` — `postsApi.getUserPosts()`
  - `src/components/Post.tsx` — `postsApi.deletePost()`
  - `src/components/EditPostDialog.tsx` — `postsApi.updatePost()`
- **Migrated files (Groups domain):**
  - `src/hooks/useGroups.ts` — `groupsApi.getGroupsWithMembers()`, `groupsApi.getUserPinnedGroups()`, `groupsApi.joinGroup()`, `groupsApi.leaveGroup()`, `groupsApi.createGroup()`
  - `src/pages/GroupDetail.tsx` — `groupsApi.getGroupById()`, `groupsApi.getGroupMembers()`, `groupsApi.updateGroup()`, `groupsApi.getGroupPosts()`, `groupsApi.createGroupPost()`, `groupsApi.joinGroup()`, `groupsApi.leaveGroup()`, `groupsApi.followGroup()`, `groupsApi.unfollowGroup()`, `groupsApi.pinGroup()`, `groupsApi.unpinGroup()`, `groupsApi.getGroupFollowStatus()`, `groupsApi.getGroupPinStatus()`
  - `src/pages/Groups.tsx` — consumes `useGroups()` hook (indirect API usage)
  - `src/components/groups/GroupMediaFiles.tsx` — `groupsApi.getGroupMediaPosts()`
  - `src/components/groups/GroupYourContent.tsx` — `groupsApi.getUserGroupPosts()`
  - `src/components/groups/InviteToGroupDialog.tsx` — `groupsApi.addGroupMembers()`, `profilesApi.getProfileById()`, `usersApi.getFriendsByUser()`
  - `src/components/groups/ShareGroupDialog.tsx` — `profilesApi.getProfileById()`, `usersApi.getFriendsByUser()`, `postsApi.createPost()`
  - `src/components/groups/GroupSearchDialog.tsx` — `profilesApi.getProfileById()`
- **Architecture:** `Tone → API Layer (src/api/) → Gateway Client (src/lib/gateway.ts) → API Gateway → Backend Projects`
- **TypeScript build:** ✓ 0 errors | **Vite build:** ✓ Success (29s)

### Client-Side Gateway Query Filtering (`src/lib/gateway.ts`)

- **Problem:** The gateway at `https://gateway-iota-two.vercel.app` does not process query params (`filter`, `order`, `limit`, `offset`). All GET requests returned unfiltered records, breaking `.eq()`, `.order()`, `.limit()`, `.range()`, `.in()`, `.or()`, `.like()`, `.ilike()`, `.not()`, `.is()` queries.
- **Solution:** Client-side filtering in `src/lib/gateway.ts`. GET requests fetch all records from `/api/{table}` with no query params; filtering, sorting, pagination, and column selection are applied in the browser after the response.
- **Filter parsing** — `applyFilter()` handles `or=(...)` with parenthesis-aware comma splitting, `not.op.value` negation, and all standard PostgREST operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `like`, `ilike`, `is`)
- **Ordering** — `applyOrder()` sorts by any column with `asc`/`desc` direction; defaults to `created_at desc` when no order is specified
- **Pagination** — `.limit()`, `.offset()`, `.range()` applied after filtering and sorting
- **Column selection** — `.select('col1,col2')` picks specified columns; `select('*')` returns all
- **Single/maybeSingle** — `.single()` and `.maybeSingle()` return first result from filtered+sorted+paginated data
- **Count** — `.select('*', { count: 'exact' })` returns filtered count as `data`
- **Bug fixed** — `ReferenceError: row is not defined` at line 80. The `row` variable was referenced outside its scope in `applyFilters`. Fixed with arrow function + simplified negation logic.
- **Trade-off:** Fetches all records per request. Acceptable for the current data volume; should be replaced with server-side filtering when the gateway adds query param support.
- **TypeScript build:** ✓ 0 errors | **Vite build:** ✓ Success (19s)

### Join Resolution Fix — Author Names Showing "Unknown" (`src/lib/gateway.ts`)

- **Problem:** Post author names rendered as "Unknown" in the feed. `Post.tsx` falls back to `profiles?.display_name || 'Unknown'` when the embedded profile never attaches, so the embedded `profiles!posts_user_id_fkey (...)` join was silently failing.
- **Root cause 1 — wrong cardinality:** the join parser classified to-one embedded rows as arrays. `profiles!posts_user_id_fkey` (a `!fk` hint) and `shared_post:shared_post_id` / `profiles:user_id` (a `:` alias on an `_id`/FK column) were all built as arrays, so `post.profiles` was an array and `profiles?.display_name` was `undefined`.
- **Root cause 2 — key column stripped:** the column picker kept only the requested columns (`username, display_name, profile_pic`) and dropped `id` — the column used to match parent → related rows. As a result **zero** rows ever matched, so the join produced nothing even after the cardinality fix.
- **Fixes:**
  - `JoinSpec` gained `kind: 'one' | 'many'` (`src/lib/gateway.ts:189`).
  - `!fk` hint → `kind: 'one'` (line 210); `:` alias → `kind: isToOne ? 'one' : 'many'` where `isToOne = localCol.endsWith('_id') || FK_TARGETS[localCol] !== undefined` (lines 220-221); bare table → `kind: 'many'` (line 227).
  - `effectiveIsArray = spec.kind === 'many'` (line 508).
  - The column picker always retains `spec.relatedCol` so the matching key survives selection (line 516).
- **Diagnostics** — `_resolveJoins` now logs `console.warn` instead of failing silently:
  - Non-OK response: `[gateway] Join fetch failed for /api/{table} ({status})` (lines 492-494)
  - Empty related rows: `[gateway] Join /api/{table} returned no rows for N key(s)` (lines 503-506)
  - Partial matches: `[gateway] Join /api/{table} matched X/Y key(s) — N row(s) have no '{resultKey}'` (lines 544-546)
  - Thrown errors: `[gateway] Join fetch threw for /api/{table}` (lines 547-550)
- **Verification:** `npx tsc --noEmit` ✓ 0 errors | `npm run build` ✓ (38.9s). A simulation running the full `POST_SELECT_FULL` select (`src/api/posts.ts:5-12`) against fixture data confirmed: `post.profiles` resolves to an object (not array) with `username`/`display_name`/`profile_pic`, `likes`/`comments` arrays attach, nested joins (`comments[0].profiles`) resolve, and orphaned authors (no matching profile row) correctly stay "Unknown" while emitting a diagnostic.
- **RESOLVED (Aug 4, 2026):** the gateway auth block is fixed live. Root cause: GoTrue on the users project returned `500 "Database error creating new user"` from a legacy `on_auth_user_created` trigger (`handle_new_user`) inserting into the missing `public.profiles`. The dead trigger was dropped (see `sql/fix_auth_users_project.sql`); sign-up 201 / sign-in 200 verified via the live gateway. Blocking RPCs were missing and routed to the wrong project — the 17 SECURITY DEFINER functions were created in the `blocking` project (`sql/blocking_rpc_functions.sql`) and all blocking RPCs routed there via `RPC_DOMAIN_OVERRIDES` in `gateway/src/api/routes.ts` (deployed to Vercel as `ibadsixx`, `f454ac2`). All blocking RPCs verified end-to-end through the live gateway.

### Gateway Domain Registration — "Failed to Load X: Not Found" Toasts (July 2026)

- **Problem:** Screens fired "Failed to load friends" / "Failed to load other names" error toasts (`src/hooks/useFriends.ts:86`, `src/hooks/useOtherNames.ts:36`).
- **Root cause:** the gateway is **table-as-domain** — `GET /api/:domain` returns `404 {"error":"Not found"}` when `featureFlags.isEnabled(domain)` is false (`gateway/src/api/routes.ts:306-311`), and flags are only enabled for domains present in the live infra DB `infrastructure_projects` table at cold start (`gateway/api/[...slug].ts:45-49` → `projectManager.load()`). ~80 of the ~108 tables the frontend queries via `gateway.from('<table>')` had never been registered as domains.
- **Fix (config-only, no gateway source changes):** registered the missing domains in the live infra DB, each cloned from the credentials of the project that hosts the table (probed per table; `infrastructure_projects` + `domains` kept in sync; inserts idempotent via the infra DB service client, no keys written to files). Result: **98/105** frontend-queried tables routable (3 of the original 108 entries were later re-audited as storage buckets, not tables).
  - users host (48 domains): `users`, `friends`, `follows`, `followers`, `friendships`, `mentions`, `other_names`, `user_activity`, `post_notifications`, `reactions`, `privacy_settings`, `search_history`, `notification_preferences`, etc.
  - `stories` project (10): `stories` + 9 `story_*` tables
  - `conversations` project (9): `conversations`, `messages`, `message_requests`, `message_reactions`, `message_reports`, `pinned_messages`, `conversation_clears/participants/reports`
  - `posts` project (7): `posts`, `likes`, `post_shares`, `post_tags`, `reported_posts`, `saved_posts`, `shares`
  - `groups` (5), `advertisers` (5), `profiles` (4), `comments` (4), `pages` (3), `music` (2), plus single-table hosts `hashtags`, `blocking`, `notifications`.
- **Still open (re-audited Aug 2, 2026):** 7 frontend-queried tables lack a domain — `media_library`, `restricted_users`, `trusted_devices` (all created by app migrations in the users project but missed by the probe), `blocks` (only `blocking` is registered — table/domain name mismatch), `blocked_nicknames`, `hashtag_follows`, `message_audios`. `avatars`, `covers`, and `group_covers` are storage buckets (`gateway.storage.from('...')`), not tables. **Cold-start caveat fixed (Aug 4, 2026, gateway `e3ee66d`):** the 60s `refreshRegistry()` interval now re-enables feature flags for every refreshed domain (`src/dev.ts`), so domains registered in the live infra DB activate on the next refresh cycle instead of requiring a Vercel instance restart.

### Mobile-First Responsive Layout

- **`PageContainer` component** (`src/components/PageContainer.tsx`) — responsive page wrapper with `size` prop (`sm`/`md`/`lg`/`xl`/`2xl`/`full`) and `px-4 md:px-6 py-4 md:py-8` padding, used across all 21 pages
- **`MobileNav` component** (`src/components/MobileNav.tsx`) — fixed bottom nav (Home, Search, Messages, Profile tabs + center Create button with Post/Story/Reel action sheet), `hidden md:`, `safe-area-bottom` utility class
- **`Layout.tsx` updated** — sidebar `hidden md:block`, main content `pb-20 md:pb-0`, header `px-4 md:px-6`, integrated `MobileNav`
- **21 pages converted** to `PageContainer` with appropriate sizes; `Home.tsx` early returns updated
- **NewPost card hidden on mobile** (`src/pages/Home.tsx`) — `hidden md:block` on the NewPost card so the text field is not shown on mobile; replaced by the Create button in the header
- **Create button in Layout header** (`src/components/Layout.tsx`) — `Plus` button before `NotificationsDropdown` opens a popover with Post/Story/Reel create options, consistent with MobileNav's create sheet

### Messages Page — Mobile-First Toggle (`src/pages/Messages.tsx`, `src/components/messages/ChatWindow.tsx`)

- **Sidebar** — class changed from `w-80 lg:w-96` to `w-full md:w-80 lg:w-96`, conditionally hides on mobile (`hidden md:flex`) when `activeConversationId` is set
- **Chat area** — conditionally hides on mobile (`hidden md:flex`) when no `activeConversationId`
- **Back button** — `ArrowLeft` button added to `ChatWindow` header, visible only on mobile (`md:hidden`), calls `onBack` prop that navigates to `/messages` and clears `activeConversationId`
- **Result**: mobile shows single-column (list OR chat, Instagram/Messenger-style), desktop keeps two-panel layout

### Story Editor — Media Rotation & Mute (`src/components/CreateStoryDialog.tsx`, `src/components/StoryViewer.tsx`)

- **90° snap rotation for background media** — added `mediaRotation` state (0/90/180/270). A Konva `Group` wrapper around the background image/video applies `mediaRotation` with `offsetX/Y` for center pivot. When rotated 90° or 270°, the wrapper auto-scales by `STAGE_W / STAGE_H` (360/640 ≈ 0.5625) so the rotated media fits within the 9:16 canvas. Rotation data is persisted in the story's caption JSON and restored during playback.
- **Rotation removed from UI** — floating rotate buttons and sidebar Rotation section were removed per request; `handleRotate`/`handleRotateOverlay` and `mediaRotation` state remain for future re-integration.
- **Font Size slider removed** — the Size slider (12–120px) was removed from the Text tab editing panel.
- **Video Mute/Unmute** — added `videoMuted` state (default `false` — audio plays by default). `KonvaVideoImage` accepts a dynamic `muted` prop; the `<video>` always starts with `muted=true` internally for reliable autoplay, then a separate effect immediately applies the `mutedProp` value without restarting playback. The mute toggle is in the **Music tab** as a compact icon button (`Volume2`/`VolumeX` icons, 28×28px ghost button) with a short text label. The `videoMuted` flag is stored in caption JSON.
- **StoryViewer respects mute** — `StoryViewer.tsx` parses `videoMuted` from the caption JSON and applies it to the `<video>` element's `muted` prop (defaults to `true` for backward compatibility).
- **BlurredVideoBg refactored to static frame** — replaced the live second video element (which competed for decoder resources with the main `KonvaVideoImage`) with a single-frame capture approach: loads metadata, seeks to `min(duration/2, 1)`, draws to a canvas, and renders the resulting static `HTMLImageElement` with a cached Konva Blur filter. Eliminates video freeze caused by two video elements playing the same blob URL simultaneously.
- **BlurredVideoBg seek bug fix** — removed redundant `vid.src = src; vid.load()` call inside the `loadedmetadata` handler that was resetting the video and breaking the seek-to-frame capture.
- **Explicit `vid.play()`** — added `vid.play().catch(() => {})` to `KonvaVideoImage` to handle cases where browsers ignore `autoplay` on programmatically-created video elements.

### FriendRequestsDropdown (`src/components/FriendRequestsDropdown.tsx`)

- **Max 10 requests** — received friend request list capped at 10 items with "Show all N requests" link
- **People you may know** — suggested users section below requests, powered by the `usePeopleYouMayKnow` hook, which reproduces the `get_people_you_may_know` RPC client-side from table queries (the gateway's `/api/rpc` proxy is auth-gated and users-project-default)
- **Received/Sent tabs** — tab switcher in dropdown header toggles between incoming and outgoing pending requests
- **Sent requests** — fetches from `friends` table where `requester_id` = current user and `status = 'pending'`, displaying receiver avatar, name, and username
- **Red badge** — unread count badge uses `bg-red-500` (Facebook-style)
- All data fetched through the API gateway (`gateway.from(...)`) — gateway-only, no direct Supabase access

### NotificationsDropdown (`src/components/NotificationsDropdown.tsx`)

- **All notification types** — supports: posts from followed people/pages, group posts, pokes, followed hashtag posts, tags, friend requests, message requests, page/group invitations, group membership acceptances, and security login alerts
- **Lucide icons** — all notification types use Lucide React icon components (no emojis)
- **Smart navigation** — clicking navigates to the relevant page (post, profile, groups, pages, messages, hashtag, security settings)
- **Notification type** — extended `useNotifications` hook with 15+ notification types and additional fields (`group_id`, `page_id`, `hashtag`)
- **Red badge** — unread count badge uses `bg-red-500` (Facebook-style)

### Chat Window & Contacts (`src/components/im/ChatWindowManager.tsx`)

- **Chat bubble with `...`** — replaced the "+" FAB with a `MessageCircle` icon + "..." text
- **Floating contacts list** — clicking the bubble opens a 260px-tick contacts panel (friends + conversation partners) with search, replaces the old new-message search popup
- **Contacts fetched from DB** — friends and conversation participants loaded via the gateway on open
- **FloatingIM removed** — `src/components/im/FloatingIM.tsx` deleted; contacts sidebar and all references removed from Layout

### Layout & Navigation (`src/components/Layout.tsx`)

- **Settings removed from sidebar** — "Settings" link removed from the left icon nav
- **Logo replaced with favicon** — custom Tone gradient logo replaced with `<img src="/favicon.ico">`

### Stories (`src/components/Stories.tsx`)

- **Full-frame profile pictures** — Create Story and Story cards show profile pic as full card background instead of circular avatar
- **Initial fallback** — when no profile picture, displays the user's display name initial letter on a gradient background
- **Uses `useProfile` hook** — fetches `display_name` alongside `profile_pic` for correct initial letter

### Homepage (`src/pages/Home.tsx`)

- **TrendingHashtags removed** — right column component deleted from the homepage

### Messages Page (`src/pages/Messages.tsx`)

- **PenSquare button** — "New conversation" button moved from left to right side of the "Chats" heading
- **More dropdown** — `MoreHorizontal` button opens a dropdown with: Account Preferences, Pending Messages, Archive, Restricted Users, Privacy & Security, Support Center
- **Account Preferences dialog** — modal with Account and Notifications sections
  - **Account** — clickable avatar + name navigates to `/profile/:username`; Status option opens a status dialog
  - **Notifications** — toggles for Notification sounds, Do Not Disturb (with duration picker), and Dark Mode
- **Pending Messages view** — clicking "Pending Messages" in the dropdown switches `viewMode` to `'pending'`, showing a back arrow + "Pending" heading and a tabbed list of message requests divided into "Maybe you know" and "Spam" tabs using shadcn/ui Tabs
- **Archive view** — More dropdown → Archive shows archived conversations with back button, unarchive button on each item, and an "Add people" button in the header that opens `AddPeopleDialog`
- **Restricted Users view** — More dropdown → Restricted Users shows:
  - Info banner explaining restriction behavior (remains friend, only public/tagged posts, no private stories, comments hidden)
  - Search input to find and restrict users with inline results
  - List of currently restricted users with avatar, name, and Remove button
  - "Add people" button in the header that opens `AddPeopleDialog` (restricts instead of archives)
  - Toast notifications on restrict/remove
- **AddPeopleDialog** (`src/components/messages/AddPeopleDialog.tsx`) — reusable dialog with search input + friends list; when used from Archive view creates DM + archives it, when used from Restricted view restricts the selected user

### Status & Visibility (`src/hooks/useStatusVisibility.ts`, `src/lib/notificationSounds.ts`)

- **Online/offline status** — `manual_status` column on `profiles` table; toggled via Status dialog
- **ON for some / Off for some** — `status_visibility` table stores per-user visibility overrides; people selector dialog with search to pick users
- **Notification sounds** — plays a sound on new message via `useConversations.ts` Realtime handler, respects notification preference
- **Do Not Disturb** — stores `do_not_disturb_until` timestamp; duration options dialog (1h, 2h, 4h, until tomorrow, until turned off)
- **Dark Mode** — toggles global theme via `next-themes`, persists to `profiles.dark_mode`

### Database Migrations

- Added migration `20260609000000_add_status_visibility.sql`:
  - `manual_status` (text), `notification_sounds` (boolean), `do_not_disturb_until` (timestamptz), `dark_mode` (boolean) on `profiles`
  - `status_visibility` table with RLS for visibility overrides
  - `get_visible_to_user` RPC function

- Added migration `20260610000000_add_pending_friend_check_to_request_category.sql`:
  - Updated `determine_request_category` to check `restricted_users` table — restricted senders always → `spam`
  - Checks `get_mutual_friends_count` → `you_may_know`
  - Checks `friends` table for pending friend request from sender → `you_may_know`
  - Fallback → `spam`

### Conversation Archiving (`supabase/migrations/20260610000002_add_conversation_archiving.sql`)

- Added `archived_at` column to `conversation_participants` (per-user, nullable timestamptz)
- `archive_conversation` / `unarchive_conversation` RPCs — set/clear `archived_at` for `auth.uid()`
- `get_archived_conversations` RPC — returns archived conversations ordered by `archived_at DESC`
- `get_conversations_with_info` updated — excludes archived conversations via `archived_at IS NULL` filter
- Frontend: Archive view mode in Messages sidebar with back button, archive button on each conversation item

### Auto-Unarchive on New Message (`supabase/migrations/20260610000003_auto_unarchive_on_new_message.sql`)

- Trigger `trigger_auto_unarchive_on_message` on `INSERT INTO messages`
- Calls `auto_unarchive_on_message()` function — clears `archived_at` for all other participants when a new message arrives (Facebook Messenger behavior)

### Restricted Users Enforcement (`supabase/migrations/20260610000004_enforce_restricted_users.sql`)

- `is_restricted(restricter_id, target_user_id)` function checks `restricted_users` table
- `can_view_post` updated — if post author has restricted the viewer, only public posts or tagged posts are visible (friends/custom/only_me audiences blocked)
- Stories RLS policies updated — restricted users only see public stories; friends/close_friends/private stories hidden
- Friendship is preserved (no unfriending), no notification sent to restricted user

### Messages More Dropdown — Privacy & Security (`src/pages/Messages.tsx`)

- **Multi-level sub-menus** — the "More" dropdown now supports nested navigation via `privacyView` state (`null` → main, `'main'` → privacy, `'encryption_chats'` → encryption)
- **Privacy & Security menu** — clicking opens a sub-menu with a back arrow title + items: Encryption chats, Show reading indicator (Switch), Reported conversations, Checking the keys in conversations (Switch)
- **Encryption chats sub-menu** — further nested menu with Message Vault, Preview Mode (with on/off Switch toggle), Security Warnings (opens Security Warnings dialog)
- **Message Vault dialog** — modal with info banner ("Your encrypted messages are securely stored in your backup. Learn more"), Last backup / Date created timestamps, clickable PIN label, Manage security methods button, Remember this browser toggle, Automatic uploads toggle, Download message storage data button; back arrow button in header closes the dialog
- **Create PIN dialog** — opened by clicking PIN in Vault or Security Methods; password input (max 6 chars) with Cancel/Save; back arrow button in header closes the dialog; persisted to `profiles.vault_pin`
- **Security Methods dialog** — two options: PIN (opens Create PIN dialog) and 40-character code (opens Recovery Code dialog); back arrow button in header closes the dialog
- **Recovery Code dialog** — displays existing code or generates a random 40-character alphanumeric code; persisted to `profiles.vault_recovery_code`
- **Show reading indicator** — Switch toggle in the privacy sub-menu, persisted to `profiles.show_read_indicator`
- **Checking the keys in conversations** — Switch toggle in the privacy sub-menu, persisted to `profiles.check_keys_in_conversations`
- **Remember this browser** — Switch toggle in Message Vault; on enable, generates a device ID (stored in localStorage) and upserts into `trusted_devices` table; on disable, removes the device record; also persists preference to `profiles.remember_browser`
- **Automatic uploads** — Switch toggle in Message Vault, persisted to `profiles.disable_auto_uploads`; when enabled (toggle off), the `useAutoUpload` hook automatically uploads selected files to the `media_backups` storage bucket and records them in the `media_library` table; wired into `NewPost` and `MessageInput` so file selection triggers immediate cloud backup and a toast notification
- **Dropdown reset** — `onOpenChange` resets `privacyView` to `null` when the More dropdown closes; all sub-menu navigation uses `e.preventDefault()` to prevent premature close

### Database Migrations (`supabase/migrations/20260610000005_add_privacy_security_settings.sql`)

- Added `show_read_indicator BOOLEAN DEFAULT TRUE`
- Added `check_keys_in_conversations BOOLEAN DEFAULT FALSE`
- Added `remember_browser BOOLEAN DEFAULT FALSE`
- Added `disable_auto_uploads BOOLEAN DEFAULT FALSE`
- Added `preview_mode BOOLEAN DEFAULT TRUE`
- Added `vault_pin TEXT`
- Added `vault_recovery_code TEXT`
- Added `trusted_devices` table (`id`, `user_id`, `device_id`, `user_agent`, `created_at`, `last_used_at`) with RLS policy for per-user management
- Added `media_library` table (`id`, `user_id`, `file_url`, `file_type`, `file_size`, `file_name`, `created_at`) with RLS policy for per-user media backup records
- Added `media_backups` public storage bucket

### Hook Extension (`src/hooks/useStatusVisibility.ts`)

- Extended to expose: `showReadIndicator`, `checkKeysInConversations`, `rememberBrowser`, `disableAutoUploads`, `previewMode`, `vaultPin`, `vaultRecoveryCode` + their setters
- All setters follow the existing pattern: optimistic local state update + `UPDATE profiles SET ... WHERE id = auth.uid()`
- Generated TypeScript types updated in `src/integrations/supabase/types.ts` to include all new columns

### Auto-Upload Hook (`src/hooks/useAutoUpload.ts`)

- `useAutoUpload()` returns an `upload(files)` function that uploads each file to the `media_backups` storage bucket via the gateway under `{userId}/{timestamp}-{random}.{ext}`
- Records each uploaded file in `media_library` table with `file_url`, `file_type`, `file_size`, `file_name`
- Shows a toast summary on completion
- Wired into `NewPost.tsx` and `MessageInput.tsx` — when `disableAutoUploads` is `false`, calling `handleFileSelect` triggers immediate auto-upload alongside local preview

### Preview Mode Implementation

- **Preview Mode toggle** — Switch in the Encryption chats sub-menu, persisted to `profiles.preview_mode` (boolean, default false)
- **When enabled**, shared links in messages render as rich inline preview cards:
  - **Post previews** (`src/components/messages/previews/PostLinkPreview.tsx`) — detects `/post/:id` URLs, fetches post data via the gateway, renders a card with author avatar, display name, content snippet, and timestamp; clicking navigates to the post
  - **Profile previews** (`src/components/messages/previews/ProfileLinkPreview.tsx`) — detects `/profile/:username` URLs, fetches profile data, renders avatar + display name + username + bio; clicking navigates to the profile
  - **Group previews** (`src/components/messages/previews/GroupLinkPreview.tsx`) — detects `/groups/:groupId` URLs, fetches group data, renders avatar + name + member count + description; clicking navigates to the group
  - **Page previews** (`src/components/messages/previews/PageLinkPreview.tsx`) — detects `/pages/:id` URLs, fetches page data, renders avatar + name + follower count + category; clicking navigates to the page
- **URL detection** — `MessageLinkPreview.tsx` parses message content for matching URL patterns using `new URL()` and pathname regex, deduplicates with a `Set`, and dispatches to the appropriate preview component
- **Performance optimization** — when preview mode is on, adds `preview-mode` and `reduce-motion` CSS classes to `<html>`, which disables framer-motion animations and enables CSS targeting for lower-quality images and reduced effects (low-spec devices)
- **Privacy** — when preview mode is off, no previews are fetched or rendered; shared URLs appear as plain text only
- **Wired through** — `previewMode` prop flows from `Messages.tsx` → `ChatWindow` → `MessageBubble`, which conditionally renders `<MessageLinkPreview>` below message text content

### Security Warnings Dialog (`src/pages/Messages.tsx`)

- **Security Warnings** — clicking the item in the Encryption chats sub-menu opens a new Security Warnings dialog
- **Dialog content** — info text explaining device review and key comparison ("See more" link), plus three action buttons:
  - **See logins** — opens login history view
  - **Manage security warnings** — opens security warnings management
  - **View security warnings** — opens security warnings list
- **Dialog header** — back arrow button to close, Shield icon, and "Security Warnings" title
- **Replaced Switch toggle** — previously a simple on/off Switch in the dropdown, now a clickable item that opens the full dialog

### Login Management Dialog (`src/pages/Messages.tsx`)

- **See logins** — clicking the button in Security Warnings dialog opens a Login Management dialog
- **Dialog content** — info text about encrypted messages and calls, plus a scrollable list of trusted devices
- **Device list** — each device card shows:
  - System type and version + browser (parsed from `user_agent` via `parseUserAgent` utility)
  - Login location (fetched via `fetchLocation` utility with fallback chain)
  - Last used timestamp (relative format via `formatLastSeen` utility)
- **Data source** — `trusted_devices` table; current device upserted on dialog open, then full list fetched ordered by `last_used_at DESC`
- **DB migration** — `location` column stores geolocated city/region/country from IP; if column missing, fresh location is merged into the current device entry in memory

### Device Info Utility (`src/utils/deviceInfo.ts`)

- `parseUserAgent(ua)` — extracts OS name/version and browser name from a user agent string
- `formatLastSeen(dateStr)` — formats a timestamp as relative time ("Just now", "5m ago", "3d ago", etc.)
- `fetchLocation()` — resolves user location via three-tier fallback:
  1. `ipinfo.io/json` — free IP geolocation (3s timeout)
  2. `ip-api.com/json` — fallback IP geolocation (3s timeout)
  3. `Intl.DateTimeFormat().timeZone` — offline timezone fallback (guaranteed to return a value)

### Database Migrations

- `20260613000001_add_security_warnings.sql` — added `security_warnings BOOLEAN DEFAULT TRUE` to `profiles`; hook extended with `securityWarnings` state + setter
- `20260613000002_add_device_tracking.sql` — added `ip_address TEXT` and `location TEXT` columns to `trusted_devices`

### Story Ring on Profile Avatar (`src/components/ProfileHeader.tsx`, `src/hooks/useHasActiveStories.ts`)

- **`useHasActiveStories(userId)`** — new hook that queries `stories` table with `.gt('expires_at', now())` for a given user; returns boolean with real-time subscription for live updates
- **Profile avatar ring** — when the profile user has active stories, the avatar is wrapped in a 3px gradient ring (`from-yellow-400 via-pink-500 to-purple-600`), Instagram-style
- **No ring** — when no active stories, the avatar renders normally without the wrapper

### Story Ring on NewPost Writing Box (`src/components/NewPost.tsx`)

- **Own avatar ring** — the user's avatar in the NewPost writing box on the homepage also shows the gradient ring when the user has active stories
- Uses the same `useHasActiveStories(user?.id)` hook and same ring styling

### Immediate Upload on File Selection (`src/components/NewPost.tsx`, `src/hooks/useHomeFeed.ts`)

- **Uploads on selection** — when a file (image or video) is selected via the Photo/Video button, it is uploaded immediately to the post bucket (`avatars` for images, `stories` for videos)
- **Pre-uploaded media** — the resulting URL is stored in `uploadedMedia` state and passed to `createPost`, which skips re-uploading
- **Graceful fallback** — if the background upload fails, `createPost` still re-uploads from the raw `File` objects
- **Backup auto-upload preserved** — the old `media_backups` backup flow still runs alongside

### Video Upload Fix (`src/components/NewPost.tsx`)

- **Auto-detect file type** — `handleFileSelect` no longer hardcodes `type='image'`; each file's MIME type is detected individually
- Videos are routed to the `stories` bucket, images to `avatars`

### File Previews (`src/components/NewPost.tsx`)

- **Image thumbnails** — selected images show an actual thumbnail preview using the uploaded URL
- **Video previews** — selected videos show a video frame with a `PlayCircle` overlay icon
- **Loading spinner** — a spinning indicator overlays each file while its upload is in progress
- **Error state** — "Upload failed" label shown below thumbnails if the background upload errors
- Uses `URL.createObjectURL` for instant local preview while the server upload completes in the background

### Non-Blocking Uploads (`src/components/NewPost.tsx`)

- **Background uploads** — file uploads to storage run as detached `.then()` promises, keeping the UI responsive even for large videos
- **State-per-file tracking** — each file has a `status: 'uploading' | 'done' | 'error'` field with corresponding visual feedback
- `URL.revokeObjectURL` cleanup on file removal

### Video Aspect Ratio → Reel Classification (`src/hooks/useHomeFeed.ts`)

- **`getVideoDimensions(url)`** — loads a video URL and returns `{ width, height }` via `HTMLVideoElement` metadata
- **`classifyVideoAspectRatio(width, height)`** — returns `{ type, aspectRatio }`:
  - Within 10% tolerance of **16:9** (landscape) → `type: 'reel'`, `aspectRatio: '16:9'`
  - Within 10% tolerance of **9:16** (portrait) → `type: 'reel'`, `aspectRatio: '9:16'`
  - Otherwise → `type: 'normal_post'`, `aspectRatio: '{width}:{height}'`
- **`createPost`** — after acquiring `mediaUrl`, runs detection for videos and sets `type`/`aspect_ratio` on the post row accordingly
- No time/duration limit is enforced for regular video uploads

### Liked Posts Page (`src/pages/LikedPosts.tsx`, `src/App.tsx`) — NOT PRESENT IN CURRENT TREE

> **Stale (re-verified Aug 21, 2026):** `src/pages/LikedPosts.tsx`, `src/components/PostCard.tsx`, the `/liked` route, and `fetchPostsByIds` do not exist in the working tree or git history — this section describes work that was reverted or never committed. The live like toggle lives in `src/hooks/useHomeFeed.ts` against the `likes` table (a registered gateway domain), not `post_likes`. Kept for history only.

- **`/liked` route** — new route mounted in `App.tsx`, renders `LikedPosts` page
- **Liked posts feed** — queries `post_likes` table for the current user's liked post IDs (ordered by most recent like), then loads full post data via `fetchPostsByIds`
- **Empty state** — when no liked posts, shows a "No liked posts yet" message with a `Heart` icon and a "Browse posts" link back to the homepage
- **Navigation** — "Liked posts" entry in the header avatar menu navigates to `/liked`

### Post Card Modularization (`src/components/PostCard.tsx`, `src/hooks/useHomeFeed.ts`) — NOT PRESENT IN CURRENT TREE (see note above)

- **`PostCard` component** — extracted the per-post rendering from `HomeFeed` into a reusable `PostCard` component
- **Props** — accepts full `post` object + `currentUserId`; renders avatar, author info, timestamp, content text, media, action bar (like/comment/share counts + buttons), and comment section
- **`fetchPostsByIds(postIds)`** — new exported helper in `useHomeFeed.ts` that fetches multiple posts by ID with their author profiles, media, likes, and comments in a single batch
- **`PostCard` used in `HomeFeed`** — `HomeFeed` now fetches posts normally and delegates each to `<PostCard>`
- **`PostCard` used in `ProfilePage`** — the profile page's "Posts" tab uses `fetchPostsByIds` and renders via `PostCard`, consistent with the main feed
- **`PostCard` used in `LikedPosts`** — the liked posts page reuses the same component

### Liked Status & Toggle (`src/components/PostCard.tsx`, `src/hooks/useHomeFeed.ts`) — NOT PRESENT IN CURRENT TREE (see note above)

- **`isLiked` state** — each `PostCard` independently tracks whether the post is liked by the current user, initialized by checking `post.user_has_liked` or `post.likes` for the current user's ID
- **`toggleLike` with loading** — clicking the heart button optimistically toggles the UI and calls the gateway (insert into `post_likes` or delete from `post_likes`); if the network call fails, the UI reverts
- **Like count** — displayed alongside the heart icon, decremented/incremented optimistically on toggle
- **Existing likes on mount** — `user_has_liked` field is populated by the feed query; if not available, the component falls back to checking the `likes` array

### Story Cards First-Letter Fallback (`src/components/Stories.tsx`)

- **Conditional render** — each story card now checks `userStories.profile_pic`:
  - **Has image** — shows the profile picture as a full-frame background image (unchanged)
  - **No image** — renders a gradient background with the user's display name initial letter (`userStories.display_name?.[0]?.toUpperCase()`) instead of the broken `/default-avatar.png` fallback
- **Gradient overlay** — still present on top of both states for readability
- **Per-account letters** — each user sees their own first letter, not a fixed letter

### Story Editor & CreateStoryDialog (`src/components/CreateStoryDialog.tsx`)

- **Multi-step flow** — two-step dialog: file select (Choose File button, image/video, max 50MB) → full Konva.js editing workspace
- **Konva.js canvas** — 9:16 aspect ratio (360×640 logical pixels) `react-konva` Stage, scaled to fit the container
- **Two-layer composition** — Instagram/TikTok-style background rendering using explicit Konva `Layer` separation:
  - **Layer 1 (Background Blur):** cover-scaled copy of the media (fills full 9:16 frame regardless of aspect ratio) with `Konva.Filters.Blur` at radius 40, plus a semi-transparent dark overlay `Rect` at `rgba(0,0,0,0.25)`
  - **Layer 2 (Main Content):** draggable/resizable original media (no filter) + text overlays + stickers + Transformer
- **Cover scaling** — `Math.max(STAGE_W / imgWidth, STAGE_H / imgHeight)` ensures the blurred background fills the entire frame; centered via `(STAGE_W - imgWidth * scale) / 2` offset
- **BlurredImageBg** — loads the image asynchronously, calculates natural dimensions, applies cover-scale + blur filter, calls `.cache()` on the Konva node (Konva requires caching for pixel filters)
- **BlurredVideoBg** — captures a single frame from the video (seeks to frame 0, draws to canvas) and renders it as a static blurred image; avoids resource contention from running two live video elements simultaneously
- **Background media as Konva node** — the selected image or video is rendered inside a `Group` (id `__bg__`) on Layer 2; draggable, resizable, and rotatable via Transformer handles — same as any overlay
  - **Video playback** — `KonvaVideoImage` component creates a `<video>` element internally and uses `requestAnimationFrame` to continuously draw frames onto `Konva.Image`; accepts a `muted` prop that toggles audio without restarting playback
  - **Image rendering** — `KonvaImageLoader` component loads images asynchronously into `Konva.Image`
- **Three editing tabs** — sidebar with Text, Stickers, and Music tabs:

  **Text tab:**
  - **"Add Text" button** — adds a new centered text overlay ("Double tap to edit") at position (50, 50)
  - **Double-click to edit** — double-clicking a text overlay hides its Konva node and positions a `<textarea>` (`EditableTextInput`) over the canvas; Escape/blur commits the value back into the overlay state
  - **8 fonts** — Inter, Poppins, Montserrat, Roboto, Playfair Display, Bebas Neue, Oswald, Dancing Script
  - **Font weight** — 6 levels: Light (300) through ExtraBold (800)
  - **Style toggles** — italic, underline, alignment (left/center/right)
  - **Color** — 15 preset color swatches + custom `<input type="color">` picker
  - **Remove** — delete button (Trash2 icon) at top-left of canvas when text is selected
  - **Video Audio** — when a video is uploaded, a Mute/Unmute toggle appears in the sidebar (Music tab) with contextual hint; toggles `videoMuted` state persisted in caption JSON
  - **No text selected** — shows instructional placeholder: "Select a text overlay on the canvas to edit its style"

  **Stickers tab:**
  - **Emoji stickers** — grid of 20 emojis, each clickable to place on the canvas; rendered as `KonvaText` with emoji character
  - **Custom image stickers** — Upload Image button opens file selector; loaded via `KonvaImageLoader` as `Konva.Image` inside a `Group`; aspect-ratio-preserved, max width 200px
  - All stickers are draggable, resizable, rotatable via Transformer

  **Music tab:**
  - **URL input** — paste a YouTube/SoundCloud/etc. URL; `detectMusicUrl` + `extractMusicMetadata` dynamically imported for code-splitting
  - **Trimmer** — `MusicTrimmer` component (reused from codebase) for start/end segment (max 15 seconds)
  - **Remove music** — button to deselect and clear music from the story

- **Transformer for all nodes** — every overlay Group + the background Group has `draggable` and shows Konva Transformer resize/rotate handles when selected; `boundBoxFunc` clamps minimum size to 10×10px
- **Layer stack** — `Layer 1: BlurredBg + DarkOverlay → Layer 2: Background Group → Overlay Groups → Transformer`
- **Overlay data model** — `CanvasOverlay` interface with id, type ('text' | 'image' | 'sticker'), x/y, rotation, scaleX/Y, width/height, text styling fields, src (for images), emoji (for stickers)
- **Background selection** — clicking the background media selects it and shows Transformer handles; clicking an overlay selects the overlay instead; clicking empty stage deselects all
- **Story creation** — `createStory` call passes: `{ overlays: [...], bgTransform: {...}, mediaRotation, videoMuted }` JSON as caption, music URL/title/segment timing; file uploaded to `stories` storage bucket
- **State cleanup** — `URL.revokeObjectURL` on reset; file input value cleared on reset; full state reset (overlays, background transform, selection, music) on close/create

### Writing Box Collapse on Click Outside (`src/components/NewPost.tsx`)

- **Capture-phase `mousedown` listener** — detects clicks outside the card wrapper, collapses the expanded state and hides action buttons
- **`onBlur` on textarea** — handles Tab/Shift-Tab keyboard navigation; only collapses when focus moves to an actual element outside the card (skips `relatedTarget = null` which occurs when clicking non-focusable elements)
- **Modal/popover exclusion** — clicks inside shadcn dialogs and Radix poppers do not collapse trigger
- **`URL.revokeObjectURL` cleanup** on file removal to prevent memory leaks

### Mobile Nav — Profile Removed (`src/components/MobileNav.tsx`, `src/components/Layout.tsx`)

- **Profile tab removed from MobileNav** — removed the `User` icon import and the Profile nav entry from the mobile bottom navigation bar; mobile nav now shows Home, Search, Messages, and the center Create button
- **ChatWindowManager hidden on mobile** — wrapped in `hidden md:block` so floating chat windows only appear on desktop/tablet

### PeopleYouMayKnow — Compact Facebook-Style Cards (`src/components/PeopleYouMayKnow.tsx`)

- **Card width reduced** — from `w-[140px]` to `w-[105px]` to match Facebook Lite / regular Facebook sizing
- **Image area changed** — from fixed `h-[160px]` cover photo to square `aspect-square` profile photo (105×105px)
- **Button shortened** — from full-width "Add friend" to compact `h-7 text-[11px]` "Add" button
- **Typography tightened** — name `text-sm` → `text-xs`, mutual friends "X mutual friends" → "X mutual", header icon `h-5 w-5` → `h-4 w-4`, title `font-semibold` → `text-sm font-semibold`
- **Spacing reduced** — card gap `gap-3` → `gap-2`, padding `p-2.5` → `p-2`, card `p-4` → `p-3`, close button smaller, "See all" text smaller
- **Auto-remove on add** — `removeSuggestion` called after `sendFriendRequest` to immediately remove from UI (Facebook behavior)
- **Empty/loading states** — reduced padding and icon sizes to match compact design

### Reels Section — Compact Facebook-Style Thumbnails (`src/components/reels/HorizontalReelsSection.tsx`)

- **Card width reduced** — from `w-36` (144px) to `w-[105px]` matching PeopleYouMayKnow sizing
- **Card styling** — `rounded-xl` → `rounded-lg`, `shadow-md` → `shadow-sm`, border radius and shadow reduced
- **Play button** — `w-12 h-12` → `w-8 h-8`, icon `w-6 h-6` → `w-4 h-4`
- **Overlay** — `bg-black/20` → `bg-black/15`, gradient height `h-20` → `h-14`
- **User info** — `p-2` → `p-1.5`, `text-xs` → `text-[10px]`, content line removed
- **Section header** — `text-lg` → `text-sm`, icon `w-5 h-5` → `w-4 h-4`, `mb-4` → `mb-3`, section padding `py-4` → `py-3`
- **Gap** — `gap-3` → `gap-2`
- **Scroll button** — `w-10 h-10` → `w-7 h-7`, `shadow-lg` → `shadow`, icon `w-5 h-5` → `w-3.5 h-3.5`
- **Loading skeletons** — updated to match new card dimensions

### Database Connection

- All 230 migrations applied via the gateway infrastructure layer
- Frontend connects via API Gateway (`VITE_API_GATEWAY_URL` in `.env`)
- No credentials in source code — `src/integrations/supabase/client.ts` is a dead module when env vars absent; it is now a type-only re-export (`export type { Database }`) with no client creation and no env vars at all
- All infrastructure credentials managed via the gateway; never exposed to clients
- Gateway infrastructure DB (`src/infrastructure/database/infrastructureDb.ts`) now retrieves config from `process.env` instead of hardcoded values
- Gateway deployed to `ibadsixx/gateway` GitHub repo, auto-deploys to `https://gateway-iota-two.vercel.app`

### Chats List Filtering (`supabase/migrations/20260610000001_filter_chats_by_relation.sql`)

- Updated `get_conversations_with_info` RPC to filter the Chats list
- DM conversations now only appear when the other party is:
  - An **accepted friend** (`friends.status = 'accepted'`), OR
  - A **follower/following** (`follows` table, either direction), OR
  - A **followed page** (`page_followers`), OR
  - An **accepted message request** (`message_requests.status = 'accepted'`), OR
  - A conversation the **current user has sent messages in**
- Channels and groups are unaffected

### Mobile Responsive Polish (`src/components/Post.tsx`, `src/components/Stories.tsx`, `src/components/MobileNav.tsx`, `src/components/Layout.tsx`)

- **Post card mobile-responsive** (`src/components/Post.tsx`) — reduced card padding (`p-3` mobile), avatar (`h-7 w-7`), action button labels hidden on mobile (`hidden sm:inline`), display name truncated (`max-w-[100px]`), media height constrained (`max-h-[50vh]` with `object-cover` for images), comment section spacing tightened, textarea smaller on mobile
- **Stories card sizing** (`src/components/Stories.tsx`) — cards reduced from `w-[110px] h-[190px]` to `w-[80px] h-[140px]` on mobile, expanding on `sm:`; Create Story card hidden on mobile (`hidden sm:block`)
- **Stories hide when empty** — entire Stories section returns `null` when no stories exist (after loading)
- **Stories hide/show toggle** — mobile-only toggle at bottom of stories section: centered `text-[11px]` "Hide stories" / "See stories" with border lines on both sides and chevron arrow; animated slide up/down with `0.5s easeInOut` via Framer Motion `AnimatePresence`
- **MobileNav Create button removed** (`src/components/MobileNav.tsx`) — center `Plus` button and its Post/Story/Reel action sheet removed entirely
- **MobileNav minimized** — height `h-16` → `h-12`, labels removed (icons only), link width `w-14` → `w-12`; Layout `pb-20` → `pb-14`
- **Logout moved to avatar dropdown** (`src/components/Layout.tsx`) — standalone header logout button replaced with `md:flex` desktop button (visible on desktop only) and `md:hidden` logout item in avatar dropdown menu (visible on mobile only)
- **Plus Create button hidden on desktop** — `md:hidden` on the header `+` button so it only appears on mobile
- **Story/Reel buttons wired** — Story and Reel buttons in the header `+` popover now open `CreateStoryDialog` and `CreateReelDialog` respectively
- **Raw caption JSON removed from StoryViewer** (`src/components/StoryViewer.tsx`) — removed the `<p>` tag rendering `currentStory.caption` as visible text (caption is structured data, not display text)

### Profile Page Mobile Responsiveness (`src/components/ProfileHeader.tsx`, `src/components/ProfileTabs.tsx`, `src/components/AboutSection.tsx`, `src/components/OverviewSection.tsx`, `src/components/Layout.tsx`, `src/components/PageContainer.tsx`, `src/components/EditBioDialog.tsx`, `src/components/ContactBasicInfoForm.tsx`, `src/components/FamilyAndRelationships.tsx`, `src/components/LifeEventsSection.tsx`, `src/components/DetailsAboutYouSection.tsx`, `src/pages/ProfilePage.tsx`, `src/components/cover/CoverPhotoEditor.tsx`)

- **Root cause: flex overflow** (`src/components/Layout.tsx`) — `<main>` flex item had `min-width: auto` preventing shrink below content width; fixed with `min-w-0` on `<main>` and `w-full` on `PageContainer`
- **Cover** (`src/components/cover/CoverPhotoEditor.tsx`, `src/pages/ProfilePage.tsx`) — shorter and wider (`h-36 md:h-56`), removed `rounded-lg`, Card gets `overflow-hidden`
- **Avatar** (`src/components/ProfileHeader.tsx`) — responsive sizing (`h-20 w-20 sm:h-24 sm:w-24 md:h-32 md:w-32`), fallback text scales accordingly
- **Story ring** (`src/components/ProfileHeader.tsx`) — fixed oval distortion by changing outer wrapper to `inline-flex`, removed `shadow-lg`, added `overflow-hidden`
- **Edit Bio button** (`src/components/EditBioDialog.tsx`) — moved from action buttons area to display name row, icon-only (`variant="ghost" size="icon" h-8 w-8`), right-aligned via `ml-auto`
- **Display name** (`src/components/ProfileHeader.tsx`) — dynamic font size based on word count (1 word: `text-2xl md:text-3xl`, 2 words: `text-xl md:text-2xl`, 3+: `text-lg md:text-xl`)
- **Tabs** (`src/components/ProfileTabs.tsx`) — changed from `inline-flex overflow-x-auto` to `grid grid-cols-5` on all screen sizes (no scrollbar); mobile shows single text symbols (P, S, @, A, F) with `md:hidden`; desktop shows full text (`hidden md:inline text-sm`)
- **Email display in Overview** (`src/components/OverviewSection.tsx`) — fixed concatenated email array rendering: `parseEmails` pattern to split multiple emails, each rendered on its own line with `break-all`
- **AboutSection responsive padding** (`src/components/AboutSection.tsx`) — Card padding `p-4 md:p-6`, CardTitle `text-base md:text-lg`, headings/spacing/labels all use `text-xs md:text-sm` / `space-y-2 md:space-y-3` / `space-y-4 md:space-y-6` patterns; labels stack vertically (`flex-col`) on mobile instead of fixed `w-20` side-by-side
- **OverviewSection responsive styling** (`src/components/OverviewSection.tsx`) — same padding/heading/spacing patterns as AboutSection
- **ContactBasicInfoForm compact** — all Input/SelectTrigger/Button fields resized to `h-14 border-0` on mobile for a Facebook Lite–style compact form; country code select narrowed to `w-14 md:w-32` showing flag-only on mobile (`hidden md:inline` for code); PrivacySelector compacted to `h-14 w-14 border-0` with icon-only on mobile; day selector `w-14 md:w-20 h-14 border-0`; all flex row gaps reduced to `gap-1.5 md:gap-2`; field group spacing `space-y-1 md:space-y-2`
- **FamilyMembersSection mobile compact** — both view and edit modes fully responsive: card padding `p-2 md:p-3`, avatars `h-8 w-8 md:h-10 md:w-10`, gaps `gap-2 md:gap-3`; all Input/SelectTrigger/Button elements `h-14 border-0`; add-form layout stacks on mobile (`flex-col md:flex-row`); VisibilitySelector widths responsive (`w-full md:w-[140px]`, edit `w-[80px] md:w-[120px]`); edit/action buttons `h-14 w-14 p-0`; badge/typography uses `text-[10px] md:text-xs`; CardHeader `pb-4 md:pb-6`; display mode also compacted with responsive Card padding and spacing
- **LifeEventsSection responsive** — Card padding `p-4 md:p-6`, event cards `p-3 md:p-4`, titles `text-sm md:text-base`, spacings reduced on mobile, "Add" button shows condensed text on mobile
- **DetailsAboutYouSection responsive** — Card padding `p-4 md:p-6`, title `text-base md:text-lg`, sub-headings `text-sm md:text-base`, content `text-xs md:text-sm`, other name items `p-2 md:p-3`
- **Consistent pattern across all about sections** — every Card/CardHeader/CardContent uses responsive padding; every heading uses `text-base md:text-lg` or `text-xs md:text-sm`; all spacings reduce on mobile via `space-y-2 md:space-y-3` or `space-y-4 md:space-y-6`; all icons add `shrink-0` to prevent squishing on small screens

### Avatar Menu Restructuring (`src/components/Layout.tsx`, `src/components/MobileNav.tsx`)

- **HeaderAvatar refactored** — component now returns only the menu content (no popover wrapper, no avatar trigger). The `avatar` variable and `<Popover>` wrapper were removed from `HeaderAvatar`.
- **Desktop header** — avatar `Popover` (trigger + `HeaderAvatar` content) restored in the header between `FriendRequestsDropdown` and Logout button, wrapped in `hidden md:flex` (desktop-only)
- **Mobile bottom nav** — avatar in `MobileNav` now opens a `Sheet` (bottom drawer, `side="bottom"`, `rounded-t-xl`) containing the full `HeaderAvatar` menu. The `avatarMenu` prop passes the `HeaderAvatar` JSX from `Layout`.
- **MobileNav reverted from Link to button** — the avatar was previously a `Link` to `/profile`; now it's a `button` serving as `SheetTrigger` that opens the account management sheet.
- **MobileNav props extended** — added optional `avatarMenu` prop (`ReactNode`) so the parent `Layout` can inject the `HeaderAvatar` menu content into the sheet.
- **Sidebar avatar removed** — the avatar/popover that was temporarily added to the desktop sidebar nav (separator + avatar item) was removed, keeping the sidebar nav clean.

## File Tree (top-level)

```
tone-your-social-voice/
├── .env                  — VITE_API_GATEWAY_URL only (no credentials)
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig*.json
├── vercel.json
├── playwright.config.ts
├── vitest.config.ts
├── components.json
├── public/              — favicon, emojis, reactions
├── scripts/             — migration utils, build helpers
├── supabase/            — config, 5 edge functions (Deno), 230 migrations
└── src/
    ├── main.tsx, App.tsx, index.css
    ├── api/              — unified API layer (client, types, users-types, posts, comments, stories, profiles, notifications, conversations, groups, pages, blocking, hashtags, music, advertisers, ads, users)
    ├── components/      — 100+ components (posts, stories, reels, messages, editor, groups, pages, settings, calls, ui/shadcn)
    │   └── FriendRequestsDropdown.tsx — Received/Sent tabs, max 10, people suggestions
    ├── pages/           — 25+ page components
    ├── hooks/           — 80+ custom hooks (import from @/api or @/lib/gateway)
    ├── contexts/        — Auth, Call, PageSwitch, HeaderAvatarMenu
    ├── lib/             — gateway.ts (compatibility client), crypto, audioEngine, player, utils, reactions
    ├── services/        — webrtc.ts
    ├── integrations/    — Supabase types only (client.ts is a dead module when env vars absent)
    ├── types/           — editor types, emojiMap, reactions
    └── utils/           — validation, formatting utilities
```

### Mobile Full-Screen Pages (`src/pages/CreatePost.tsx`, `src/pages/FeedbackPage.tsx`, `src/pages/FriendRequestsPage.tsx`, `src/components/NewPost.tsx`, `src/components/Layout.tsx`)

- **CreatePost page** (`/create/post`) — dedicated full-screen mobile post creation page outside Layout; sticky header with back arrow, "Create Post" title, and AudienceSummary; sticky Post button footer at bottom of screen
- **Feedback page** (`/feedback`) — dedicated full-screen feedback form (type/subject/message) with `h-14 border-0 bg-accent/50` fields; replaces `GiveFeedbackDialog` modal; triggered from `Ctrl+B` and header avatar dropdown
- **Friend Requests page** (`/friends/requests`) — dedicated full-screen page with Received/Sent tabs, accept/reject buttons, and "People you may know" suggestions; replaces dropdown on mobile
- **NewPost action buttons always visible** — Photo/Video, Reel, and More buttons moved outside the `isExpanded` conditional, always rendered below a `border-t` separator; Post button conditionally hidden when `stickyFooter` is true
- **Lifted audience state** — `audience` and `onAudienceChange` props on NewPost allow external management; CreatePost page manages audience state and renders AudienceSummary in the header; inline AudienceSummary hidden when external prop is provided
- **Notifications page** (`/notifications`) — dedicated full-screen page with notification list, unread badges, and "Mark all read" button; replaces dropdown on mobile
- **Layout.tsx mobile navigation** — both Notifications and Friend Requests header buttons navigate to their respective pages on mobile (`isMobile` check), keep dropdowns on desktop; `GiveFeedbackDialog` removed, `Ctrl+B` navigates to `/feedback`

This is a large, ambitious social media application (~100,000+ lines) with production-level features spanning the full social networking stack. All data access routes through the unified API layer (`src/api/`) → Tone API Gateway (`src/lib/gateway.ts`) → deployed gateway → backend projects.

---

## API Gateway Integration (July 2026)

### Architecture Change

The application has been fully migrated to use the **Tone API Gateway** instead of direct database connections:

| Before | After |
|--------|-------|
| Direct database connection | API Gateway proxy |
| `VITE_SUPABASE_URL` | `VITE_API_GATEWAY_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | (removed) |
| `VITE_SUPABASE_PROJECT_ID` | (removed) |
| `src/integrations/supabase/client.ts` with hardcoded credentials | `src/api/` unified API layer |
| 160 files importing from `@/integrations/supabase/client` | 160 files importing from `@/api` or `@/lib/gateway` |

**Gateway URL:** `https://gateway-iota-two.vercel.app`

**`.env` contents:** Only `VITE_API_GATEWAY_URL` — no credentials.

### Gateway Capabilities

The API Gateway routes requests to 13 separate backend projects by domain:

| Domain | Host Project | Status |
|--------|--------------|--------|
| `users` | users host | Active (48 social-graph tables) |
| `posts` | posts host | Active |
| `comments` | comments host | Active |
| `stories` | stories host | Active |
| `notifications` | notifications host | Active |
| `pages` | pages host | Active |
| `conversations` | conversations host | Active |
| `hashtags` | hashtags host | Active |
| `advertisers` | advertisers host | Active |
| `music` | music host | Active |
| `blocking` | blocking host | Active |
| `profiles` | profiles host | Auth-gated / unverified |
| `groups` | groups host | Active |

### Gateway Compatibility Client (`src/lib/gateway.ts`)

A ~1146-line SDK-compatible client that translates chainable queries to gateway REST API calls, with client-side filtering for unsupported gateway features:

- **Query builder:** `.from()`, `.select()`, `.eq()`, `.neq()`, `.gt()`, `.gte()`, `.lt()`, `.lte()`, `.in()`, `.like()`, `.ilike()`, `.or()`, `.not()`, `.is()`, `.order()`, `.limit()`, `.range()`, `.single()`, `.maybeSingle()`, `.count()`
- **CRUD:** `.insert()`, `.update()`, `.delete()`, `.upsert()` with proper URL routing (`/api/` for POST/GET, `/api/v1/` for PUT/DELETE)
- **RPC:** `gateway.rpc('function_name', { params })` → `POST /api/rpc/{function}`
- **Storage:** `gateway.storage.from('bucket').upload()`, `.getPublicUrl()` — routes uploads and public URLs through the gateway
- **Auth:** sign-up/sign-in/refresh via `POST /api/auth/{path}` on the gateway. RESOLVED Aug 4, 2026: GoTrue on the users project 500ed on user creation (`"Database error creating new user"`) from a dead `on_auth_user_created` trigger inserting into the missing `public.profiles`; the trigger was dropped and sign-up/sign-in now work (see `sql/fix_auth_users_project.sql`). The blocking RPCs now route to the `blocking` project (`RPC_DOMAIN_OVERRIDES` in `gateway/src/api/routes.ts`, functions in `sql/blocking_rpc_functions.sql`), deployed and verified.
- **Realtime:** Channel API with local broadcast support (gateway has no WebSocket)

### Migration Status

| Step | Status |
|------|--------|
| `.env` configured | ✓ Only `VITE_API_GATEWAY_URL` |
| `client.ts` fixed | ✓ Reads from env vars, no hardcoded credentials |
| `gateway.ts` created | ✓ Full chainable API compatibility layer |
| `src/api/` created | ✓ 14 domain modules (18 files) with typed functions |
| Import replacement | ✓ 160 files: `supabase` → `gateway` or `api` |
| Variable replacement | ✓ All `supabase.` → `gateway.` calls |
| Posts domain migrated | ✓ 5 files use `postsApi.*` from `src/api/posts.ts` |
| TypeScript build | ✓ 0 errors |
| Vite build | ✓ Success (30s) |

### Known Limitations

1. **Authentication is partial** — Data routes require a Bearer token (401 without one); system endpoints except `/health` are admin-gated but return 503 while `ADMIN_API_KEY` is undefined
2. ~~**Service key exposure**~~ — ~~`GET /api/system/databases` returns all project credentials~~ **RESOLVED (Aug 2026)** — endpoint removed from gateway source
3. **Profiles domain auth-gated & unverified** — `profiles` returns 401 without a Bearer token; `groups` is now online
4. **Table name mismatches** — `blocking` → `blocks` (no `blocks` domain is registered; the table lives in the `blocking` project); `music` → `music_library` (resolved July 2026 — `music_library` has its own domain)
5. ~~**Sub-tables inaccessible**~~ — **RESOLVED July 2026** — related tables (likes, shares, saved_posts, friends, other_names, etc.) now have their own gateway domains
6. **PUT/DELETE require `/v1/` prefix** — Not available at base `/api/` path
7. **Gateway lacks query filtering** — Resolved client-side: `.eq()`, `.order()`, `.limit()` etc. fetch all records and apply filtering/sorting/pagination in the browser. **Trade-off: fetches full table per request. Won't scale.**
8. **RPC proxying auth-gated & users-only** — `/api/rpc/:function` exists (`src/api/routes.ts:283`, mounted at `routes.ts:390`) but requires a Bearer token and routes to the `users` project by default (only `seed_default_ad_topics` is overridden); unusable on the live deployment without a token
9. **Gateway lacks storage proxying** — `/api/storage/upload` endpoint doesn't exist yet
10. **Realtime degraded** — Broadcast channels work locally; postgres_changes subscriptions are no-ops
11. **Only 13/89 hooks use the API layer** — remaining hooks call gateway directly, duplicating queries
12. **React Query nearly unused** — installed but only `useMusicLibrary.ts` uses it; all other hooks use manual `useState`/`useEffect`/`fetch`
13. **TypeScript strictness disabled** — `noImplicitAny: false`, `strictNullChecks: false`
14. **Near-zero test coverage** — 4 test files, zero component/hook/integration tests
15. **10 files over 1000 lines** (excluding auto-generated `types.ts`) — largest is `PageDetail.tsx` at 1939 lines
16. **100+ console.log statements** in production hooks

### Remaining Gateway-Side Work

For full functionality, the gateway needs:

1. **Query filtering** — ~~URL query params for `.eq()`, `.order()`, `.limit()`, `.range()`, `.in()`, `.or()`, `.ilike()`~~ Done client-side; server-side still recommended to avoid fetching all records
2. **RPC proxying** — `POST /api/rpc/:function` exists (`src/api/routes.ts:283`, mounted at `routes.ts:390`) but only routes to the `users` project (or `seed_default_ad_topics` → `ad_topics`) and requires a Bearer token; no working token obtainable on the live deployment
3. **Auth middleware** — JWT validation or API key system (data routes require a Bearer token, but system endpoints return 503 because `ADMIN_API_KEY` is undefined)
4. **Storage proxying** — File upload passthrough via the gateway
5. **Realtime/WebSocket support** — Proxy realtime connections via the gateway
6. ~~**Remove or protect `/api/system/databases`** — never expose service keys publicly~~ **DONE** — endpoint removed from gateway source (`src/api/routes.ts:242`)

### Security Notes

- `.env` contains **only** `VITE_API_GATEWAY_URL` — no credentials in source code
- Gateway authentication is **partial** — data routes require a Bearer token (401 without one); system endpoints except `/health` are admin-gated but 503 while `ADMIN_API_KEY` is undefined
- ~~Gateway exposes service keys via `GET /api/system/databases` (critical vulnerability)~~ — endpoint removed (Aug 2026); system endpoints admin-gated (503 while `ADMIN_API_KEY` undefined)
- ECDH private keys stored in `localStorage` (`src/hooks/useEncryptionKeys.ts:100`) — vulnerable to XSS
- Auth tokens (`access_token`, `refresh_token`) stored in `localStorage` (`src/lib/gateway.ts:530`) — single XSS compromises auth + encryption
- No input sanitization on user-generated content (`src/hooks/useComments.ts:90`) — stored XSS risk
- Regex injection in gateway filter builder (`src/lib/gateway.ts:99-104`) — ReDoS possible
- No Content Security Policy headers on `index.html`
- No CSRF protection on gateway fetch calls
- Original RLS policies no longer apply through gateway
- `src/integrations/supabase/client.ts` is now a dead module (returns `null` when env vars absent)

### Recommendations (Gateway Integration)

1. **Add gateway authentication** — Implement JWT or API key validation
2. ~~**Remove `/api/system/databases` endpoint** — Never expose service keys publicly~~ **DONE** — removed from gateway source
3. **Fix offline databases** — Verify/restore `profiles` (auth-gated, returns 401 without a Bearer token); `groups` is now online
4. **Extend gateway RPC proxying** — the `/api/rpc/:function` proxy exists (`src/api/routes.ts:283`, mounted at `routes.ts:390`) but is auth-gated and defaults to the `users` project; 20+ RPC functions need domain routing and a working token
5. **Add gateway storage proxying** — File uploads need passthrough
6. **Refactor large components** — Break down 10 files >1000 lines (excluding auto-generated `types.ts`) into smaller, focused components
7. **Add unit tests** — Target critical paths: auth flow, encryption, post creation, messaging
8. **Standardize package manager** — Remove either `bun.lock` or `package-lock.json`
9. **Move ECDH keys to IndexedDB or memory** — `localStorage` is vulnerable to XSS
10. **Add input sanitization** — XSS-proof all user-generated content
11. **Fix regex injection** — Escape special characters before `new RegExp()` in gateway filter builder
12. **Enable TypeScript strictness** — Start with `strictNullChecks: true`
13. **Adopt React Query** — Replace manual `useState`/`useEffect`/`fetch` across all 76 remaining hooks
14. **Complete API layer migration** — Move all hooks off direct `gateway` calls

### Overall Assessment (Migration)

The application has been fully migrated to use the API Gateway with a clean 3-layer architecture: `src/api/` (domain functions) → `src/lib/gateway.ts` (query builder) → API Gateway → Backend Projects. All 160 source files import from `@/api` or `@/lib/gateway`. The `.env` contains only `VITE_API_GATEWAY_URL` with no credentials. The unified API layer provides typed functions for all 14 domains. The Posts domain is fully migrated to use the API layer. Client-side filtering, sorting, and pagination handle the gateway's lack of query param support. The app compiles and builds cleanly.

---

## Security Audit

### Critical

| # | Issue | File | Impact |
|---|-------|------|--------|
| 1 | **ECDH private keys stored in `localStorage`** | `src/hooks/useEncryptionKeys.ts:100` | A single XSS attack compromises all E2E encrypted messages. Private encryption keys should use IndexedDB with isolation or be kept only in memory. |
| 2 | **Auth tokens + private keys both in `localStorage`** | `src/lib/gateway.ts:530` | Auth session (`access_token`, `refresh_token`) stored alongside encryption keys. One XSS compromises both authentication and message encryption. |
| 3 | **No input sanitization on user-generated content** | `src/hooks/useComments.ts:90` | Comment content inserted with only `.trim()` — no XSS sanitization. Stored XSS rendered to all users across posts, comments, messages. |
| 4 | **`.env` committed to repo** | `.env` | Currently benign (`VITE_API_GATEWAY_URL` only) — hygiene/process issue, not a live vulnerability. Not in `.gitignore`; add it. |

### High

| # | Issue | File | Impact |
|---|-------|------|--------|
| 5 | **Regex injection in gateway filter builder** | `src/lib/gateway.ts:99-104` | `like` and `ilike` filter operations interpolate user-supplied patterns into `new RegExp()` without escaping special regex characters. Potential ReDoS. |
| 6 | **Auth token leaked via console.log** | `src/hooks/useFileUpload.ts:45` | `console.log('[useFileUpload] ✅ User authenticated:', user.id)` — sensitive user data logged to console in production. Multiple other hooks log user IDs and project data. |
| 7 | **No CSRF protection** | `src/lib/gateway.ts:536-540` | `_gatewayFetch` sends auth tokens via `Authorization` header but has no CSRF token. Since this is a SPA calling a separate gateway origin, SameSite cookies don't apply. |
| 8 | **Client-side filtering fetches entire tables** | `src/lib/gateway.ts:303-306` | When gateway ignores query params, client fetches ALL rows per table into the browser. Catastrophic for performance at scale. The comment on line 28 acknowledges this. |
| 9 | ~~**Supabase client created with wrong credentials**~~ | `src/integrations/supabase/client.ts` | ~~`SUPABASE_ANON_KEY` set to `VITE_API_GATEWAY_URL` instead of actual key.~~ **RESOLVED** — `client.ts` is now a type-only re-export; no client is created and no env vars are read. |

### Medium

| # | Issue | File | Impact |
|---|-------|------|--------|
| 10 | **No Content Security Policy headers** | `index.html` | No CSP meta tag or headers. For an app with encryption, rich media, and user content, this is a significant gap. |
| 11 | **`like` filter creates regex from user input** | `src/lib/gateway.ts:99` | `const pattern = val.replace(/%/g, '.*'); return new RegExp('^${pattern}$', 'i').test(...)` — no escaping of regex special characters. |

---

## Bugs

| # | Issue | File | Severity | Status |
|---|-------|------|----------|--------|
| 1 | **`getUserPosts` calls hook as plain function** — breaks Rules of Hooks | `src/hooks/usePosts.tsx:80-82` | High | Open |
| 2 | ~~**Broken negation logic in `applyFilters`** — `!matches` condition makes negation always true~~ | `src/lib/gateway.ts:81` | High | **FIXED** — Arrow function + simplified negation logic |
| 3 | **`send()` on channels is a no-op for server** — real-time updates to other users won't work | `src/lib/gateway.ts:516-522` | High | Open |
| 4 | ~~**`hasActiveStories` always returns `false`**~~ — ~~wrong count extraction from `_countOnly` path~~ | `src/api/stories.ts:29-31` | Medium | **NO LONGER PRESENT** — current implementation uses `.select('id').gt('expires_at', ...).limit(1)` + `length > 0`; no count extraction involved |
| 5 | **Story view count race condition** — read-then-write, not atomic | `src/hooks/useStories.ts:217-223` | Medium | Open |
| 6 | **`QueryClient` created at module scope** — persists between test runs | `src/App.tsx:46` | Low | Open |
| 7 | **`fetchConversationsDirectly` returns wrong shape** — local `Conversation` type conflicts with `api/types.ts` type | `src/hooks/useConversations.ts:71-96` | Low | Open |
| 8 | **Column selection broken with nested joins** — complex select strings with PostgREST nested joins (e.g., `group_members!...(...)`) caused `parseSelect` to return partial columns instead of full rows | `src/lib/gateway.ts:326-340` | High | **FIXED** — `parseSelectColumns()` + `hasNestedJoins()` helpers added |
| 9 | ~~**Call state stuck after WebRTC disconnect** — `onConnectionStateChange` calls `resetCallState()` without sending `call-ended` to remote peer; remote stays busy~~ | `src/contexts/call/CallContext.tsx:127-157` | Critical | **FIXED (Aug 19, 2026)** — sends `call-ended` + logs to DB before `resetCallState()`; added `beforeunload` listener for tab close |
| 10 | ~~**No audio during voice calls** — `useEffect` attaching `remoteStream` to `<audio>` missing `status` dep; effect runs before ref mounts~~ | `src/components/calls/ActiveCallWindow.tsx:116-123` | Critical | **FIXED (Aug 19, 2026)** — added `status` to deps + autoplay retry on user gesture |
| 11 | ~~**Stuck-busy relapse after graceful-disconnect fix** — crashed tab left the cross-tab localStorage counter >0 forever (auto-busy survived reloads); `call-ended` lost in SSE reconnect gaps left zombie state; busy reply never checked whether the local call was alive; no callee ring timeout~~ | `src/contexts/call/CallContext.tsx`, `src/contexts/call/callTabCoordinator.ts` | Critical | **FIXED (Aug 21, 2026, `b5c54ff`)** — heartbeat + 75s staleness self-heals stale counter entries (legacy values heal on load); zombie-check accepts incoming calls when own peer connection is failed/closed; 15s watchdog ends silent-death calls; 45s ring timeout; `call-ended` retries on `delivered=0`; counter decrement guarded by `inCallRef` |

---

## Code Quality Issues

### TypeScript Strictness Disabled

`tsconfig.json:3-6`:
```
"noImplicitAny": false,
"noUnusedLocals": false,
"noUnusedParameters": false,
"strict": false,
"strictNullChecks": false
```

With `strict: false` and `strictNullChecks: false`, TypeScript catches very few bugs. The `any` type is used extensively:
- `src/lib/gateway.ts` — 13 `(fb as any)` casts (16 `as any` total) to bypass type checking
- `src/lib/gateway.ts:543` — `_parseJson` returns `Promise<any>`
- Most hooks use `catch (error: any)`

### Files Over 1000 Lines

| File | Lines |
|------|-------|
| `src/integrations/supabase/types.ts` | 5005 (auto-generated, acceptable) |
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
| `src/hooks/useConversations.ts` | 977 |
| `src/components/messages/MessageBubble.tsx` | 932 |
| `src/pages/Settings.tsx` | 914 |
| `src/components/messages/ChatWindow.tsx` | 899 |

### API Layer Barely Used

Only 13 of 89 hooks import from `src/api/`:
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

### React Query Unused Despite Being Installed

`@tanstack/react-query` is in `package.json:45` and `QueryClientProvider` wraps the app (`App.tsx:49`), but only 1 of the 89 hooks (`src/hooks/useMusicLibrary.ts`) uses `useQuery`/`useMutation`. Every other hook uses manual `useState`/`useEffect`/`fetch` — no caching, no dedup, no stale-while-revalidate, no background refetching, no retry logic.

### Excessive console.log in Production

Over 100 `console.log`, `console.error`, and `console.warn` statements in hooks alone:
- `src/hooks/useFileUpload.ts` — 12 console.log statements with emoji prefixes
- `src/hooks/useEditorProject.ts` — 16 console.log statements
- `src/lib/storage.ts` — 11 console.log statements

### Gateway Code Duplication

`src/lib/gateway.ts` (1146 lines) contains `GatewayQueryBuilder` (lines 353-428) and `PostgrestFilterBuilder` (lines 127-351) with nearly identical filter/order/limit/offset methods duplicated between the two classes.

---

## Missing Infrastructure

### Tests

Only 4 test files exist in `src/__tests__/`:
- `audioEngine.test.ts` — pure math tests, doesn't test actual AudioEngine
- `autosave.test.ts` — tests helper functions, not the hook
- `editorHistory.test.ts` — unknown coverage
- `player.test.ts` — unknown coverage

**Zero component tests. Zero integration tests. Zero hooks tests.** The vitest config (`vitest.config.ts`) has empty `setupFiles: []` — no mock setup for browser APIs like `localStorage`, `crypto`, `fetch`, `MediaStream`. Playwright config references `lovable-agent-playwright-config` but no `e2e/` directory exists.

### Missing Essentials

- No `.env.example` for developers
- No CI/CD config (`.github/workflows/`, etc.)
- No README with setup instructions
- No `CONTRIBUTING.md` or development documentation
- No type checking in CI
- Minimal `.gitignore` — missing `.env.local`, `*.tsbuildinfo`, IDE folders, OS files

---

## Current Status (Aug 2026)

| Item | Status |
|------|--------|
| Dependencies installed | ✓ (`npm install` completed) |
| Dev server | ✓ Running at `http://localhost:8080/` |
| `.env` | ✓ Only `VITE_API_GATEWAY_URL` |
| Hardcoded credentials | ✓ Removed from `client.ts` |
| Gateway client | ✓ `src/lib/gateway.ts` (1146 lines) — column selection, join cardinality, `not.` serialization fixed |
| API layer | ✓ `src/api/` — 14 domain modules (18 files), typed functions |
| Import migration | ✓ 160 files: `supabase` → `gateway` or `api` |
| Posts domain | ✓ 5 files migrated to `postsApi.*` |
| Groups page | ✓ Privacy field added to interface, GroupCard, CreateGroupDialog; createGroup updated |
| Profile page | ✓ Migrated to `profilesApi` (from direct `gateway.from('profiles')`) |
| TypeScript build | ✓ 0 errors |
| Vite build | ✓ Success |
| Gateway query filtering | ✓ Client-side (fetches all, filters in browser) |
| Gateway auth | ✗ Partial — data routes require Bearer; system endpoints admin-gated but 503 (`ADMIN_API_KEY` undefined) |
| Gateway RPC | ✗ Partial — `/api/rpc/:function` exists (`routes.ts:283`) but auth-gated, users-project-default, unverified without a token |
| Gateway storage | ✗ Not implemented |
| Gateway realtime | ✗ Not implemented |
| Tests | ✗ 4 files, zero component/hook/integration tests |
| CI/CD | ✗ Not configured |
| TypeScript strictness | ✗ Disabled (`strict: false`) |
| Profiles host project | ✗ Auth-gated / unverified (returns 401 without a Bearer token) |

---

## Recommendations (Priority Order)

1. **Rotate and remove exposed credentials** — `.env` committed to git; ensure no secrets are ever stored client-side
2. **Move private keys out of `localStorage`** — use IndexedDB or in-memory-only storage for ECDH keys (`src/hooks/useEncryptionKeys.ts:100`)
3. **Add input sanitization** — XSS-proof all user-generated content before rendering (`src/hooks/useComments.ts:90`)
4. **Fix regex injection** — escape special characters before interpolation into `new RegExp()` (`src/lib/gateway.ts:99-104`)
5. **Implement server-side query filtering** in the gateway — stop fetching entire tables to the browser
6. **Complete API layer migration** — move remaining hooks off direct `gateway` calls to `src/api/` modules (posts, groups, profiles, blocking, ads, notifications, conversations now migrated; 76 hooks remain)
7. **Adopt React Query** — replace manual `useState`/`useEffect`/`fetch` with `useQuery`/`useMutation` for caching and dedup
8. **Enable TypeScript strictness incrementally** — `strictNullChecks: true` first, then `noImplicitAny`
9. **Add tests** — prioritize auth, encryption, post creation, messaging, and the gateway client
10. **Decompose large files** — break 10 files over 1000 lines (excluding auto-generated `types.ts`) into smaller, focused modules
11. **Add CI/CD** — linting, type checking, tests on every push
12. **Add Content Security Policy headers** — prevent XSS, inline script injection, and data exfiltration
13. **Remove console.log statements** — replace with structured logging or remove entirely for production
14. **Fix bugs** — `getUserPosts` Rules of Hooks violation (`usePosts.tsx:80`), dead channel `send()` (`gateway.ts:516`)
15. **Verify/restore profiles host project** — the profiles host is auth-gated (returns 401 without a Bearer token) and unverified; profile page shows an empty state until confirmed with a valid token

### Running the Project

```bash
cd /workspaces/codespaces-blank/tone-your-social-voice
npm install
npm run dev
# → http://localhost:8080/
```
