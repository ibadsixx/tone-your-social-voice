# Revisions

## 2026-06-03

### Profile details — username validation, removed entries, email sub-dialog

**Problem:** The username field had no validation — empty or duplicate usernames were silently accepted. The profile details list contained "Profile picture" and "Bio" entries that did nothing. The contact info email row was a static button with no sub-view.

**Fixes:**
- **Username mandatory + red ring** — `ProfilesAndPersonalDetails.tsx` validates non-empty on save; empty field shows red ring (`ring-2 ring-red-500`) + "Username is required" message
- **Existing username check** — debounced (500ms) Supabase lookup against `profiles` table (`neq` current user's id); taken usernames show "Username already exists" + up to 5 clickable suggestion chips (e.g. `user1`, `user2`) that auto-fill on click; Done button disabled while checking
- **Removed "Profile picture" and "Bio"** — deleted both entries from the profile details list in `profileDetailDialog`
- **Email sub-dialog** — clicking the email row opens `contact-email` sub-view showing primary auth email + all emails from `profiles.email` array; "+ Add another" button at bottom; non-primary emails have X button to remove
- **Add email form** — clicking "+ Add another" toggles to a form with email `Input`, "Cancel" button, and "Send" button; appends to `profiles.email` array via Supabase update
- **Migration: profiles.email changed to TEXT[]** — `20260603000016_store_emails_as_array.sql`: alters `profiles.email` from `VARCHAR(255)` to `TEXT[]`; updates `handle_new_user()` to store email as `ARRAY[new.email]`; creates `resolve_auth_email(p_email)` RPC that searches `profiles.email` array (via `@>` operator) then falls back to `auth.users.email`

**Files:**
- `src/components/settings/ProfilesAndPersonalDetails.tsx` — username validation + suggestions, removed Profile picture/Bio, email sub-dialog with add form

## 2026-06-02

### Settings page — navbar/contacts hidden, icon-only nav, mandatory name fields

**Problem:** The Layout's left sidebar (navigation icons) and right FloatingIM contacts sidebar both appeared on the `/settings` page, wasting space. The settings nav menu showed text labels that weren't needed. The display name editor allowed empty first/last names.

**Fixes:**
- **Left navbar hidden on `/settings`** — `Layout.tsx` conditionally renders the sidebar only when `location.pathname !== '/settings'`
- **FloatingIM contacts hidden on `/settings`** — added `location.pathname !== '/settings'` to the FloatingIM render condition
- **Settings nav icon-only** — `Settings.tsx` sidebar shows only icons (no text), with narrower `w-12` column, compact padding, and smaller icons
- **"+" bubble moved to right** — `ChatWindowManager.tsx` FAB now always positioned at `bottom-0 right-4`; popover search anchored `right-0` to stay on-screen
- **Minimized chat bubbles separated** — FAB and minimized bubbles are now in separate fixed containers (FAB on right, bubbles on their original side)
- **Display name mandatory** — `ProfilesAndPersonalDetails.tsx` validates first/last name on save; empty fields show a persistent red ring (`ring-2 ring-red-500`) instead of a toast error; `focus-visible:ring-0` excluded during error state so the ring doesn't disappear on focus

**Files:**
- `src/components/Layout.tsx` — hide sidebar and FloatingIM on `/settings`
- `src/pages/Settings.tsx` — icon-only nav, thinner `w-12` column
- `src/components/im/ChatWindowManager.tsx` — "+" bubble always right, popover anchor fix, minimized bubbles separated
- `src/components/settings/ProfilesAndPersonalDetails.tsx` — mandatory first/last name with red ring validation

## 2026-06-01

### Page conversations — separate /messages when acting as a page

**Problem:** When a user switches to a page identity (via the header avatar menu), clicking Messages still showed the user's personal conversations instead of the page's conversations. Page conversations use `conversations.page_id` to associate DMs with a page, but `get_conversations_with_info` RPC only looks up conversations by participant user ID and ignores `page_id`.

**Fix:**
- `useConversations` now reads `actingPage` from `PageSwitchContext` internally (no parameter changes needed by callers)
- When `actingPageId` is set, `fetchConversations` calls `fetchPageConversationsDirectly(pageId, userId)` which queries `conversations WHERE page_id = actingPageId` instead of using the RPC or participant-based lookup
- When `actingPageId` is set, `getOrCreateDM` automatically updates the conversation's `page_id = actingPageId` after creation, so new DMs are associated with the page
- No changes needed in `Messages.tsx`, `MiniChatWindow.tsx`, or `ChatWindowManager.tsx` — they all call `useConversations` which now handles the split internally

**Behavior:**
- Personal mode: /messages shows the user's own conversations (unchanged)
- Page mode: /messages shows only the page's conversations (filtered by `conversations.page_id`)
- Mini chat windows opened while acting as a page create page-associated DMs
- Existing page conversations in FloatingIM remain unchanged

**Files:**
- `src/hooks/useConversations.ts` — added `usePageSwitch` import, `actingPageId` from context, `fetchPageConversationsDirectly()` function, branch in `fetchConversations`, page_id update in `getOrCreateDM`

### Navigation blank page — "Rendered more hooks than during the previous render"

**Problem:** Navigating between pages (e.g., Home → Messages) caused a blank white screen until full page refresh. React threw "Rendered more hooks than during the previous render" because `ChatWindowManager.tsx` had an early return (`if (!currentUserId || isMessagesPage) return null;`) that appeared **before** 4 hook calls (two `useCallback`s and two `useEffect`s). When `isMessagesPage` changed from false to true (or vice versa), the hook count changed between renders, crashing the React tree.

**Fix:**
- Moved the early return to **after** all hook declarations (line 79 → line 134)
- Added `if (!currentUserId) return;` guard inside the search-user `useEffect` so it doesn't fire Supabase queries when the component will return null
- Also added `ErrorBoundary` wrapping `Layout` and `Auth` routes in `App.tsx` as a safety net
- Added global `window.onerror` and `unhandledrejection` handlers in `main.tsx` for future diagnostics

**Files:**
- `src/components/im/ChatWindowManager.tsx` — moved hooks before early return
- `src/components/ErrorBoundary.tsx` — new error boundary component
- `src/App.tsx` — added `ErrorBoundary` import and wrapping
- `src/main.tsx` — added global error listeners

## 2026-05-28

### Flag conversation audit — 13 issues found, C1 fixed (C1–C13)

**C1 — Missing DELETE policy on `conversation_reports`:** Added DELETE policy so re-reporting works. The `useConversationReport` hook deletes old reports before inserting new ones (to allow different reasons), but RLS silently blocked the delete, causing a unique constraint violation on re-report.

**H1 — Missing DELETE policy on `message_reports`:** Added matching DELETE policy for consistency.

**H2 — `details` parameter never collected from user:** Added textarea in ReportMessageModal's confirmation step with 1000-char limit and live counter. Passes `details` to `onReport()`.

**H3 — Block dialog toasts fire before async `onBlock` completes:** Made both block button `onClick` handlers async/await with try/catch for error toasts.

**H4 — `onClearHistory` in ChatWindow is a no-op:** Changed the no-op `console.log` to `navigate('/messages')` so clearing navigates back to the conversation list.

**M1 — `ReportMessageModal` missing `userName` for message-level reports:** Passed `userName={otherUser?.display_name}` so the warning footer shows the user's name.

**M2 — "Learn more about reporting" link is a dead link:** Removed the dead link (side effect of H2 — replaced by the details textarea).

**M3 — "Clear conversation" hard-deletes messages:** Replaced hard `DELETE FROM messages` with soft-delete via new `conversation_clears` table. `handleClearConversation` upserts a clear timestamp; `fetchMessages` filters hidden messages client-side. Conversation dialog description updated.

**M4 — `encryptionDetailsSchema` `verified_at` cannot be null:** Made all inner fields `.nullable().optional()` so partial RPC responses don't crash Zod parsing.

**L1 — `message_reports` FK references `profiles` instead of `auth.users`:** Changed `message_reports.reporter_id` FK from `profiles(id)` to `auth.users(id)` to match `conversation_reports`.

**L2 — No user feedback when `otherUser` is null:** Added `console.warn` to report handler else branch.
**L3 — No user feedback when `conversationId` is missing:** Added `console.warn` to encryption handler guard.

**N1 — `onReport` callback returns `true` unconditionally:** Fixed to return `false` when no report is submitted.
**L4 — `profile_pic` used without null check:** Conditionally rendered `AvatarImage`.
**N2 — `handleSaveMessagingControls` hardcodes `p_who_can_reply`:** Removed hardcoded parameter from RPC call — function defaults to NULL, field left untouched.

### Clear conversation audit — 5 issues found and fixed (C1–C5)

**C1 — `get_conversations_with_info` RPC doesn't filter cleared conversations from sidebar:**
Added `LEFT JOIN conversation_clears cc` and a `WHERE` clause that excludes conversations where a clear record exists AND no message with `created_at > cleared_at` exists. Cleared conversations are hidden from the sidebar until a new message arrives.

**C2 — Sidebar not refreshed after clear:**
Added `onClearHistory` prop to `ChatWindowProps` (previously hardcoded inline). `Messages.tsx` now passes a handler that calls `refetchConversations()` before `navigate('/messages')`, so the sidebar updates immediately on clear.

**C3 — Encryption key cache not purged on clear:**
Added `deleteCachedConversationKey(conversationId)` to `lib/crypto.ts` (single-key deletion, vs. `clearConversationKeyCache()` which nukes all keys). Re-exported via `lib/conversationEncryption.ts`. Called in `handleClearConversation` after successful upsert.

**C4 — "Load older messages" never terminates for cleared conversations:**
Added `hasMoreMessages` state to `useConversations` hook. Logic: `rawCount >= limit && formattedMessages.length > 0` — only `true` when the raw query returned a full page AND at least one message survived the clear filter. Threaded through `Messages.tsx` → `ChatWindow` → button visibility check.

**C5 — Unread count not reset on clear:**
Moved `LEFT JOIN conversation_clears cc` before the `unread` lateral subquery and added `AND (cc.id IS NULL OR m.created_at > cc.cleared_at)` to the unread count WHERE clause. Only post-clear messages are counted as unread.

### Group chat creation — CreateGroupChatDialog, group header, search

**CreateGroupChatDialog:** New component at `src/components/messages/CreateGroupChatDialog.tsx` — debounced user search, multi-select chips, group name input, `create_group_conversation` RPC call.

**Group header in ChatWindow:** Accepts `conversationName` prop. When `otherUser` is null but `conversationName` is set, renders group name + "Group conversation" subtitle with `Users` avatar icon instead of individual user info.

**Search by group name:** `ConversationList.tsx` search filter now checks `conv.name` for group conversations alongside individual display_name/username.

**Wiring:** "Create group chat" in `NewConversationDialog` opens the new dialog instead of navigating to `/groups`. `Messages.tsx` has `handleGroupCreated` that sets active conversation, fetches messages, and navigates.

**RPC types:** Updated `get_conversations_with_info` return type and added `create_group_conversation` to `src/integrations/supabase/types.ts`.

**Migration (existing):** `supabase/migrations/20260603000006_add_group_conversations.sql` — adds `name` column to `conversations`, creates `create_group_conversation` RPC, updates `get_conversations_with_info` to return `conversation_name` and use LATERAL participant join.

**Files:**
- `src/components/messages/CreateGroupChatDialog.tsx` — new component
- `src/components/messages/ChatWindow.tsx` — `conversationName` prop, group header conditional
- `src/components/messages/ConversationList.tsx` — search includes group name
- `src/components/messages/NewConversationDialog.tsx` — replaced `/groups` redirect with group dialog
- `src/pages/Messages.tsx` — `handleGroupCreated` handler
- `src/integrations/supabase/types.ts` — RPC type updates
- `supabase/migrations/20260603000006_add_group_conversations.sql` — group migration

## 2026-05-27

### E2EE "Check encryption" feature — 9 problems fixed (P1–P9)

**P1 — Hardcoded fingerprints:** Replaced `ab:cd:ef:...` with real WebCrypto ECDSA P-256 keys. SHA-256 fingerprints generated from actual SPKI public keys. Keys persisted in localStorage and synced to new `user_encryption_keys` table.

**P2 — Synthetic "Your keys" button:** Current user identified via `supabase.auth.getUser()`. All keys fetched from `get_encryption_details` RPC.

**P3 — Fake device fallback:** Removed all hardcoded Safari/Chrome/"Last seen 10 days ago" strings. Shows "No encryption keys registered" when empty.

**P4 — Superficial verification:** Added `verified_key_fingerprint`/`verified_user_id` columns. Verify RPC accepts `p_fingerprint_to_verify` + `p_user_id_to_verify`. Per-device "Verify identity" button + "Verified ✓" badge.

**P5 — Type safety gap:** Added Zod schemas (`deviceSchema`, `participantDataSchema`, `encryptionDetailsSchema`) with `.parse()` instead of bare `as EncryptionDetails` casts.

**P6 — Static "Last seen 10 days ago":** Removed with fake device fallback (P3).

**P7 — Cosmetic "End-to-end encrypted" badge:** Added `encryptionStatus` state (`'loading'`|`'encrypted'`|`'not-encrypted'`). Auto-fetches encryption data on panel open. Badge only renders when real device keys exist.

**P8 — SECURITY DEFINER w/o membership check:** Added `WHERE cp.user_id = auth.uid()` guard to `get_encryption_details` RPC.

**P9 — Stale closure:** Both "Check again" and "Verify identity" handlers capture `const cid = conversationId` at click time.

**Files:**
- `supabase/migrations/20260527000000_add_user_encryption_keys.sql` — `user_encryption_keys` table, ECDSA RPCs
- `supabase/migrations/20260527000001_add_key_verification_to_encryption.sql` — `verified_key_fingerprint`/`verified_user_id` columns, updated verify RPC
- `supabase/migrations/20260528000000_add_e2ee_columns.sql` — ECDH columns, `encrypted_content`/`encryption_iv` on messages, all encryption RPCs with ECDH params
- `scripts/apply-all-migrations.ts` — applies all 179 migrations via Management API
- `src/hooks/useEncryptionKeys.ts` — ECDSA + ECDH P-256 key generation, SHA-256 fingerprinting, localStorage persistence, server sync
- `src/hooks/useConversations.ts` — auto-init encryption on conversation change; encrypts text before insert; decrypts after fetch + real-time; `tryDecryptMessage()`
- `src/components/messages/ChatInfoPanel.tsx` — Zod validation schemas; conditional E2EE badge; verify button; fingerprint display; fix stale closure
- `src/lib/crypto.ts` — ECDH P-256 key gen, SPKI/PKCS8 export/import, SHA-256 fingerprint, AES-GCM-256 encrypt/decrypt, in-memory conversation key cache
- `src/lib/conversationEncryption.ts` — module-level `initConversationEncryption()`, `encryptContent()`, `decryptContent()`, `isEncryptionReady()`
- `src/integrations/supabase/types.ts` — RPC type stubs for all encryption RPCs
- `check-encryption-property.md` — full feature analysis with all 9 fixes and E2EE architecture

### usePresence.ts — fix `.catch()` on thenable builder

**Problem:** `supabase.rpc(...).catch()` threw `catch is not a function` because the Supabase client returns a thenable builder (has `.then()` but not `.catch()`).

**Fix:** Changed `.catch(() => {})` to `.then()`.

**File:** `src/hooks/usePresence.ts`

### Video playback — added `playsInline` + `preload="auto"`

**Problem:** Chromium in Codespaces reported `ERR_CACHE_OPERATION_NOT_SUPPORTED` for video fetches from Supabase Storage, and after disabling cache, videos showed 0:00 duration.

**Fix:** Added `playsInline` and `preload="auto"` attributes to all 5 `<video>` elements in MessageBubble.tsx and both in SharedMediaModal.tsx.

**Files:**
- `src/components/messages/MessageBubble.tsx`
- `src/components/messages/SharedMediaModal.tsx`

## 2026-05-24

- Cloned project from `https://github.com/ibadsixx/tone-your-social-voice`
- Moved project to `/workspaces/codespaces-blank/tone-your-social-voice/`
- Reviewed the codebase (see review in conversation history)

### Routing fix — prevent white page on URL change

**Problem:** Clicking a conversation navigated to `/messages/:id` via a separate React Router route, which unmounted the `<Messages />` component, lost all hook state, and caused a white page.

**Fix:** Replaced the two-route setup (`messages` + `messages/:conversationId`) with a single **splat route** `messages/*` that keeps `<Messages />` mounted for all `/messages/...` paths. The conversation ID is read from `useParams()['*']`.

**Files:**
- `src/App.tsx` — route changed to `<Route path="messages/*" element={<Messages />} />`; removed ConversationPage import and route
- `src/pages/Messages.tsx` — added `useParams` to read URL path, `useEffect` to restore conversation on mount/refresh, `navigate()` in click handlers to update URL without remount

### Online/offline presence (green/gray dot + last seen)

Adds online/offline indicators to conversation list avatars and chat window headers.

**New files:**
- `supabase/migrations/20260524000000_add_last_seen_to_profiles.sql` — adds `last_seen_at` column to `profiles` table, creates `update_last_seen()` RPC
- `src/hooks/usePresence.ts` — `usePresence(userId)` pings `update_last_seen` every 60s; `isOnline()` returns true if last seen < 2 min ago; `formatLastSeen()` returns human-readable duration

**Modified files:**
- `src/hooks/useConversations.ts` — added `last_seen_at` to `other_user` type; batch-fetches from `profiles` after conversations load
- `src/components/messages/ConversationList.tsx` — avatar dot is green (online) or gray (offline); shows "Online" or "Last seen 5m ago" below message preview
- `src/components/messages/ChatWindow.tsx` — header replaces static "Online" badge with live dot + status text
- `src/pages/Messages.tsx` — calls `usePresence()` to track the current user's activity

### Voice recording UX fix — immediate start + trash/send layout

**Problem:** Pressing the mic button showed a red "Start Recording" button instead of recording immediately. The cancel button was an X icon, not a trash can, and there was no send button during recording.

**Fix:** Recording starts as soon as the mic button is pressed. The layout is a single horizontal row with trash can (left), recording controls + timer + audio level (center), and send button (right, disabled during recording, active after stop).

**File:**
- `src/components/messages/MessageRecorder.tsx` — complete rewrite: auto-start on mount, redesigned compact layout with trash/pause-stop/send buttons, removed initial start-recording state

### ChatInfoPanel — dynamic online/offline status + dot

**Problem:** The Info panel (opened from the `(i)` button in the chat header) showed a hardcoded "Active 54m ago" and had no online/offline indicator.

**Fix:** Replaced with real status — green dot + "Online" or gray dot + "Last seen X ago" using `isOnline`/`formatLastSeen`. Added `last_seen_at` to the `otherUser` prop type.

**File:**
- `src/components/messages/ChatInfoPanel.tsx` — wired up presence hook, replaced hardcoded status with dynamic dot + text

### "Limit interactions" feature — all 12 problems fixed

**Problems #1–#3 (Critical — dual implementations, missing migrations):**

- **#1 — Dual "Limit interactions":** ChatInfoPanel now uses `restricted_users` table (same as BlockButton) instead of calling `onBlock('messaging')`. Has full restriction state checking + un-restrict flow.
- **#2 — Missing `restricted_users` migration:** Created `20260529000000_add_restricted_users_table.sql` — table with FK constraints, unique constraint, RLS policies, indexes.
- **#3 — Missing `block_type` migration:** Created `20260530000000_add_block_type_to_blocks.sql` — adds `block_type` column, updates `is_blocked()` with optional `p_block_type`, recreates `block_user()`.

**Problems #4–#5 (Critical — stale column references):**

- Fixed 3 SQL functions (`can_see_content`, `is_content_hidden`, `get_hidden_profile_ids`) that referenced renamed column `hidden_profile_id` (renamed to `profile_id` in `20260104175001`).
- Migration: `20260531000000_fix_hidden_profile_id_functions.sql`

**Problem #6 (High — dual block systems):**

- Migrated all `blocked_users` consumers to use `blocks` table via `block_user`/`is_blocked` RPCs:
  - `useFriendsList.ts`, `useMessageRequests.ts`, `useMessagingSystem.ts` (2 locations), `PrivacyCheckup.tsx`
- Migration: `20260601000000_drop_blocked_users_table.sql` — backfills data + drops `blocked_users` table.

**Problem #7 (High — RLS on restricted_users):**

- Already fixed by `20260529000000_add_restricted_users_table.sql` (SELECT/INSERT/DELETE policies, all scoped to `auth.uid() = user_id`).

**Problem #8 (High — useContentFiltering ignores restricted_users):**

- `useContentFiltering.ts` now fetches `restricted_user_id` from `restricted_users` table, exposes `restrictedUserIds` and `isUserRestricted()`.

**Problem #9 (High — is_blocked() doesn't differentiate block_type):**

- Profiles/posts RLS updated in `20260530000000` to use `is_blocked(..., 'full')`.
- Stories/friends/followers RLS updated in `20260602000000_fix_remaining_rls_block_types.sql`.

**Problem #10–#11 (Medium — ChatInfoPanel restriction UX):**

- Fixed alongside #1: ChatInfoPanel checks restriction state on mount, shows "Remove restriction" when active, and offers un-restrict flow.

**Problem #12 (Medium — muted users in content filtering):**

- `useContentFiltering.ts` now fetches `muted_user_id` from `muted_users` table, exposes `mutedUserIds` and `isUserMuted()`, filters muted content in `shouldShowContent()`.

**Files:**
- `supabase/migrations/20260529000000_add_restricted_users_table.sql` — `restricted_users` table + RLS
- `supabase/migrations/20260530000000_add_block_type_to_blocks.sql` — `block_type` column, updated functions + RLS
- `supabase/migrations/20260531000000_fix_hidden_profile_id_functions.sql` — fix 3 stale functions
- `supabase/migrations/20260601000000_drop_blocked_users_table.sql` — backfill + drop `blocked_users`
- `supabase/migrations/20260602000000_fix_remaining_rls_block_types.sql` — stories/friends/followers RLS
- `src/hooks/useContentFiltering.ts` — added `restrictedUserIds` + `mutedUserIds`
- `src/hooks/useFriendsList.ts` — `blocked_users` → `block_user` RPC
- `src/hooks/useMessageRequests.ts` — `blocked_users` → `block_user` RPC
- `src/hooks/useMessagingSystem.ts` — `blocked_users` → `is_blocked`/`block_user` RPCs
- `src/components/PrivacyCheckup.tsx` — removed `blocked_users` usage
- `src/components/reels/ReelReportModal.tsx` — fixed stale comment
- `check-encryption-property.md` — updated with E2EE architecture section
- `limit-interactions-report.md` — created (all 12 problems documented and resolved)

## 2026-05-24 (push)

- Committed and pushed all changes to `origin/main` (ibadsixx/tone-your-social-voice)
- Saved PAT to `/workspaces/codespaces-blank/pat.txt`

## 2026-05-25

### Vanishing messages UI — Instagram-style vanish mode

**Problem:** The vanishing messages toggle only stored a flag in the DB with no visual feedback. The chat interface looked identical whether vanish was on or off.

**Fix:** When `vanishing_messages_enabled` is toggled on via ChatInfoPanel > Privacy & support, the entire chat interface transforms:
- **Dark gradient background** — `bg-gradient-to-b from-zinc-900 via-zinc-950 to-black` replaces the default light background
- **Vanish Mode banner** — animated slide-in banner at the top with a flame icon, orange gradient, and "Vanish Mode is on — Messages will disappear after 24 hours" message
- **Dark header** — header background and text adjust to the dark theme; avatar gets an orange ring indicator
- **Dark input area** — input textarea, action buttons, and status area switch to dark/zinc colors; send button turns orange
- **Flame indicator on messages** — each message bubble shows a small orange flame icon next to the timestamp
- **Vanish Mode footer** — a centered "Vanish Mode" badge with flame icon and gradient separators appears at the bottom of the input area
- **Smooth transitions** — all changes use `transition-colors duration-500` for a polished feel when toggling
- **Instant revert** — when vanishing messages is disabled, the UI smoothly transitions back to the default theme

**Files:**
- `src/components/messages/ChatWindow.tsx` — added `Flame`, `X` icons; reads `vanishingMessagesEnabled` from `conversationSettings`; renders vanish mode banner; applies dark theme classes to header, messages area, and passes `vanishing`/`isVanishing` props to children
- `src/components/messages/MessageInput.tsx` — added `vanishing` prop; applies dark styling to wrapper, textarea, action buttons, and send button; renders "Vanish Mode" footer divider
- `src/components/messages/MessageBubble.tsx` — added `isVanishing` prop; shows small orange flame icon next to message timestamps

### Vanishing messages — view-based (Instagram-style) deletion

**Problem:** Original implementation used time-based expiry (24h timer), but the user wants messages to disappear after the other party **views them and closes the chat** (like Instagram/Messenger vanish mode).

**Fix:** Replaced the time-based approach with a view-based approach:

- **`vanish_on_read` column** added to `messages` table (set by the `set_message_expires_at` trigger when vanish mode is enabled in a DM)
- **`delete_read_vanish_messages` RPC** — called when the user leaves/closes a conversation. Deletes messages where:
  - `vanish_on_read = true`
  - The other participant has read them (via `message_reads` table)
  - Works for both sent and received messages
- **Trigger restricted to DMs** — only applies to `conversations.type = 'dm'`; group chats are not affected
- **Frontend cleanup** — `ChatWindow` component calls `delete_read_vanish_messages` on unmount via a cleanup effect, so messages vanish when you navigate away
- **Screenshot detection** — listens for `visibilitychange` and `window.blur` events; when the user returns, shows a "Screenshot detected" toast
- **Swipe-up gesture** — touch event handlers on the chat area detect a swipe-up (>80px); toggles vanish mode and shows a confirmation toast

**Behavior summary:**
1. Toggle vanish mode via Privacy & support or swipe-up gesture
2. Messages you send are marked `vanish_on_read = true`
3. When the other person reads them, a `message_reads` entry is created
4. When either person closes the chat, all read vanish-mode messages are permanently deleted
5. If someone switches tabs or apps (potential screenshot), a notification fires
6. The dark vanish UI theme provides visual feedback that the feature is active

**Files:**
- `supabase/migrations/20260525000003_vanish_mode_view_based.sql` — adds `vanish_on_read` column, updates trigger, creates `delete_read_vanish_messages` RPC
- `src/hooks/useConversations.ts` — added `vanish_on_read` to Message type and all select queries
- `src/components/messages/ChatWindow.tsx` — added cleanup effect for vanish deletion on unmount, screenshot detection (visibility/blur listeners), swipe-up gesture handlers, `useToast` integration; passes `vanishingMessagesEnabled` and `toggleVanish` as props to ChatInfoPanel so both share the same settings state
- `src/components/messages/ChatInfoPanel.tsx` — added optional `vanishingMessagesEnabled` and `onToggleVanishingMessages` props; uses them when provided instead of its own `useConversationSettings` instance, ensuring the UI toggle is reflected immediately

### Vanishing messages — fix: messages deleted on toggle (view-based cleanup on disable)

**Problem:** Messages that existed before vanish mode was enabled were being permanently deleted. The auto-cleanup effect (`delete_read_vanish_messages` on ChatWindow unmount) had a stale closure bug and could trigger unpredictably, deleting old messages that should never have been touched (they have `vanish_on_read = FALSE`, but the cleanup was calling the RPC unconditionally in some edge cases).

**Fix:** 
- Removed the unsafe auto-cleanup-on-unmount effect entirely — deletion should never happen automatically on navigation
- Refactored to only delete vanish-mode messages when the user **intentionally disables** vanish mode (matches Instagram behavior):
  - X button on banner
  - Privacy & support toggle
  - Swipe-up gesture
- `delete_read_vanish_messages` RPC only deletes `WHERE vanish_on_read = TRUE`, so old messages (without the flag) are safe regardless
- `handleToggleVanish` wraps `toggleVanish` and calls `delete_read_vanish_messages` only when turning vanish mode **off**

**Files:**
- `src/components/messages/ChatWindow.tsx` — removed cleanup-on-unmount effect + `prevConvIdRef` tracker; added `handleToggleVanish` wrapper that deletes seen vanish messages only on disable; updated swipe-up handler to do the same

### Vanishing messages — backend implementation (time-based fallback)

**Original time-based approach (kept as fallback):** The vanishing messages toggle in ChatInfoPanel > Privacy & support only stored a flag in `conversation_settings` but never actually expired or deleted any messages. The toggle was cosmetic.

**Fix:** Implemented the full pipeline — message expiry is set at insert time, a cron job deletes expired messages every minute, and the frontend filters/removes them in real-time.

**Backend (migrations):**
- `supabase/migrations/20260525000001_add_expires_at_to_messages.sql`:
  - Added `expires_at TIMESTAMP WITH TIME ZONE` column to `messages` table
  - Created `idx_messages_expires_at` partial index (only non-null) for efficient cleanup queries
  - Created `set_message_expires_at()` trigger function: on every INSERT, checks the sender's `conversation_settings` for `vanishing_messages_enabled`; if true, sets `expires_at = NOW() + vanishing_messages_duration` (default 86400s = 24h)
  - Created `set_message_expires_at_trigger` BEFORE INSERT trigger on `messages`
  - Created `delete_expired_messages()` RPC that DELETEs all rows WHERE `expires_at IS NOT NULL AND expires_at < NOW()`, returning the count
- `supabase/migrations/20260525000002_schedule_delete_expired_messages.sql`:
  - Added pg_cron job `delete-expired-messages` running every minute, calling the Edge Function via `net.http_post`

**Backend (Edge Function):**
- `supabase/functions/delete-expired-messages/index.ts`:
  - Calls the `delete_expired_messages` RPC with the service role key
  - Returns `{ success, deletedCount }` 

**Frontend (`useConversations.ts`):**
- Added `expires_at` to the `Message` type
- Added `expires_at` to all `.select()` queries (fetchMessages, sendMessage, real-time subscription)
- Client-side filtering: messages with `expires_at` in the past are filtered out immediately after fetch
- Real-time DELETE handler: when a message is removed by the cleanup function, it's removed from local state instantly
- Real-time INSERT handler: skips adding a message if it's already expired

### "New Message" window — added "Create group chat" and "Create channel" options

**Problem:** The "New Message" dialog (opened via the Edit/pencil button next to "Chats") only offered a user search field. There was no way to start a group conversation or create a channel from within the messaging UI.

**Fix:** Added two clickable option buttons above the search field in the "New Message" dialog:
- **Create group chat** — closes the dialog and navigates to `/groups` (which has full group creation, joining, and management)
- **Create channel** — shows a "Coming Soon" toast since channels are not yet implemented

**Files:**
- `src/components/messages/NewConversationDialog.tsx` — added `useNavigate`, `useToast` imports; added `Users` and `Megaphone` icons; added two option rows above the search input with `handleCreateGroupChat` (navigate to `/groups`) and `handleCreateChannel` (toast placeholder) handlers

### Vanishing messages — removed broken trigger + column, replaced with `vanishing_sent`

**Problem:** The frontend was getting `column messages.expires_at does not exist` errors. The `set_message_expires_at_trigger` referenced an `expires_at` column that didn't exist in the deployed DB (migrations were not fully applied). After removing `expires_at` and `vanish_on_read` from frontend queries, the error persisted because the trigger fires on every INSERT. Also, `delete_read_vanish_messages` RPC referenced `vanish_on_read` which also didn't exist.

**Fix:**
- Dropped the broken `set_message_expires_at_trigger`, `set_message_expires_at()` function, `delete_expired_messages()` RPC, and pg_cron job
- Added `vanishing_sent BOOLEAN NOT NULL DEFAULT FALSE` column on `messages`
- Created `set_vanishing_sent_trigger` (BEFORE INSERT) that checks the sender's `conversation_settings.vanishing_messages_enabled` and sets `vanishing_sent = TRUE` accordingly
- Recreated `delete_read_vanish_messages(p_conversation_id)` RPC that deletes messages WHERE `vanishing_sent = TRUE` AND the other participant has a `message_reads` entry — no longer depends on `vanish_on_read` or `expires_at`
- Fixed banner text from "Messages will disappear after 24 hours" to "Messages disappear after being read"
- Fixed `filteredMessages.length` → `formattedMessages.length` (undefined variable from removed client-side filtering)

**Files:**
- `supabase/migrations/20260525000004_drop_expires_at_trigger.sql` — drops old trigger/functions, adds `vanishing_sent` column + index, creates `set_vanishing_sent` trigger + `delete_read_vanish_messages` RPC
- `src/hooks/useConversations.ts:222` — fixed `filteredMessages` → `formattedMessages`
- `src/components/messages/ChatWindow.tsx:325` — fixed banner text

**Behavior:**
1. Vanish mode is enabled via toggle or swipe-up
2. Messages sent while vanish is on get `vanishing_sent = TRUE` (set by trigger at insert time)
3. When the other participant reads them, a `message_reads` entry is created
4. When any user disables vanish mode, `delete_read_vanish_messages` RPC deletes all read + vanish-sent messages
5. Old messages (sent before vanish was enabled) are never deleted — they have `vanishing_sent = FALSE`

### Messaging system audit — lint fixes & routing analysis

**Audit created:** `/workspaces/codespaces-blank/messaging-system-audit.md` — comprehensive review of all messaging files, hooks, RPCs, and migrations. 17 issues documented across 6 categories (type safety, performance, architecture, error handling, security, linting).

**ESLint cleanup (23 errors, 13 warnings → 0):**
- `useConversations.ts` — replaced all `any` casts with typed interfaces (`ConversationInfoRow`, `MessageRow`, `NewMessagePayload`); wrapped fetch functions in `useCallback`; fixed `useEffect` dependency arrays
- `ChatInfoPanel.tsx` — defined `ParticipantData`, `EncryptionDetails` and `ChatSettingsPanelProps` types; replaced 11 `any` casts
- `MessageRequests.tsx` — typed `request` prop with full inline interface
- `NewConversationDialog.tsx` — typed `friendship` map parameter
- `MessageBubble.tsx`, `MessageInput.tsx`, `MessageRecorder.tsx`, `ChatWindow.tsx`, `ForwardMessageModal.tsx`, `SharedMediaModal.tsx`, `ChatThemeModal.tsx`, `Messages.tsx` — removed `: any` from catch clauses; added eslint-disable comments for stable-dependency warnings (functions from custom hooks that change on every render)
- `ChatThemeModal.tsx` — extracted `THEME_OPTIONS` to `chatThemeOptions.ts` to fix `react-refresh/only-export-components` warning

**Routing analysis (`/messages/:id`):**
- Found D6: no validation of conversation ID from URL — invalid IDs silently show "Select a conversation" placeholder
- Found D7: `params['*']` splat pattern is non-obvious; changing to `messages/:id` + index route causes sibling-route remount issues
- Attempted fix (server-side validation + named param) reverted due to regressions

**Regression (fixed):** `useCallback` wrapping of `loadAudioUrl` in `MessageBubble.tsx` left behind dependency-array syntax (`}, [message.audio_path])` after partial revert, causing a syntax error that crashed the component on render. Reverted to original plain function.

**Files:**
- `src/components/messages/chatThemeOptions.ts` — created (extracted from ChatThemeModal.tsx)
- `src/hooks/useConversations.ts` — typed `any` casts, added `useCallback`, fixed deps
- `src/components/messages/ChatInfoPanel.tsx` — typed `any` casts
- `src/components/messages/MessageRequests.tsx` — typed `any` cast
- `src/components/messages/NewConversationDialog.tsx` — typed `any` cast
- Various messaging files — catch clause cleanup, eslint-disable comments

## 2026-06-04

### Email management — TEXT[] array, set_primary RPC, data corruption fixes

**Problem:** Emails were stored in a separate `user_emails` table but the project doesn't use `public.user_emails`. Using `auth.updateUser()` for "Make primary" triggered unwanted verification emails. The `profiles.email` column was `VARCHAR(255)` so when arrays were written as JSON strings, data became corrupted.

**Fixes:**
- **Migrated `profiles.email` to `TEXT[]`** — `20260603000016_store_emails_as_array.sql`: alters column type, updates `handle_new_user()` to store `ARRAY[new.email]`, creates `resolve_auth_email` RPC for login lookup
- **`set_primary_email` RPC** — `20260603000017_set_primary_email_rpc.sql`: `SECURITY DEFINER` function that directly updates `auth.users.email` (bypassing verification), returns old email so frontend can move it to `profiles.email` array
- **Data corruption fix** — PL/pgSQL block in `20260603000017` iterates all profiles and unpacks JSON-encoded array elements (e.g. `["a","b"]` stored as a single element) into proper `TEXT[]`
- **Frontend `parseEmails()`** — `ProfilesAndPersonalDetails.tsx` handles both native arrays and JSON-string arrays from Supabase
- **`handleSetPrimary`** — calls `set_primary_email` RPC, moves old auth email to `profiles.email`, refreshes auth session so `user?.email` updates immediately
- **"Make primary" UX** — non-primary emails show "Make primary" link + X remove button; "Add" button replaces "Send" in add form; toast confirms change

**Files:**
- `src/components/settings/ProfilesAndPersonalDetails.tsx` — email array read/write, set_primary_email RPC call, session refresh
- `supabase/migrations/20260603000016_store_emails_as_array.sql` — TEXT[] migration
- `supabase/migrations/20260603000017_set_primary_email_rpc.sql` — set_primary_email RPC + data fix

## 2026-06-04 (afternoon)

### Birthday — separate day/month/year selectors, database linking, age validation, sync trigger

**Problem:** The birthday field used a single `<Input type="date">` that was hard to use on mobile. It only saved to `profiles.birthday` but other components (AboutSection, ContactBasicInfoForm) used `birth_date` and `birth_year` columns. No age validation.

**Fixes:**
- **Day/Month/Year selectors** — `ProfilesAndPersonalDetails.tsx` birthday dialog now shows separate Day (`<Select>` 1–31), Month (`<Select>` January–December), and Year (`<Input type="number">`) instead of a single date input
- **Linked to `birth_date` and `birth_year`** — `handleSaveBirthday` now also writes `birth_date` (day+month, year=2000) and `birth_year` (year as integer) columns alongside `birthday`, so the AboutSection and other components see the same birthday
- **18+ age validation** — `isUnder18()` computes exact age from selected date vs today; red warning text appears live below selectors; Save button is disabled while under 18
- **Profile refresh after save** — calls `refetch()` from `useProfile` after saving so the "Personal details" main list updates immediately
- **Database sync trigger** — `20260603000018_sync_birthday_columns.sql`: BEFORE UPDATE trigger on `profiles` that auto-syncs all three columns — when any one of `birthday`/`birth_date`/`birth_year` changes, the trigger recalculates the others, keeping them consistent at the DB level

**Files:**
- `src/components/settings/ProfilesAndPersonalDetails.tsx` — day/month/year selectors, `combineBirthday()`, `isUnder18()`, writes all three columns, `refetch()` on save
- `supabase/migrations/20260603000018_sync_birthday_columns.sql` — trigger to keep `birthday`/`birth_date`/`birth_year` in sync

### Password and Security — Change Password as clickable option + dialog, TOTP preserved

**Problem:** The Password and Security section had the change password form inline and the TOTP 2FA section in the same scroll area, making the page long and cluttered. No separation between the two features.

**Fixes:**
- **Change Password as clickable row** — replaced the inline form with a single clickable `Shield` + "Change Password" row; clicking it opens a `Dialog` with the full password form (current/new/confirm password, visibility toggles, strength validation)
- **TOTP section preserved below** — the Two-Factor Authentication (TOTP) card with setup/verify/disable/enabled flows remains directly below the Change Password row
- **Code cleanup** — removed unused `TOTPData` type, `QRCode` import, and TOTP-only icon imports were pruned then restored

**Files:**
- `src/pages/Settings.tsx` — replaced inline password form with dialog pattern; TOTP card preserved below

### /settings/details route — dedicated URL for Profiles and Personal Details

**Problem:** The "Profiles and personal details" section was only accessible as the default tab inside `/settings` with no dedicated URL, so it couldn't be linked to directly or bookmarked.

**Fixes:**
- **New route** — `<Route path="settings/details" element={<Settings />} />` added in `App.tsx` alongside the existing `/settings` route
- **URL-aware sidebar** — `Settings.tsx` now uses `useLocation`/`useNavigate` from react-router-dom; clicking "Personal details" in the sidebar navigates to `/settings/details`; other sections navigate to `/settings`; the `activeSection` state is derived from the URL path on mount

**Files:**
- `src/App.tsx` — added `settings/details` route
- `src/pages/Settings.tsx` — URL-aware sidebar navigation with `useLocation`/`useNavigate`

### /settings landing page — welcome, notifications, account status

**Problem:** Visiting `/settings` immediately showed the "Profiles and personal details" form with no overview or context. There was no way to see pending setup items, account health, or navigate to other sections from a central hub.

**Fixes:**
- **SettingsLanding component** — new `src/components/settings/SettingsLanding.tsx` renders when visiting `/settings`:
  - "Welcome to your account settings" greeting with description
  - **Notifications card** — lists pending actions (birthday not set, 2FA not enabled, email not verified) with "Go" links to the relevant section
  - **Account status card** — grid showing 2FA status, blocked user count, messaging/posting/commenting status (all "active" by default), and violation count from `profile_reports`
  - **Quick links** — Personal details and Password and Security cards with descriptions and ChevronRight navigation
- **Router update** — `getSectionFromPath('landing')` for `/settings`; sidebar highlights no icon on the landing page

**Files:**
- `src/components/settings/SettingsLanding.tsx` — new settings landing page component
- `src/pages/Settings.tsx` — added `landing` case in `renderContent`, imports `SettingsLanding`

### Layout — hide navbar and contacts on all /settings/* pages

**Problem:** The left sidebar navigation and FloatingIM contacts panel were only hidden on the exact `/settings` path. Navigating to `/settings/details` or `/settings/security` would show them again, wasting space.

**Fix:** Changed all three conditions in `Layout.tsx` from `pathname !== '/settings'` to `!pathname.startsWith('/settings')`:
- Left sidebar hidden, main content margin removed, FloatingIM contacts hidden — all `/settings/*` paths

**Files:**
- `src/components/Layout.tsx` — `startsWith('/settings')` for sidebar, margin, and FloatingIM conditions

### Settings sidebar — gear icon for landing page

**Problem:** The settings sidebar had no button to return to the landing overview; clicking any icon switched away with no way back without navigating manually.

**Fix:** Added `{ id: 'landing', title: 'Settings', icon: SettingsIcon }` as the first item in `sidebarOptions`. Clicking it navigates to `/settings` and becomes highlighted when on the landing page.

**Files:**
- `src/pages/Settings.tsx` — prepended 'landing' with SettingsIcon gear icon to `sidebarOptions`

## 2026-06-05

### Export Your Information — dedicated `/settings/information` route, DB-backed export request form, past exports list

**Problem:** The "Export Your Information" section inside "Your information and permissions" had no dedicated URL and no database backend — the export buttons were frontend-only with no `onClick` handlers.

**Fixes:**
- **`/settings/information` route** — `App.tsx`: added route; `Settings.tsx`: `getSectionFromPath` maps it to `'permissions'` section; sidebar navigates to `/settings/information` on click
- **`export_requests` table** — `20260605000000_add_export_requests.sql`: creates `export_requests` table (`id`, `user_id`, `data_type`, `start_date`, `end_date`, `status`, `created_at`, `updated_at`) with RLS, `create_export_request` RPC (validates auth + date range), and `get_my_export_requests` RPC
- **Download URL + completed_at** — `20260605000001_add_download_url_to_export_requests.sql`: adds `download_url` and `completed_at` columns; updates `get_my_export_requests` RPC to return them
- **Export form** — `YourInformationAndPermissions.tsx`: replaced static option cards with a data type `<Select>`, two `<Calendar>` date pickers (start/end), and a **Request Export** button wired to `create_export_request` RPC with loading spinner + toast feedback
- **Past exports list** — `YourInformationAndPermissions.tsx`: fetches past requests on mount via `get_my_export_requests`, shows a "Previously Requested Exports" card with data type, date, status badge (Pending/Processing/Ready/Failed), and a **Download** button for `ready` exports with a `download_url` link; list refreshes after a new request

**Files:**
- `src/App.tsx` — added `settings/information` route
- `src/pages/Settings.tsx` — `getSectionFromPath` mapping, sidebar navigation
- `src/components/YourInformationAndPermissions.tsx` — export form with data type select, date pickers, Request Export button wired to DB, past exports list with status badges and download links
- `src/integrations/supabase/types.ts` — `create_export_request` and `get_my_export_requests` RPC types
- `supabase/migrations/20260605000000_add_export_requests.sql` — `export_requests` table, RPCs, RLS
- `supabase/migrations/20260605000001_add_download_url_to_export_requests.sql` — `download_url`/`completed_at` columns, updated RPC

### Search History — DB-backed, saved from Search page, remove/clear

**Problem:** The Search History section displayed hardcoded mock entries ("photography tips", "travel destinations", "@john_doe") with non-functional Remove/Clear buttons. No search queries were ever persisted.

**Fixes:**
- **`search_history` table** — `20260605000002_add_search_history.sql`: creates `search_history` table (`id`, `user_id`, `query`, `created_at`) with RLS; RPCs: `add_search_entry`, `get_my_search_history`, `remove_search_entry`, `clear_my_search_history`
- **Search History page** — `YourInformationAndPermissions.tsx`: fetches real entries from `get_my_search_history` on mount; renders query + relative timestamp; Remove button calls `remove_search_entry`; Clear All calls `clear_my_search_history` with loading spinner + toast; shows empty state when no entries
- **Search page saves queries** — `Search.tsx`: calls `add_search_entry` RPC when a result is clicked (mouse) or Enter is pressed (with or without a selected result)

**Files:**
- `src/components/YourInformationAndPermissions.tsx` — wired search history to DB, replaced hardcoded data with real fetch/remove/clear
- `src/pages/Search.tsx` — saves search queries via `add_search_entry` RPC on result click or Enter
- `src/integrations/supabase/types.ts` — `add_search_entry`, `get_my_search_history`, `remove_search_entry`, `clear_my_search_history` RPC types
- `supabase/migrations/20260605000002_add_search_history.sql` — `search_history` table, RPCs, RLS
