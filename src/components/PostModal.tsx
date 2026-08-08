import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, MessageCircle, Share, Bookmark, MoreHorizontal, Play, Pause } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { mediaAppUrl } from '@/lib/mediaUrl';

interface PostModalProps {
  post: {
    id: string;
    user_id: string;
    content: string | null;
    media_url: string | null;
    created_at: string;
    type: 'text' | 'image' | 'video' | 'reel';
    profiles: {
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
    likes?: { count: number }[];
    comments?: { count: number }[];
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

const PostModal = ({ post, isOpen, onClose }: PostModalProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  if (!post) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getLikesCount = () => {
    return post.likes?.[0]?.count || 0;
  };

  const getCommentsCount = () => {
    return post.comments?.[0]?.count || 0;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 h-full max-h-[90vh]">
          {/* Media Section */}
          <div className="relative bg-black flex items-center justify-center">
            {post.type === 'video' || post.type === 'reel' ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  src={post.media_url || ''}
                  className="max-w-full max-h-full object-contain"
                  controls={isPlaying}
                  muted
                  playsInline
                  onClick={() => setIsPlaying(!isPlaying)}
                />
                {!isPlaying && (
                  <button
                    onClick={() => setIsPlaying(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
                  >
                    <Play className="h-16 w-16 text-white fill-white" />
                  </button>
                )}
              </div>
            ) : (
              <Link to={mediaAppUrl(post.media_url || '')} aria-label="Open media">
                <img
                  src={post.media_url || ''}
                  alt={post.content || 'Post media'}
                  className="max-w-full max-h-full object-contain"
                />
              </Link>
            )}
          </div>

          {/* Content Section */}
          <div className="flex flex-col h-full max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={post.profiles?.profile_pic || ''} />
                  <AvatarFallback>
                    {post.profiles?.display_name?.charAt(0)?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm">{post.profiles?.display_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">@{post.profiles?.username || 'unknown'}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>

            {/* Comments Section */}
            <ScrollArea className="flex-1 p-4">
              {post.content && (
                <div className="mb-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={post.profiles?.profile_pic || ''} />
                      <AvatarFallback>
                        {post.profiles?.display_name?.charAt(0)?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-semibold mr-2">{post.profiles?.username || 'unknown'}</span>
                        {post.content}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(post.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Placeholder for comments */}
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center py-8">
                  No comments yet. Be the first to comment!
                </p>
              </div>
            </ScrollArea>

            {/* Actions */}
            <div className="border-t">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsLiked(!isLiked)}
                    className="p-0 h-auto"
                  >
                    <Heart className={cn(
                      "h-6 w-6",
                      isLiked ? "fill-red-500 text-red-500" : "text-foreground"
                    )} />
                  </Button>
                  <Button variant="ghost" size="sm" className="p-0 h-auto">
                    <MessageCircle className="h-6 w-6" />
                  </Button>
                  <Button variant="ghost" size="sm" className="p-0 h-auto">
                    <Share className="h-6 w-6" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSaved(!isSaved)}
                  className="p-0 h-auto"
                >
                  <Bookmark className={cn(
                    "h-6 w-6",
                    isSaved ? "fill-foreground" : ""
                  )} />
                </Button>
              </div>
              
              {getLikesCount() > 0 && (
                <div className="px-4 pb-2">
                  <p className="text-sm font-semibold">
                    {getLikesCount().toLocaleString()} likes
                  </p>
                </div>
              )}
              
              <Separator />
              
              {/* Comment Input */}
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground"
                  />
                  <Button variant="ghost" size="sm" className="text-primary text-sm font-semibold">
                    Post
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PostModal;