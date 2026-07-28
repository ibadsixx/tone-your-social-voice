import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MoreVertical, Pencil, Trash2, Share2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { Comment } from '@/hooks/useComments';
import { CommentReactionPicker } from './CommentReactionPicker';
import { useCommentShare } from '@/hooks/useCommentShare';
import { MentionHashtagText } from './MentionHashtagText';
import { useMentions } from '@/hooks/useMentions';
import MentionAutocomplete from './MentionAutocomplete';
import CommentReactionsCounter from './CommentReactionsCounter';

interface CommentItemProps {
  comment: Comment;
  index: number;
  onEdit: (commentId: string, newContent: string) => Promise<boolean>;
  onDelete: (commentId: string) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onReply?: (parentCommentId: string, content: string, parentOwnerId: string) => Promise<boolean>;
  replies?: Comment[];
  replyCount?: number;
  isReply?: boolean;
}

export const CommentItem = ({ 
  comment, 
  index, 
  onEdit, 
  onDelete, 
  onToggleReaction,
  onReply,
  replies = [],
  replyCount = 0,
  isReply = false
}: CommentItemProps) => {
  const { user } = useAuth();
  const { id: postId } = useParams();
  const { copyLink, shareToFeed, shareViaMessage, isSharing } = useCommentShare();
  const { saveMentions } = useMentions();
  const [isEditing, setIsEditing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [replyContent, setReplyContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  const isOwner = user?.id === comment.user_id;
  const isEdited = comment.updated_at && comment.updated_at !== comment.created_at;

  const handleSaveEdit = async () => {
    if (!editContent.trim() || editContent === comment.content) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    const success = await onEdit(comment.id, editContent);
    setIsSaving(false);

    if (success) {
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(comment.content);
    setIsEditing(false);
  };

  const handleSaveReply = async () => {
    if (!replyContent.trim() || !onReply) return;

    setIsSaving(true);
    const success = await onReply(comment.id, replyContent, comment.user_id);
    setIsSaving(false);

    if (success) {
      // Mentions are saved in useComments.addReply
      setReplyContent('');
      setIsReplying(false);
      setShowReplies(true);
    }
  };

  const handleCancelReply = () => {
    setReplyContent('');
    setIsReplying(false);
  };

  const handleCopyLink = async () => {
    if (postId) {
      await copyLink(comment.id, postId);
      setShareOpen(false);
    }
  };

  const handleShareToFeed = async () => {
    const content = await shareToFeed(comment.id, comment.content);
    if (content) {
      // Here you would typically open a modal or navigate to create post
      // For now, just show success toast
      setShareOpen(false);
    }
  };

  const handleShareViaMessage = async () => {
    const content = await shareViaMessage(comment.id, comment.content);
    if (content) {
      // Here you would typically open message modal
      // For now, just show success toast
      setShareOpen(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="flex space-x-3 group"
    >
      <Link to={`/profile/${comment.profiles?.username || ''}`} className="hover:opacity-80 transition-opacity">
        <Avatar className="h-8 w-8 border border-border/50">
          <AvatarImage 
            src={comment.profiles?.profile_pic || '/default-avatar.png'} 
            className="object-cover" 
          />
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {comment.profiles?.display_name?.charAt(0) || comment.profiles?.username?.charAt(0) || '?'}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <Link 
              to={`/profile/${comment.profiles?.username || ''}`}
              className="font-medium text-sm text-foreground hover:underline hover:opacity-80 transition"
            >
              {comment.profiles?.display_name || 'Unknown'}
            </Link>
            {isOwner && !isEditing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Pencil className="h-3 w-3 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onDelete(comment.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[60px] text-sm"
                disabled={isSaving}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editContent.trim()}
                  className="h-7 text-xs"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground mt-1 break-words">
              <MentionHashtagText text={comment.content} />
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-1 px-1">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            {isEdited && (
              <span className="text-xs text-muted-foreground">(edited)</span>
            )}
            {!isReply && onReply && (
              <>
                <button
                  onClick={() => setIsReplying(!isReplying)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Reply
                </button>
                {replyCount > 0 && (
                  <button
                    onClick={() => setShowReplies(!showReplies)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {showReplies ? 'Hide' : 'Show'} {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                  </button>
                )}
              </>
            )}
            <Popover open={shareOpen} onOpenChange={setShareOpen}>
              <PopoverTrigger asChild>
                <button
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  disabled={isSharing}
                >
                  <Share2 className="h-3 w-3" />
                  Share
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={handleCopyLink}
                    disabled={isSharing}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left"
                  >
                    📋 Copy Link
                  </button>
                  <button
                    onClick={handleShareToFeed}
                    disabled={isSharing}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left"
                  >
                    🔁 Share to Feed
                  </button>
                  <button
                    onClick={handleShareViaMessage}
                    disabled={isSharing}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left"
                  >
                    💬 Share via Message
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Reactions counter on the right */}
          <CommentReactionsCounter reactions={comment.reactions} />
        </div>

        <CommentReactionPicker
          commentId={comment.id}
          reactions={comment.reactions}
          onToggleReaction={onToggleReaction}
        />

        {/* Reply Input */}
        {isReplying && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder={`Reply to ${comment.profiles?.display_name || 'Unknown'}...`}
              className="min-h-[60px] text-sm"
              disabled={isSaving}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveReply}
                disabled={isSaving || !replyContent.trim()}
                className="h-7 text-xs"
              >
                {isSaving ? 'Posting...' : 'Reply'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelReply}
                disabled={isSaving}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Nested Replies */}
        {!isReply && showReplies && replies.length > 0 && (
          <div className="mt-4 space-y-3 ml-6 pl-4 border-l-2 border-border/50">
            {replies.map((reply, idx) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                index={idx}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleReaction={onToggleReaction}
                isReply={true}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
