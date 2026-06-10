# Project Review: Tone — Social Network for Mood & Connection

**Project Path:** `/workspaces/codespaces-blank/tone-your-social-voice`

**Purpose:** A full-featured social media platform (Facebook/Instagram-style) focused on mood-based expression and connection, built as a React SPA.

## Tech Stack

- **Frontend:** React 18, TypeScript 5, Vite 5, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions)
- **State Management:** TanStack React Query + React Context (no Redux)
- **Testing:** Playwright (E2E) + Vitest (unit)
- **Deployment:** Vercel + Supabase Cloud

## Key Features

1. **Posts** — text/media with mood/feeling tags, audience controls, scheduling, reactions, comments, mentions, hashtags
2. **Stories** — 24hr ephemeral content with music, polls, questions, stickers, highlights, analytics
3. **Reels** — vertical 9:16 short-form video, double-tap to like, music overlay
4. **Direct Messaging** — E2E encrypted (ECDH + AES-GCM), GIFs, stickers, voice messages, polls, read receipts, typing indicators, vanish mode
5. **Voice/Video Calls** — WebRTC with Google STUN, call history
6. **Groups** — public/private groups with membership roles and posts
7. **Pages** — business/brand profiles with analytics and activity logs
8. **Video Editor** — CapCut-style multi-track editor (video, audio, text, emoji layers), filters, effects, timeline trim/split, undo/redo, autosave
9. **Search** — people, pages, groups with keyboard nav + explore grid
10. **Hashtags** — follow, feed, analytics, notification settings
11. **Settings** — privacy checkup, ad prefs, activity log, blocked users, 2FA, display/accessibility (reduced motion, high contrast, font scaling)

## Architecture

- SPA with React Router (flat routing, ~30+ routes)
- Provider composition: Auth → Call → PageSwitch → Theme → Query → Tooltip
- Custom hooks (~85+) encapsulate all Supabase queries and business logic
- Layout: sticky header + fixed icon sidebar (tooltips) + main content + floating chat windows
- Database: 80+ tables with auto-generated TypeScript types, 223 SQL migrations
- 5 Supabase Edge Functions (geocoding, GIF search, audio transcription, scheduled posts, expired message cleanup)
- All 223 migrations applied via Supabase Management API using access token

## Recent Changes

### FriendRequestsDropdown (`src/components/FriendRequestsDropdown.tsx`)

- **Max 10 requests** — received friend request list capped at 10 items with "Show all N requests" link
- **People you may know** — suggested users section below requests, powered by `usePeopleYouMayKnow` hook calling `get_people_you_may_know` RPC
- **Received/Sent tabs** — tab switcher in dropdown header toggles between incoming and outgoing pending requests
- **Sent requests** — fetches from `friends` table where `requester_id` = current user and `status = 'pending'`, displaying receiver avatar, name, and username
- **Red badge** — unread count badge uses `bg-red-500` (Facebook-style)
- All data fetched directly from Supabase with real-time capable queries

### NotificationsDropdown (`src/components/NotificationsDropdown.tsx`)

- **All notification types** — supports: posts from followed people/pages, group posts, pokes, followed hashtag posts, tags, friend requests, message requests, page/group invitations, group membership acceptances, and security login alerts
- **Lucide icons** — all notification types use Lucide React icon components (no emojis)
- **Smart navigation** — clicking navigates to the relevant page (post, profile, groups, pages, messages, hashtag, security settings)
- **Notification type** — extended `useNotifications` hook with 15+ notification types and additional fields (`group_id`, `page_id`, `hashtag`)
- **Red badge** — unread count badge uses `bg-red-500` (Facebook-style)

### Chat Window & Contacts (`src/components/im/ChatWindowManager.tsx`)

- **Chat bubble with `...`** — replaced the "+" FAB with a `MessageCircle` icon + "..." text
- **Floating contacts list** — clicking the bubble opens a 260px-tick contacts panel (friends + conversation partners) with search, replaces the old new-message search popup
- **Contacts fetched from DB** — friends and conversation participants loaded from Supabase on open
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

### Database Connection

- All 223 migrations applied to Supabase project `ojdhztcetykgvrcwlwen` via Management API with access token
- Frontend connected via anon key in `.env` and `src/integrations/supabase/client.ts`
- Service role key available for server-side migration scripts

### Chats List Filtering (`supabase/migrations/20260610000001_filter_chats_by_relation.sql`)

- Updated `get_conversations_with_info` RPC to filter the Chats list
- DM conversations now only appear when the other party is:
  - An **accepted friend** (`friends.status = 'accepted'`), OR
  - A **follower/following** (`follows` table, either direction), OR
  - A **followed page** (`page_followers`), OR
  - An **accepted message request** (`message_requests.status = 'accepted'`), OR
  - A conversation the **current user has sent messages in**
- Channels and groups are unaffected

## File Tree (top-level)

```
tone-your-social-voice/
├── .env                  — Supabase anon key + URL
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
├── supabase/            — config, 5 edge functions (Deno), 223 migrations
└── src/
    ├── main.tsx, App.tsx, index.css
    ├── components/      — 100+ components (posts, stories, reels, messages, editor, groups, pages, settings, calls, ui/shadcn)
    │   └── FriendRequestsDropdown.tsx — Received/Sent tabs, max 10, people suggestions
    ├── pages/           — 25+ page components
    ├── hooks/           — 80+ custom hooks
    ├── contexts/        — Auth, Call, PageSwitch, HeaderAvatarMenu
    ├── lib/             — crypto, audioEngine, player, utils, reactions
    ├── services/        — webrtc.ts
    ├── integrations/    — Supabase client + DB types
    ├── types/           — editor types, emojiMap, reactions
    └── utils/           — validation, formatting utilities
```

This is a large, ambitious social media application (~100,000+ lines) with production-level features spanning the full social networking stack. It heavily leverages Supabase as a "backend in a box" with no custom API layer.
