import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Settings, PlusCircle, UserPlus } from 'lucide-react';
import { Page } from '@/hooks/usePages';

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

/**
 * A page rendered as a person's profile card.
 *
 * The Pages listing reuses the exact row that personal profile lists use
 * (`FriendsTab`'s friend row, `FriendRequestsPage`, the message-request cards):
 * a `h-12 w-12` circular avatar, a `font-semibold` name with a
 * `text-sm text-muted-foreground` secondary line, and a `size="sm"` action
 * button, all inside a shared `Card`/`CardContent p-0` list. This is a
 * page-specific adapter around that design — the personal profile cards
 * themselves are not modified.
 *
 * The differences are only what a public page needs: the secondary line carries
 * the category and the real follower/post counts instead of `@username`, and the
 * card links to `/pages/:id` rather than `/profile/:username`.
 */
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
    <div className="flex items-center justify-between p-4 border-b border-border/50 last:border-b-0">
      <div className="flex min-w-0 items-center space-x-3">
        {/* The page's actual profile picture (pages.profile_pic) as the row
            thumbnail — never the cover image or the viewer's own avatar. Radix
            keeps the initial as a fallback when the URL is missing or fails to
            load. The picture is itself a link to the detail route. */}
        <Link
          to={`/pages/${page.id}`}
          aria-label={`Open ${page.name}`}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar className="h-12 w-12">
            {page.profile_pic ? (
              <AvatarImage
                src={page.profile_pic}
                alt={`${page.name} profile`}
                className="object-cover"
              />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {page.name?.charAt(0)?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0">
          {/* Name uses the person card's name typography/placement. */}
          <h3 className="truncate font-semibold text-foreground">
            <Link
              to={`/pages/${page.id}`}
              title={`Open ${page.name}`}
              className="rounded-sm transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {page.name}
            </Link>
          </h3>

          {/* The person card's `@username` line, adapted for a page: category,
              then the real follower and post counts (derived from
              `page_followers` / `page_posts`), in the same muted `text-sm`. */}
          <p className="truncate text-sm text-muted-foreground">
            {page.category && <span>({page.category})</span>}
            {page.category && <span aria-hidden="true" className="px-1">·</span>}
            {formatCount(followerCount)} {followerCount === 1 ? 'follower' : 'followers'}
            <span aria-hidden="true" className="px-1">·</span>
            {formatCount(postCount)} {postCount === 1 ? 'post' : 'posts'}
          </p>
        </div>
      </div>

      {/* Actions mirror the person card's `size="sm"` buttons. They are siblings
          of the navigation links, never wrapped by them, so following/unfollowing
          or managing never triggers a navigation. */}
      <div className="flex shrink-0 items-center gap-2">
        {variant === 'owned' ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/pages/${page.id}`)}
            >
              <Settings className="h-4 w-4 mr-2" />
              Manage
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/pages/${page.id}`)}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Post
            </Button>
          </>
        ) : (
          <Button
            variant={page.is_following ? 'outline' : 'default'}
            size="sm"
            onClick={handleFollowClick}
            disabled={isLoading || loading}
          >
            {!page.is_following && <UserPlus className="h-4 w-4 mr-2" />}
            {page.is_following ? 'Following' : 'Follow'}
          </Button>
        )}
      </div>
    </div>
  );
};
