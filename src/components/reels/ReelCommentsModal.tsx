import { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useReelInteractions } from '@/hooks/useReelInteractions';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';

interface ReelCommentsModalProps {
  reelId: string;
  isOpen: boolean;
  onClose: () => void;
}

const ReelCommentsModal = ({ reelId, isOpen, onClose }: ReelCommentsModalProps) => {
  const {
    comments,
    commentsCount,
    loading,
    hasMoreComments,
    postComment,
    deleteComment,
    loadMoreComments
  } = useReelInteractions(reelId);

  const { user } = useAuth();
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;

    setSubmitting(true);
    const success = await postComment(commentText);
    if (success) {
      setCommentText('');
    }
    setSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    await deleteComment(commentId);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    
    if (bottom && hasMoreComments && !loading) {
      loadMoreComments();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center md:items-center"
      onClick={onClose}
    >
      <div 
        className="bg-background rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[85vh] md:max-h-[700px] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            Comments {commentsCount > 0 && `(${commentsCount})`}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Comments List */}
        <ScrollArea 
          className="flex-1 p-4" 
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {comments.length === 0 && !loading ? (
            <div className="text-center text-muted-foreground py-8">
              No comments yet. Be the first to comment!
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 group">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={comment.author?.profile_pic || undefined} />
                    <AvatarFallback>
                      {comment.author?.display_name?.[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">
                        {comment.author?.username || 'unknown'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm break-words">{comment.body}</p>
                  </div>

                    {user?.id === comment.author?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={() => handleDelete(comment.id)}
                      aria-label="Delete comment"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}

              {loading && (
                <div className="text-center text-muted-foreground py-4">
                  Loading more comments...
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Comment Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t">
          <div className="flex gap-2">
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback>
                {user?.user_metadata?.display_name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 rounded-full bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={submitting}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!commentText.trim() || submitting}
                className="rounded-full"
                aria-label="Send comment"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReelCommentsModal;
