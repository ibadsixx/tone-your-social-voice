import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, Settings, PlusCircle } from 'lucide-react';
import { Page } from '@/hooks/usePages';
import { motion } from 'framer-motion';

interface PageCardProps {
  page: Page;
  onFollow: (pageId: string) => void;
  onUnfollow: (pageId: string) => void;
  variant?: 'default' | 'owned' | 'following';
  loading?: boolean;
}

// Compact display for list-sized counts: 248 stays "248", 12_500 becomes "12.5K".
// The number is still the real count from the API — only its rendering is brief.
const formatCount = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
};

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

  const followerCount = page.follower_count ?? 0;
  const postCount = page.post_count ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2 }}
      className="h-full"
    >
      <Card className="h-full border-border/50 shadow-sm hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm">
        <CardContent className="flex min-h-[104px] items-center gap-3 p-4">
          {/* The page's actual profile picture (pages.profile_pic) as the card
              thumbnail — never the cover image or the viewer's own avatar. Radix
              keeps the initial as a fallback when the URL is missing or fails to
              load. The picture is itself a link to the detail route. */}
          <Link
            to={`/pages/${page.id}`}
            aria-label={`Open ${page.name}`}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Avatar className="h-14 w-14 border border-border shadow-sm">
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

          <div className="min-w-0 flex-1">
            {/* Name sits immediately beside the thumbnail, with the category in
                parentheses right after it. The whole line truncates as one unit,
                so a long name (or category) can never reflow or overflow the
                compact card, and the name always keeps its space ahead of the
                category. */}
            <h3 className="min-w-0 truncate text-[15px] font-semibold leading-tight text-foreground">
              <Link
                to={`/pages/${page.id}`}
                title={`Open ${page.name}`}
                className="rounded-sm transition-colors cursor-pointer hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {page.name}
              </Link>
              {page.category && (
                <span className="font-normal text-muted-foreground"> ({page.category})</span>
              )}
            </h3>

            {/* Real follower and post counts, derived from page_followers and
                page_posts. */}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {formatCount(followerCount)} {followerCount === 1 ? 'follower' : 'followers'}
              <span className="px-1 text-muted-foreground/60" aria-hidden="true">·</span>
              {formatCount(postCount)} {postCount === 1 ? 'post' : 'posts'}
            </p>
          </div>

          {/* Card actions are siblings of the navigation links, never wrapped by
              them, so following/unfollowing or managing never triggers a
              navigation. */}
          <div className="flex shrink-0 items-center gap-2">
            {variant === 'owned' ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5"
                  onClick={() => navigate(`/pages/${page.id}`)}
                >
                  <Settings className="h-3 w-3" />
                  Manage
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5"
                  onClick={() => navigate(`/pages/${page.id}`)}
                >
                  <PlusCircle className="h-3 w-3" />
                  Post
                </Button>
              </>
            ) : (
              <Button
                variant={page.is_following ? 'secondary' : 'default'}
                size="sm"
                className="h-8 px-2.5"
                onClick={handleFollowClick}
                disabled={isLoading || loading}
              >
                <Heart className={`h-3 w-3 ${page.is_following ? 'fill-current' : ''}`} />
                {page.is_following ? 'Following' : 'Follow'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
