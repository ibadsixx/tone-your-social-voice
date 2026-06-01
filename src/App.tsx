import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CallProvider } from "@/contexts/CallContext";
import { PageSwitchProvider } from "@/contexts/PageSwitchContext";
import { IncomingCallModal, ActiveCallWindow } from "@/components/calls";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import Profile from "@/pages/Profile";
import ProfilePage from "@/pages/ProfilePage";
import PostPage from "@/pages/PostPage";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <CallProvider>
          <PageSwitchProvider>
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
              <Route path="/" element={<ErrorBoundary><Layout /></ErrorBoundary>}>
                <Route index element={<Home />} />
                <Route path="profile" element={<Profile />} />
                <Route path="profile/:username" element={<ProfilePage />} />
                <Route path="post/:id" element={<PostPage />} />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
          </PageSwitchProvider>
        </CallProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
