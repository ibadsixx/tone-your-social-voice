import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import Post from './Post';
import ProfilePhotosGrid from './ProfilePhotosGrid';
import { Image, Video, Share2, Grid3X3 } from 'lucide-react';

interface PostData {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type?: 'image' | 'video' | null;
  created_at: string;
  type: 'normal_post' | 'profile_picture_update' | 'cover_photo_update' | 'shared_post' | 'reel';
  shared_post_id?: string | null;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
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
}

interface FilteredPostsLayoutProps {
  posts: PostData[];
  loading: boolean;
  isOwnProfile: boolean;
}

type FilterType = 'all' | 'photos' | 'reels' | 'videos' | 'shared';

const FilteredPostsLayout = ({ posts, loading, isOwnProfile }: FilteredPostsLayoutProps) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const filters = [
    { id: 'all', label: 'All', icon: Grid3X3 },
    { id: 'photos', label: 'Photos', icon: Image },
    { id: 'reels', label: 'Reels', icon: Video },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'shared', label: 'Shared', icon: Share2 },
  ] as const;

  const getFilteredPosts = () => {
    if (activeFilter === 'all') return posts;
    
    return posts.filter(post => {
      switch (activeFilter) {
        case 'reels':
          return post.type === 'reel' || 
                 (post.media_type === 'video' && post.media_url?.includes('reel'));
        case 'videos':
          return post.media_type === 'video' && 
                 post.type !== 'reel' && 
                 !post.media_url?.includes('reel');
        case 'shared':
          return post.type === 'shared_post' || post.shared_post_id;
        default:
          return true;
      }
    });
  };

  const filteredPosts = getFilteredPosts();

  if (loading) {
    return (
      <div className="flex gap-6">
        {/* Sidebar skeleton */}
        <div className="hidden md:block w-64 space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        {/* Mobile tabs skeleton */}
        <div className="md:hidden w-full">
          <div className="flex space-x-2 mb-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-10 flex-1" />
            ))}
          </div>
        </div>
        {/* Posts skeleton */}
        <div className="flex-1 space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 flex-shrink-0">
        <div className="sticky top-20 space-y-1">
          {filters.map(filter => {
            const Icon = filter.icon;
            return (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                  activeFilter === filter.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Tabs */}
      <div className="md:hidden w-full overflow-x-auto">
        <div className="flex space-x-2 pb-4 min-w-max">
          {filters.map(filter => {
            const Icon = filter.icon;
            return (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors",
                  activeFilter === filter.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Posts List / Photos gallery */}
      {activeFilter === 'photos' ? (
        <div className="flex-1">
          <ProfilePhotosGrid posts={posts} loading={loading} />
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          {filteredPosts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">
                  {activeFilter === 'all'
                    ? 'No posts yet'
                    : `No ${activeFilter} found`
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredPosts.map(post => (
              <Post
                key={post.id}
                id={post.id}
                user_id={post.user_id}
                content={post.content}
                media_url={post.media_url}
                media_type={post.media_type}
                created_at={post.created_at}
                type={post.type}
                shared_post_id={post.shared_post_id}
                profiles={post.profiles}
                shared_post={post.shared_post}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FilteredPostsLayout;
