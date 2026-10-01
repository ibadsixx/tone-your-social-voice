import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { CallProvider } from "@/contexts/CallContext";
import { PageSwitchProvider } from "@/contexts/PageSwitchContext";
import { IncomingCallModal, ActiveCallWindow } from "@/components/calls";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";
import { UnreadBadgeProvider } from "@/hooks/useUnreadConversationCount";
import { OnlineFriendsProvider } from "@/hooks/useOnlineFriends";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import RequireAuth from "@/components/RequireAuth";
import Auth from "@/pages/Auth";
import Profile from "@/pages/Profile";
import ProfilePage from "@/pages/ProfilePage";
import PublicContentPage from "@/pages/PublicContentPage";
import Messages from "@/pages/Messages";

import Search from "@/pages/Search";
import Groups from "@/pages/Groups";
import GroupDetail from "@/pages/GroupDetail";
import Pages from "@/pages/Pages";
import PageDetail from "@/pages/PageDetail";
import PageStatus from "@/pages/PageStatus";
import PageArchive from "@/pages/PageArchive";
import PageActivityLog from "@/pages/PageActivityLog";
import PageManage from "@/pages/PageManage";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import Saved from "@/pages/Saved";
import Mentions from "@/pages/Mentions";
import Hashtag from "@/pages/Hashtag";
import FollowedHashtags from "@/pages/FollowedHashtags";
import HashtagExplorer from "@/pages/HashtagExplorer";
import HashtagAnalytics from "@/pages/HashtagAnalytics";
import Editor from "@/pages/Editor";
import EditPreview from "@/pages/EditPreview";
import EditorPublish from "@/pages/EditorPublish";
import ReelViewer from "@/pages/ReelViewer";
import MediaViewer from "@/pages/MediaViewer";
import CreatePost from "@/pages/CreatePost";
import FeedbackPage from "@/pages/FeedbackPage";
import FriendRequestsPage from "@/pages/FriendRequestsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import StoryEditor from "@/pages/StoryEditor";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        {/* Presence is a property of the SESSION, not of a route (do.md). This
            used to be mounted inside pages/Messages.tsx, so navigating to Home
            or any other screen silently stopped the heartbeat and the user aged
            out of everyone else's green dot while still signed in. Mounted here,
            above the router, exactly once, and it renders nothing. */}
        <PresenceHeartbeat />
        {/* The unread Messages badge is a property of the SESSION, not of a
            route: it must stay alive (and keep the shared message realtime
            subscription alive) while the user is on Home, Profile, Groups,
            Search or Settings, and it must clear when they log out. Mounted
            here, above the router, exactly once; renders nothing itself, feeds
            the Messages icons in Layout and MobileNav. */}
        <UnreadBadgeProvider>
        {/* "A friend of mine is online" is also a property of the SESSION, not of a
            route: the dot on the mobile Messages icon has to be right on Home,
            Profile, Groups, Search and Settings, not only on the Messages page, and
            it has to clear on sign-out and when accounts change. Mounted here,
            alongside the badge, exactly once; renders nothing itself.

            It deliberately adds no subscription: it listens for `presence.updated` on
            the SAME shared ref-counted `user:<myId>` SSE channel the unread badge
            already holds open, and it polls nothing. */}
        <OnlineFriendsProvider>
        <CallProvider>
          <PageSwitchProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            {/* Global call UI components */}
            <IncomingCallModal />
            <ActiveCallWindow />
            <Routes>
              <Route path="/auth" element={<ErrorBoundary><Auth /></ErrorBoundary>} />
              {/* Fullscreen reel viewer - outside Layout for true fullscreen */}
              <Route path="/reels/:id" element={<ReelViewer />} />
              {/* Fullscreen media viewer - media links point at /media/<id> */}
              <Route path="/media/:id" element={<MediaViewer />} />
              {/* Fullscreen story editor */}
              <Route path="/story/create" element={<StoryEditor />} />
              <Route path="/" element={<ErrorBoundary><Layout /></ErrorBoundary>}>
                {/* The Home feed is authentication-required. The guard wraps the
                    page rather than sitting inside it, so Home never mounts for
                    a guest — and mounting is what would start its feed request
                    (do.md §1–§4, §9). Every other route under this shell stays
                    guest-readable, so the public surfaces are unaffected. */}
                <Route index element={<RequireAuth><Home /></RequireAuth>} />
                <Route path="profile" element={<Profile />} />
                <Route path="profile/:username" element={<ProfilePage />} />
                {/* Profile sections are URL-driven (Posts/Photos/Reels/Shared) while
                    the profile shell stays mounted. */}
                <Route path="profile/:username/:section" element={<ProfilePage />} />
                {/* Profile -> About subsections are URL-driven and deep-linkable. */}
                <Route path="profile/:username/about" element={<ProfilePage />} />
                <Route path="profile/:username/about/:aboutSection" element={<ProfilePage />} />
                {/* Public content detail pages. /post/:id, /reel/:id and
                /photo/:id all render the same page component: a Post, Reel and
                Photo are three shapes of one `posts` row, so one renderer is
                what keeps their metadata, schema and 404 behavior identical
                (do.md §7). These routes are deliberately NOT RequireAuth-wrapped
                and ARE on isPublicPath in Layout, so a guest or a crawler
                reaching a public URL directly is never bounced to /auth - the
                Home feed guard is a separate concern (§13). Reachability is
                still decided by the Gateway's audience check: a friends-only
                or Only-Me post returns nothing here and the page 404s. */}
                <Route path="post/:id" element={<PublicContentPage />} />
                <Route path="reel/:id" element={<PublicContentPage />} />
                <Route path="photo/:id" element={<PublicContentPage />} />
                <Route path="messages/*" element={<Messages />} />
                <Route path="search" element={<Search />} />
                <Route path="groups" element={<Groups />} />
                <Route path="groups/:groupId" element={<GroupDetail />} />
                <Route path="pages" element={<Pages />} />
                <Route path="pages/:id" element={<PageDetail />} />
                <Route path="pages/:id/about" element={<PageDetail />} />
                <Route path="pages/:id/about/:section" element={<PageDetail />} />
                <Route path="pages/:id/status" element={<PageStatus />} />
                <Route path="pages/:id/archive" element={<PageArchive />} />
                <Route path="pages/:id/activity-log" element={<PageActivityLog />} />
                <Route path="pages/:id/manage" element={<PageManage />} />
                <Route path="settings" element={<Settings />} />
                <Route path="settings/details" element={<Settings />} />
                <Route path="settings/security" element={<Settings />} />
                <Route path="settings/privacycheckup" element={<Settings />} />
                <Route path="settings/ads" element={<Settings />} />
                <Route path="settings/information/export" element={<Settings />} />
                <Route path="settings/information/access" element={<Settings />} />
                <Route path="settings/information/searchhistory" element={<Settings />} />
                <Route path="settings/information/activity" element={<Settings />} />
                <Route path="settings/information/adpartners" element={<Settings />} />
                <Route path="settings/information/contacts" element={<Settings />} />
                <Route path="settings/information" element={<Settings />} />
                <Route path="settings/activity" element={<Settings />} />
                <Route path="settings/hashtags" element={<Settings />} />
                <Route path="settings/display" element={<Settings />} />
                <Route path="settings/blocked" element={<Settings />} />
                <Route path="saved" element={<Saved />} />
                <Route path="mentions" element={<Mentions />} />
                <Route path="hashtag/:tag" element={<Hashtag />} />
                <Route path="hashtag/:tag/analytics" element={<HashtagAnalytics />} />
                <Route path="hashtags/following" element={<FollowedHashtags />} />
                <Route path="explore/hashtags" element={<HashtagExplorer />} />
                <Route path="edit-preview" element={<EditPreview />} />
                <Route path="editor" element={<Editor />} />
                <Route path="editor/:projectId" element={<Editor />} />
                <Route path="editor/publish" element={<EditorPublish />} />
              </Route>
              <Route path="/404" element={<NotFound />} />
              <Route path="/create/post" element={<CreatePost />} />
              <Route path="/feedback" element={<FeedbackPage />} />
              <Route path="/friends/requests" element={<FriendRequestsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
          </ThemeProvider>
          </PageSwitchProvider>
        </CallProvider>
        </OnlineFriendsProvider>
        </UnreadBadgeProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
