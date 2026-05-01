import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Heart, Users, Calendar, Settings, Edit, PlusCircle } from 'lucide-react';
import { Page } from '@/hooks/usePages';
import { motion } from 'framer-motion';

interface PageCardProps {
  page: Page;
  onFollow: (pageId: string) => void;
  onUnfollow: (pageId: string) => void;
  variant?: 'default' | 'owned' | 'following';
  loading?: boolean;
}

export const PageCard = ({ page, onFollow, onUnfollow, variant = 'default', loading }: PageCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleFollowClick = async () => {
    setIsLoading(true);
    if (page.is_following) {
      await onUnfollow(page.id);
    } else {
      await onFollow(page.id);
    }
    setIsLoading(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4 }}
      className="h-full"
    >
      <Card className="h-full border-border/50 shadow-sm hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm">
        {/* Cover Image */}
        <div className="relative h-32 bg-gradient-to-br from-primary/10 to-purple-500/10 rounded-t-lg overflow-hidden">
          {page.cover_image ? (
            <img 
              src={page.cover_image} 
              alt={`${page.name} cover`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
                <span className="text-primary font-bold text-lg">
                  {page.name.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          )}
          
          {/* Category Badge */}
          {page.category && (
            <Badge 
              variant="secondary" 
              className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm"
            >
              {page.category}
            </Badge>
          )}
        </div>

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate mb-1">
                {page.name}
              </h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{page.follower_count || 0} followers</span>
                {variant === 'following' && page.followed_at && (
                  <>
                    <span>•</span>
                    <Calendar className="h-3 w-3" />
                    <span>Followed {formatDate(page.followed_at)}</span>
                  </>
                )}
              </div>
              {page.user_role && (
                <Badge variant="outline" className="mt-2 text-xs">
                  {page.user_role}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {page.description && (
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {page.description}
            </p>
          )}

          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Created {formatDate(page.created_at)}
            </div>

            <div className="flex gap-2">
              {variant === 'owned' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => navigate(`/pages/${page.id}`)}
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    Manage
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => navigate(`/pages/${page.id}`)}
                  >
                    <PlusCircle className="h-3 w-3 mr-1" />
                    Post
                  </Button>
                </>
              ) : (
                <Button
                  variant={page.is_following ? "secondary" : "default"}
                  size="sm"
                  onClick={handleFollowClick}
                  disabled={isLoading || loading}
                  className="h-8"
                >
                  <Heart className={`h-3 w-3 mr-1 ${page.is_following ? 'fill-current' : ''}`} />
                  {page.is_following ? 'Following' : 'Follow'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};