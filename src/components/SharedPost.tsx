import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { mediaAppUrl } from '@/lib/mediaUrl';

interface SharedPostData {
  id: string;
  content: string | null;
  media_url: string | null;
  media_type?: 'image' | 'video' | string | null;
  type: string;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

interface SharedPostProps {
  sharedPost: SharedPostData | null;
  onClick?: () => void;
}

export const SharedPost = ({ sharedPost, onClick }: SharedPostProps) => {
  if (!sharedPost) {
    return (
      <Card className="border-2 border-dashed border-muted-foreground/30 bg-muted/20">
        <CardContent className="p-4 text-center">
          <p className="text-muted-foreground">This post is no longer available.</p>
        </CardContent>
      </Card>
    );
  }

  // Determine file type from media_type or URL
  const getFileType = (): 'image' | 'video' => {
    if (sharedPost.media_type === 'video') return 'video';
    if (sharedPost.media_url) {
      const lowerUrl = sharedPost.media_url.toLowerCase();
      if (lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.mov')) {
        return 'video';
      }
    }
    return 'image';
  };

  const fileType = getFileType();

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <Card 
        className="border-2 border-border/50 bg-background/50 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={onClick}
      >
        <CardContent className="p-4">
          {/* Original Author Header */}
          <div className="flex items-center space-x-3 mb-3">
            <Avatar className="w-8 h-8 border border-border/50">
              <AvatarImage src={sharedPost.profiles?.profile_pic || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {sharedPost.profiles?.display_name?.charAt(0)?.toUpperCase() || <User className="w-3 h-3" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm text-foreground">
                {sharedPost.profiles?.display_name || 'Unknown'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(sharedPost.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Original Post Content */}
          {sharedPost.content && (
            <p className="text-sm text-foreground mb-3 leading-relaxed">
              {sharedPost.content}
            </p>
          )}

          {/* Media */}
          {sharedPost.media_url && (
            <div className="mb-3">
              {fileType === 'image' ? (
                <Link
                  to={mediaAppUrl(sharedPost.media_url)}
                  className="block cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Open media"
                >
                  <img
                    src={sharedPost.media_url}
                    alt="Shared post media"
                    className="w-full h-auto rounded-lg border border-border/30"
                  />
                </Link>
              ) : (
                <video
                  src={sharedPost.media_url}
                  controls
                  className="w-full max-h-64 rounded-lg border border-border/30"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
