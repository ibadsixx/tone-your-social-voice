import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import Post from '@/components/Post';
import NewPost from '@/components/NewPost';
import Stories from '@/components/Stories';

import HorizontalReelsSection from '@/components/reels/HorizontalReelsSection';
import { PeopleYouMayKnow } from '@/components/PeopleYouMayKnow';
import PageContainer from '@/components/PageContainer';

const Home = () => {
  const { user } = useAuth();
  const { posts, loading, hasMore, loadMore, createPost, toggleLike } = useHomeFeed();

  const handleCreatePost = async (content: string, media?: File[], taggedUsers?: any[], audience?: any, feeling?: any, scheduledAt?: Date, location?: any, preUploadedMedia?: { url: string; mediaType: 'image' | 'video' }[]) => {
    if (!content.trim() && !media?.length && !preUploadedMedia?.length) return;
    const postId = await createPost(content, media, taggedUsers, audience, feeling, scheduledAt, location, preUploadedMedia);
    return postId;
  };

  const handleLike = (postId: string) => {
    toggleLike(postId);
  };

  const isPostLiked = (post: any) => {
    return post.likes?.some((like: any) => like.user_id === user?.id) || false;
  };

  if (loading && posts.length === 0) {
    return (
      <PageContainer size="sm">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageContainer>
    );
  }

  if (!user) {
    return (
      <PageContainer size="sm" className="space-y-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center py-12"
        >
          <h1 className="text-4xl font-bold bg-tone-gradient bg-clip-text text-transparent mb-4">
            Welcome to Tone
          </h1>
          <p className="text-muted-foreground mb-8">Share your thoughts with the perfect tone</p>
          <Button 
            onClick={() => window.location.href = '/auth'}
            className="bg-tone-gradient text-white border-0 shadow-tone-glow hover:shadow-tone px-8 py-3"
          >
            Get Started
          </Button>
        </motion.div>
      </PageContainer>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Stories Section */}
      <Stories />

      {/* Main Content */}
      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Feed */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <Card className="hidden md:block p-6 bg-card/80 backdrop-blur-sm border-border/50 shadow-tone">
                <NewPost onCreatePost={handleCreatePost} />
              </Card>

              <AnimatePresence>
                {posts.length === 0 && !loading ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                      className="space-y-6"
                  >
                    <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border-border/50 shadow-tone">
                      <div className="w-16 h-16 mx-auto bg-tone-purple/10 rounded-full flex items-center justify-center mb-4">
                        <Sparkles className="w-8 h-8 text-tone-purple" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Welcome to Tone!</h3>
                      <p className="text-muted-foreground">No posts yet. Be the first to share something amazing!</p>
                    </Card>

                      {/* Still show discovery even when the feed is empty */}
                      <PeopleYouMayKnow />
                  </motion.div>
                ) : (
                  <div className="space-y-6">
                    {posts.map((post, index) => (
                      <>
                        <motion.div
                          key={post.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                        >
                          <Post
                            {...post}
                            onLike={handleLike}
                            isLiked={isPostLiked(post)}
                            likesCount={post.likes?.length || 0}
                            commentsCount={post.comments?.length || 0}
                          />
                        </motion.div>
                        {/* Show People You May Know after 3 posts */}
                        {index === 2 && (
                          <motion.div
                            key="people-you-may-know"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.15 }}
                          >
                            <PeopleYouMayKnow />
                          </motion.div>
                        )}
                        {/* Show Reels section after 5 posts */}
                        {index === 4 && (
                          <motion.div
                            key="reels-section"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.25 }}
                          >
                            <Card className="p-4 bg-card/80 backdrop-blur-sm border-border/50 shadow-tone">
                              <HorizontalReelsSection />
                            </Card>
                          </motion.div>
                        )}
                      </>
                    ))}

                      {/* If there are fewer than 3 posts, the inline slot above never renders */}
                      {posts.length > 0 && posts.length < 3 && (
                        <motion.div
                          key="people-you-may-know-fallback"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.15 }}
                        >
                          <PeopleYouMayKnow />
                        </motion.div>
                      )}
                  </div>
                )}
              </AnimatePresence>

              {/* Load More Button */}
              {hasMore && posts.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="flex justify-center pt-6"
                >
                  <Button 
                    variant="outline" 
                    onClick={loadMore}
                    disabled={loading}
                    className="border-border/50 hover:bg-tone-purple hover:text-white transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading more posts...
                      </>
                    ) : (
                      'Load more posts'
                    )}
                  </Button>
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Right Column - Trending Hashtags */}
          <div className="hidden lg:block">
            <div className="sticky top-6">
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
};

export default Home;