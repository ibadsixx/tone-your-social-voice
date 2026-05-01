import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CallProvider } from "@/contexts/CallContext";
import { IncomingCallModal, ActiveCallWindow } from "@/components/calls";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import Profile from "@/pages/Profile";
import ProfilePage from "@/pages/ProfilePage";
import PostPage from "@/pages/PostPage";
import Messages from "@/pages/Messages";
import ConversationPage from "@/pages/ConversationPage";
import Search from "@/pages/Search";
import Groups from "@/pages/Groups";
import GroupDetail from "@/pages/GroupDetail";
import Pages from "@/pages/Pages";
import PageDetail from "@/pages/PageDetail";
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
          <TooltipProvider>
            <Toaster />
            <Sonner />
            {/* Global call UI components */}
            <IncomingCallModal />
            <ActiveCallWindow />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              {/* Fullscreen reel viewer - outside Layout for true fullscreen */}
              <Route path="/reels/:id" element={<ReelViewer />} />
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="profile" element={<Profile />} />
                <Route path="profile/:username" element={<ProfilePage />} />
                <Route path="post/:id" element={<PostPage />} />
                <Route path="messages" element={<Messages />} />
                <Route path="messages/:conversationId" element={<ConversationPage />} />
                <Route path="search" element={<Search />} />
                <Route path="groups" element={<Groups />} />
                <Route path="groups/:groupId" element={<GroupDetail />} />
                <Route path="pages" element={<Pages />} />
                <Route path="pages/:id" element={<PageDetail />} />
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
        </CallProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
