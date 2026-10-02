import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CommentItem } from '@/components/CommentItem';
import { useComments } from '@/hooks/useComments';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

interface PostCommentsPanelProps {
  postId: string;
  postOwnerId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * The post's comment list, shared by every surface that shows one.
 *
 * This is the same `useComments` hook and the same `CommentItem` component the
 * feed's `Post` renders, so replies, comment reactions, editing and deletion all
 * behave identically — including the notification sent to the author. The reel
 * viewer previously used `ReelCommentsModal`, which read a different table
 * (`reels_comments`), had no replies, no comment reactions and no edit, and
 * created no notification.
 *
 * The list is fetched only while the panel is open. `useComments` loads every
 * comment for the post plus a reaction aggregate per comment, so fetching on
 * mount would be an N+1 on any surface that merely renders a count.
 */
const PostCommentsPanel = ({
  postId,
  postOwnerId,
  open,
  onClose,
}: PostCommentsPanelProps) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [newComment, setNewComment] = useState('');

  const {
    comments,
    addComment,
    addReply,
    editComment,
    deleteComment,
    toggleReaction,
    loading,
    submitting,
    getTopLevelComments,
    getReplies,
    getReplyCount,
  } = useComments(postId, { enabled: open });

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    const success = await addComment(newComment, postOwnerId);
    if (success) setNewComment('');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-neutral-950/95 backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Comments</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Close comments"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="py-4 text-center text-sm text-white/60">Loading comments...</div>
            ) : getTopLevelComments().length === 0 ? (
              <div className="py-4 text-center text-sm text-white/60">
                {user ? 'No comments yet. Be the first to comment!' : 'No comments yet.'}
              </div>
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

          {user && (
            <div className="flex space-x-2 border-t border-white/10 px-4 py-3">
              <Avatar className="h-8 w-8 shrink-0 border border-white/20">
                <AvatarImage src={profile?.profile_pic || '/default-avatar.png'} className="object-cover" />
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {profile?.display_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Textarea
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[40px] resize-none border-white/10 bg-white/5 text-xs text-white placeholder:text-white/40 focus:border-white/30 sm:text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!newComment.trim() || submitting}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {submitting ? 'Posting...' : 'Post Comment'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PostCommentsPanel;
