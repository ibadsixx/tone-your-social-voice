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
2. **Stories** — 24hr ephemeral content with music, polls, questions, stickers, highlights, analytics; full story editor with text overlays (15 fonts, size/weight/color, shadows, alignment, direction), filters (brightness/contrast/saturation/temperature/blur), music picker (library browser, URL import, trimmer), and drag-to-reposition
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
- Database: 80+ tables with auto-generated TypeScript types, 226 SQL migrations
- 5 Supabase Edge Functions (geocoding, GIF search, audio transcription, scheduled posts, expired message cleanup)
- All 226 migrations applied via Supabase Management API using access token

## Recent Changes

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

- `useAutoUpload()` returns an `upload(files)` function that uploads each file to the `media_backups` Supabase Storage bucket under `{userId}/{timestamp}-{random}.{ext}`
- Records each uploaded file in `media_library` table with `file_url`, `file_type`, `file_size`, `file_name`
- Shows a toast summary on completion
- Wired into `NewPost.tsx` and `MessageInput.tsx` — when `disableAutoUploads` is `false`, calling `handleFileSelect` triggers immediate auto-upload alongside local preview

### Preview Mode Implementation

- **Preview Mode toggle** — Switch in the Encryption chats sub-menu, persisted to `profiles.preview_mode` (boolean, default false)
- **When enabled**, shared links in messages render as rich inline preview cards:
  - **Post previews** (`src/components/messages/previews/PostLinkPreview.tsx`) — detects `/post/:id` URLs, fetches post data from Supabase, renders a card with author avatar, display name, content snippet, and timestamp; clicking navigates to the post
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

### Liked Posts Page (`src/pages/LikedPosts.tsx`, `src/App.tsx`)

- **`/liked` route** — new route mounted in `App.tsx`, renders `LikedPosts` page
- **Liked posts feed** — queries `post_likes` table for the current user's liked post IDs (ordered by most recent like), then loads full post data via `fetchPostsByIds`
- **Empty state** — when no liked posts, shows a "No liked posts yet" message with a `Heart` icon and a "Browse posts" link back to the homepage
- **Navigation** — "Liked posts" entry in the header avatar menu navigates to `/liked`

### Post Card Modularization (`src/components/PostCard.tsx`, `src/hooks/useHomeFeed.ts`)

- **`PostCard` component** — extracted the per-post rendering from `HomeFeed` into a reusable `PostCard` component
- **Props** — accepts full `post` object + `currentUserId`; renders avatar, author info, timestamp, content text, media, action bar (like/comment/share counts + buttons), and comment section
- **`fetchPostsByIds(postIds)`** — new exported helper in `useHomeFeed.ts` that fetches multiple posts by ID with their author profiles, media, likes, and comments in a single batch
- **`PostCard` used in `HomeFeed`** — `HomeFeed` now fetches posts normally and delegates each to `<PostCard>`
- **`PostCard` used in `ProfilePage`** — the profile page's "Posts" tab uses `fetchPostsByIds` and renders via `PostCard`, consistent with the main feed
- **`PostCard` used in `LikedPosts`** — the liked posts page reuses the same component

### Liked Status & Toggle (`src/components/PostCard.tsx`, `src/hooks/useHomeFeed.ts`)

- **`isLiked` state** — each `PostCard` independently tracks whether the post is liked by the current user, initialized by checking `post.user_has_liked` or `post.likes` for the current user's ID
- **`toggleLike` with loading** — clicking the heart button optimistically toggles the UI and calls Supabase (insert into `post_likes` or delete from `post_likes`); if the network call fails, the UI reverts
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
  - **Font weight** — 7 levels: Light (300) through ExtraBold (800)
  - **Style toggles** — italic, underline, alignment (left/center/right)
  - **Color** — 15 preset color swatches + custom `<input type="color">` picker
  - **Remove** — delete button (Trash2 icon) at top-left of canvas when text is selected
  - **Video Audio** — when a video is uploaded, a Mute/Unmute toggle appears in the sidebar (Text tab) with contextual hint; toggles `videoMuted` state persisted in caption JSON
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
- **Modal/popover exclusion** — clicks inside shadcn dialogs and Radix poppers do not trigger collapse
- **`URL.revokeObjectURL` cleanup** on file removal to prevent memory leaks

### Database Connection

- All 226 migrations applied to Supabase project `ojdhztcetykgvrcwlwen` via Management API with access token
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
├── supabase/            — config, 5 edge functions (Deno), 226 migrations
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
