import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Heart, Users, Calendar, Settings, Edit, PlusCircle, Archive } from 'lucide-react';
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
             loading="lazy" decoding="async" />
          ) : (
            // Neutral cover fallback; the page's identity is carried by the
            // profile-picture thumbnail below rather than a duplicated initial.
            <div className="w-full h-full bg-gradient-to-br from-primary/15 to-purple-500/15" />
          )}
          
          {/* Category Badge */}
          {page.archived && (
            <Badge 
              variant="secondary" 
              className="absolute top-2 left-2 bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30"
            >
              <Archive className="h-3 w-3 mr-1" />
              Archived
            </Badge>
          )}
          {page.category && !page.archived && (
            <Badge 
              variant="secondary" 
              className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm"
            >
              {page.category}
            </Badge>
          )}

          {/* The page's own profile picture (pages.profile_pic), shown as a
              circular thumbnail over the cover — never the cover image or the
              viewer's own avatar. Radix falls back to the initial when the URL
              is missing or fails to load. Wrapped in a link so the picture is
              an equally valid way to open the page's detail route. */}
          <Link
            to={`/pages/${page.id}`}
            aria-label={`Open ${page.name}`}
            className="absolute bottom-3 left-4 block h-16 w-16 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Avatar className="h-16 w-16 border-2 border-background shadow-md">
              {page.profile_pic ? (
                <AvatarImage
                  src={page.profile_pic}
                  alt={`${page.name} profile`}
                  className="object-cover"
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                {page.name?.charAt(0)?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {/* The page name navigates to the existing /pages/:id detail
                  route using the page's real id (same identifier PageDetail
                  reads via useParams and the Manage/Post buttons already use).
                  A real <Link> gives a proper href, pointer cursor, hover
                  state and middle-click/open-in-new-tab; it is a sibling of
                  the Follow/Share buttons, never wrapping them. */}
              <h3 className="font-semibold text-foreground truncate mb-1">
                <Link
                  to={`/pages/${page.id}`}
                  title={`Open ${page.name}`}
                  className="block truncate rounded-sm transition-colors cursor-pointer hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {page.name}
                </Link>
              </h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{page.follower_count ?? 0} followers</span>
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