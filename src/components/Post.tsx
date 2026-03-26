import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageCircle, Share2, MoreHorizontal, Send, Trash2, Repeat2, MapPin, Bookmark, Link2, Edit3, BellOff, BellRing, Flag, VolumeX, Play } from 'lucide-react';
import ReactionPicker from '@/components/ReactionPicker';
import ReactionsCounter from '@/components/ReactionsCounter';
import { useReactions } from '@/hooks/useReactions';
import type { ReactionKey } from '@/lib/reactions';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useComments } from '@/hooks/useComments';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useSavedPosts } from '@/hooks/useSavedPosts';
import { useMutedUsers } from '@/hooks/useMutedUsers';
import { usePostNotifications } from '@/hooks/usePostNotifications';
import { supabase } from '@/integrations/supabase/client';
import { SendPostModal } from '@/components/modals/SendPostModal';
import { SharePostModal } from '@/components/modals/SharePostModal';
import { EditPostDialog } from '@/components/EditPostDialog';
import { ReportPostDialog } from '@/components/ReportPostDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { SharedPost } from '@/components/SharedPost';
import { AudienceSummary, type AudienceSelection } from '@/components/AudienceSelector';
import { LocationChip } from '@/components/LocationChip';
import { CommentItem } from '@/components/CommentItem';
import { MentionText } from '@/components/MentionText';

interface PostMedia {
  id: string;
  file_url: string;
  file_type: 'image' | 'video';
}

interface PostProps {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  type: 'normal_post' | 'profile_picture_update' | 'cover_photo_update' | 'shared_post' | 'reel';
  shared_post_id?: string | null;
  audience_type?: string;
  audience_user_ids?: string[];
  audience_excluded_user_ids?: string[];
  audience_list_id?: string;
  feeling_activity_type?: string | null;
  feeling_activity_emoji?: string | null;
  feeling_activity_text?: string | null;
  feeling_activity_target_text?: string | null;
  feeling_activity_target_id?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_provider?: string | null;
  duration?: number | null;
  aspect_ratio?: string | null;
  media_type?: 'video' | 'image' | null;
  music_url?: string | null;
  music_source?: string | null;
  music_start?: number | null;
  music_video_id?: string | null;
  thumbnail?: string | null;
  group_name?: string | null;
  group_id?: string | null;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
  post_media?: PostMedia[];
  shared_post?: {
    id: string;
    content: string | null;
    media_url: string | null;
    type: string;
    created_at: string;
    profiles: {
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
  } | null;
  likes?: { id: string; user_id: string }[];
  comments?: { id: string; content: string; profiles: { display_name: string } }[];
  onLike?: (postId: string) => void;
  isLiked?: boolean;
  likesCount?: number;
  commentsCount?: number;
}

const Post = ({ 
  id,
  user_id,
  content,
  media_url,
  created_at,
  type,
  shared_post_id,
  media_type,
  music_url,
  music_source,
  music_start,
  music_video_id,
  thumbnail,
  audience_type,
  audience_user_ids,
  audience_excluded_user_ids,
  audience_list_id,
  feeling_activity_type,
  feeling_activity_emoji,
  feeling_activity_text,
  feeling_activity_target_text,
  feeling_activity_target_id,
  location_id,
  location_name,
  location_address,
  location_lat,
  location_lng,
  location_provider,
  duration,
  aspect_ratio,
  group_name,
  group_id,
  profiles,
  post_media,
  shared_post,
  likes,
  comments,
  onLike,
  isLiked,
  likesCount,
  commentsCount
}: PostProps) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const { 
    comments: fetchedComments, 
    addComment, 
    addReply,
    editComment,
    deleteComment, 
    toggleReaction,
    loading: commentsLoading, 
    submitting: isSubmittingComment,
    getTopLevelComments,
    getReplies,
    getReplyCount
  } = useComments(id);
  
  const { isSaved, isLoading: isSaveLoading, toggleSave } = useSavedPosts(id);
  const { isMuted, isLoading: isMuteLoading, toggleMute } = useMutedUsers(user_id);
  const { isEnabled: notificationsEnabled, isLoading: isNotifLoading, toggleNotifications } = usePostNotifications(id);
  
  // Reactions hook for Lottie-based reaction system
  const { 
    userReaction, 
    reactionsCount, 
    reactionCounts,
    toggleReaction: togglePostReaction 
  } = useReactions(id, user_id);
  
  const isOwner = user?.id === user_id;
  
  const timeAgo = formatDistanceToNow(new Date(created_at), { addSuffix: true });

  // Convert audience data to AudienceSelection format
  const getAudienceDisplay = (): AudienceSelection | null => {
    if (!audience_type || audience_type === 'public') return null;
    
    return {
      type: audience_type as any,
      userIds: audience_user_ids,
      excludedUserIds: audience_excluded_user_ids,
      customListId: audience_list_id
    };
  };

  const audienceDisplay = getAudienceDisplay();

  const handleSharedPostClick = () => {
    if (shared_post) {
      // Navigate to original post - you can implement this based on your routing
      window.location.href = `/post/${shared_post.id}`;
    }
  };
  
  const handleCommentSubmit = async () => {
    if (!newComment.trim()) return;
    
    const success = await addComment(newComment, user_id);
    if (success) {
      setNewComment('');
    }
  };
  
  const toggleComments = () => {
    setShowComments(!showComments);
  };


  const handleCopyLink = async () => {
    const postUrl = `${window.location.origin}/post/${id}`;
    try {
      await navigator.clipboard.writeText(postUrl);
      toast({
        title: "Link copied",
        description: "Post link copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy link to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleDeletePost = async () => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Post deleted",
        description: "Your post has been deleted successfully",
      });
      setShowDeleteDialog(false);
      // Trigger refresh or remove post from UI
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete post",
        variant: "destructive",
      });
    }
  };

  const handlePostUpdated = () => {
    // Refresh the page or trigger parent refresh
    window.location.reload();
  };

  const getPostTypeAction = () => {
    switch (type) {
      case 'profile_picture_update':
        return 'changed their profile picture';
      case 'cover_photo_update':
        return 'changed their cover photo';
      case 'shared_post':
        return 'shared a post';
      case 'normal_post':
      default:
        return '';
    }
  };

  const postTypeAction = getPostTypeAction();
  
  // Determine file type for legacy media_url fallback
  const getLegacyFileType = (): 'image' | 'video' => {
    // If media_type is explicitly video or type is reel, treat as video
    if (media_type === 'video' || type === 'reel') return 'video';
    // Check URL extension
    if (media_url) {
      const lowerUrl = media_url.toLowerCase();
      if (lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.mov') || lowerUrl.includes('.ogg')) {
        return 'video';
      }
    }
    return 'image';
  };
  
  const mediaToDisplay = post_media && post_media.length > 0 
    ? post_media 
    : (media_url ? [{ id: 'legacy', file_url: media_url, file_type: getLegacyFileType() }] : []);

  // Format feeling/activity display
  const getFeelingDisplay = () => {
    if (!feeling_activity_type || !feeling_activity_emoji || !feeling_activity_text) return null;
    
    const emoji = feeling_activity_emoji;
    const verb = feeling_activity_type === 'feeling' ? 'feeling' :
                 feeling_activity_type === 'listening' ? 'listening to' :
                 feeling_activity_type === 'watching' ? 'watching' :
                 feeling_activity_type === 'reading' ? 'reading' :
                 feeling_activity_type === 'celebrating' ? 'celebrating' :
                 feeling_activity_type === 'traveling' ? 'traveling to' :
                 feeling_activity_type === 'working' ? 'working on' :
                 feeling_activity_type === 'eating' ? 'eating' :
                 feeling_activity_type === 'playing' ? 'playing' :
                 feeling_activity_type;
    
    let display = `${emoji} ${verb} ${feeling_activity_text}`;
    
    if (feeling_activity_target_text) {
      display += ` ${feeling_activity_target_text}`;
    }
    
    return display;
  };

  const feelingDisplay = getFeelingDisplay();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="w-full border-border/50 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link to={`/profile/${profiles.username}`} className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                <Avatar className="h-10 w-10 border-2 border-primary/20">
                  <AvatarImage src={profiles.profile_pic || '/default-avatar.png'} className="object-cover" />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {profiles.display_name?.charAt(0) || profiles.username?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="font-semibold text-sm text-foreground hover:underline">{profiles.display_name}</p>
                    {feelingDisplay && (
                      <span className="text-sm text-muted-foreground">
                        {feeling_activity_target_text && feeling_activity_target_id ? (
                          <button 
                            className="hover:underline cursor-pointer"
                            onClick={() => {
                              // Handle navigation to target - implement based on your routing
                              console.log('Navigate to:', feeling_activity_target_id);
                            }}
                          >
                            {feelingDisplay}
                          </button>
                        ) : (
                          feelingDisplay
                        )}
                      </span>
                    )}
                    {postTypeAction && (
                      <span className="text-sm text-muted-foreground">{postTypeAction}</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <p className="text-muted-foreground text-xs">@{profiles.username} • {timeAgo}</p>
                    {audienceDisplay && (
                      <>
                        <span className="text-muted-foreground text-xs">•</span>
                        <AudienceSummary audience={audienceDisplay} className="text-xs" />
                      </>
                    )}
                  </div>
                  {location_name && (
                    <div className="flex items-center space-x-1 mt-1">
                      <MapPin className="w-3 h-3 text-primary" />
                      <button 
                        className="text-xs text-primary hover:underline cursor-pointer"
                        onClick={() => {
                          // Navigate to location page - implement based on your routing
                          console.log('Navigate to location:', location_name);
                        }}
                      >
                        {location_name}
                      </button>
                      {location_address && location_address !== location_name && (
                        <span className="text-xs text-muted-foreground">• {location_address}</span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={toggleSave} disabled={isSaveLoading}>
                  <Bookmark className="mr-2 h-4 w-4" />
                  <span>{isSaved ? 'Unsave post' : 'Save post'}</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Link2 className="mr-2 h-4 w-4" />
                  <span>Copy link</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={toggleNotifications} disabled={isNotifLoading}>
                  {notificationsEnabled ? (
                    <BellOff className="mr-2 h-4 w-4" />
                  ) : (
                    <BellRing className="mr-2 h-4 w-4" />
                  )}
                  <span>
                    {notificationsEnabled ? 'Turn off notifications' : 'Turn on notifications'}
                  </span>
                </DropdownMenuItem>

                {isOwner && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                      <Edit3 className="mr-2 h-4 w-4" />
                      <span>Edit post</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Delete post</span>
                    </DropdownMenuItem>
                  </>
                )}

                {!isOwner && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={toggleMute} disabled={isMuteLoading}>
                      <VolumeX className="mr-2 h-4 w-4" />
                      <span>{isMuted ? 'Unmute' : 'Mute'} {profiles.display_name}</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={() => setShowReportDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Flag className="mr-2 h-4 w-4" />
                      <span>Report post</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Sharer's content (if any) */}
          {shared_post_id && content && (
            <p className="text-sm leading-relaxed text-foreground">{content}</p>
          )}

          {/* Shared Post */}
          {shared_post_id && (
            <SharedPost 
              sharedPost={shared_post} 
              onClick={handleSharedPostClick}
            />
          )}

          {/* Regular post content (only if not a shared post) */}
          {!shared_post_id && (
            <>
              {content && (
                <p className="text-sm leading-relaxed text-foreground">
                  <MentionText text={content} />
                </p>
              )}
              
              {mediaToDisplay.length > 0 && (
                <div className="space-y-3">
                  {mediaToDisplay.map((media, index) => (
                    <motion.div 
                      key={media.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: index * 0.1 }}
                      className="rounded-lg overflow-hidden bg-muted/20"
                    >
                      {media.file_type === 'image' ? (
                        <img 
                          src={media.file_url} 
                          alt="Post media" 
                          className="w-full h-auto"
                          loading="lazy"
                        />
                      ) : type === 'reel' || (duration && aspect_ratio === '9:16') ? (
                        /* Static Reel Preview - NO playback in feed, click navigates to reel page */
                        <button
                          type="button"
                          className="relative w-full overflow-hidden rounded-lg cursor-pointer group"
                          onClick={() => navigate(`/reels/${id}`)}
                          aria-label="Open reel"
                        >
                          <div className="relative max-w-sm mx-auto w-full aspect-[9/16] bg-muted rounded-xl overflow-hidden">
                            {/* Use video element to show first frame as poster - NO playback */}
                            <video
                              src={media.file_url}
                              className="w-full h-full object-cover pointer-events-none rounded-xl"
                              preload="metadata"
                              muted
                              playsInline
                              tabIndex={-1}
                            />

                            {/* Play overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-foreground/15 group-hover:bg-foreground/20 transition-colors">
                              <div className="w-16 h-16 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <Play className="w-8 h-8 text-foreground ml-1" fill="currentColor" />
                              </div>
                            </div>

                            {/* Reel badge */}
                            <div className="absolute top-3 right-3 px-2 py-1 bg-background/80 backdrop-blur-sm rounded text-foreground text-xs font-medium border border-border">
                              Reel
                            </div>
                          </div>
                        </button>
                      ) : (
                        <video 
                          src={media.file_url} 
                          controls 
                          muted
                          playsInline
                          className="w-full h-auto max-h-96"
                          preload="metadata"
                        >
                          <source src={media.file_url} type={media.file_url.endsWith('.mp4') ? 'video/mp4' : media.file_url.endsWith('.webm') ? 'video/webm' : 'video/quicktime'} />
                          Your browser does not support the video tag.
                        </video>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}
          
          {/* Reactions Counter Row - Facebook style */}
          {reactionsCount > 0 && (
            <div className="flex items-center justify-between py-2.5">
              <ReactionsCounter 
                reactions={reactionCounts}
                totalCount={reactionsCount}
                maxIcons={3}
              />
              <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
                {(fetchedComments?.length || commentsCount || comments?.length || 0) > 0 && (
                  <button 
                    onClick={toggleComments}
                    className="hover:underline"
                  >
                    {fetchedComments?.length || commentsCount || comments?.length || 0} comments
                  </button>
                )}
              </div>
            </div>
          )}
          
          {/* Action Buttons Row */}
          <div className="flex items-center justify-between py-1 border-t border-border/50">
            <ReactionPicker
              isLiked={!!userReaction}
              selectedReaction={userReaction}
              likesCount={0}
              onReact={(reactionKey) => togglePostReaction(reactionKey)}
              onLike={() => togglePostReaction('ok')}
            />
            
            <Button 
              variant="ghost" 
              size="sm" 
              className={`flex items-center space-x-2 transition-colors ${
                showComments ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={toggleComments}
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-xs">Comment</span>
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowSendModal(true)}
            >
              <Send className="h-4 w-4" />
              <span className="text-xs">Send</span>
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowShareModal(true)}
            >
              <Share2 className="h-4 w-4" />
              <span className="text-xs">Share</span>
            </Button>
          </div>
          
          {/* Comments Section */}
          <AnimatePresence>
            {showComments && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="border-t border-border/50 pt-4 mt-4 space-y-4"
              >
                {/* Comments List */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {commentsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="text-sm text-muted-foreground">Loading comments...</div>
                    </div>
                  ) : fetchedComments?.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-4 text-muted-foreground text-sm"
                    >
                      No comments yet. Be the first to comment!
                    </motion.div>
                  ) : (
                    getTopLevelComments().map((comment, index) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        index={index}
                        onEdit={editComment}
                        onDelete={deleteComment}
                        onToggleReaction={toggleReaction}
                        onReply={addReply}
                        replies={getReplies(comment.id)}
                        replyCount={getReplyCount(comment.id)}
                      />
                    ))
                  )}
                </div>
                
                {/* Add Comment Input */}
                {user && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className="flex space-x-3 pt-3 border-t border-border/30"
                  >
                    <Avatar className="h-8 w-8 border border-border/50">
                      <AvatarImage src={profile?.profile_pic || '/default-avatar.png'} className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {profile?.display_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <Textarea
                        placeholder="Write a comment..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="min-h-[60px] resize-none border-border/50 focus:border-primary/50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleCommentSubmit();
                          }
                        }}
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleCommentSubmit}
                          disabled={!newComment.trim() || isSubmittingComment}
                          className="bg-primary hover:bg-primary/90"
                        >
                          {isSubmittingComment ? 'Posting...' : 'Post Comment'}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Send Modal */}
      <SendPostModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        postId={id}
        postContent={content}
      />

      {/* Share Modal */}
      <SharePostModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        postId={id}
        postContent={content}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Your post will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePost} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Post Dialog */}
      <EditPostDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        post={{ id, content: content || '' }}
        onPostUpdated={handlePostUpdated}
      />

      {/* Report Post Dialog */}
      <ReportPostDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        postId={id}
      />
    </motion.div>
  );
};

export default Post;