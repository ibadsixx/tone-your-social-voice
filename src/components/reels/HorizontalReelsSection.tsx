import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Film, Play, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useHiddenContent } from '@/hooks/useHiddenContent';

interface Reel {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  duration: number;
  content: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

// Preview-only card - NO PLAYBACK, navigates to fullscreen viewer
const ReelThumbnailCard = ({ reel }: { reel: Reel }) => {
  const navigate = useNavigate();

  // Navigate to fullscreen reel viewer - NO video playback here
  const handleClick = () => {
    console.log('[REELS] Navigating to reel viewer:', reel.id);
    navigate(`/reels/${reel.id}`);
  };

  return (
    <div
      className={cn(
        'relative flex-shrink-0 w-[105px] rounded-lg overflow-hidden cursor-pointer',
        'shadow-sm hover:shadow-md transition-all duration-200',
        'group'
      )}
      style={{ aspectRatio: '9 / 16' }}
      onClick={handleClick}
    >
      {/* Static thumbnail - NO controls, NO playback */}
      {reel.media_type === 'video' ? (
        <video
          src={reel.media_url}
          className="w-full h-full object-cover pointer-events-none"
          muted
          playsInline
          preload="metadata"
          controls={false}
        />
      ) : (
        <img
          src={reel.media_url}
          alt={reel.content || 'Reel'}
          className="w-full h-full object-cover pointer-events-none"
          loading="lazy"
        />
      )}

      {/* Play button overlay - indicates tap to view */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover:bg-black/25 transition-colors">
        <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
          <Play className="w-4 h-4 text-white fill-white ml-0.5" />
        </div>
      </div>

      {/* Gradient overlay for text readability */}
      <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* User Info */}
      <div className="absolute bottom-0 left-0 right-0 p-1.5 pointer-events-none">
        <p className="text-white text-[10px] font-medium truncate drop-shadow-lg leading-tight">
          @{reel.profiles?.username || 'user'}
        </p>
      </div>
    </div>
  );
};

const HorizontalReelsSection = () => {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { shouldShowContent } = useHiddenContent();

  // Filter out hidden reels (by content_id or profile_id)
  const filteredReels = useMemo(() => {
    return reels.filter(reel => shouldShowContent(reel.id, reel.user_id));
  }, [reels, shouldShowContent]);

  // Fetch reels - using media_type = 'video' instead of type = 'reel'
  const fetchReels = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          media_url,
          media_type,
          duration,
          content,
          likes_count,
          comments_count,
          created_at,
          profiles:user_id (
            username,
            display_name,
            profile_pic
          )
        `)
        .eq('status', 'published')
        .eq('media_type', 'video')
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const formattedReels = (data || []).map((reel) => ({
        ...reel,
        media_type: 'video' as const,
        likes_count: reel.likes_count || 0,
        comments_count: reel.comments_count || 0,
        profiles: Array.isArray(reel.profiles) ? reel.profiles[0] : reel.profiles,
      })) as Reel[];

      console.log(
        `[REELS_HORIZONTAL] fetched=${formattedReels.length} reels`
      );

      setReels(formattedReels);
    } catch (error: any) {
      console.error('Error fetching reels:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReels();
  }, [fetchReels]);

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="py-3">
        <div className="flex items-center gap-2 mb-3 px-1">
          <Film className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Reels</h2>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton 
              key={i} 
              className="w-[105px] flex-shrink-0 rounded-lg bg-muted" 
              style={{ aspectRatio: '9 / 16' }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (filteredReels.length === 0) {
    return null;
  }

  return (
    <div className="py-3">
      {/* Section Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <Film className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Reels</h2>
      </div>

      {/* Horizontal Scroll Container */}
      <div className="relative group/scroll">
        <div
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto pb-2 scroll-smooth scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {filteredReels.map((reel) => (
            <ReelThumbnailCard key={reel.id} reel={reel} />
          ))}
        </div>

        {/* Scroll Right Button */}
        {filteredReels.length > 3 && (
          <button
            onClick={scrollRight}
            className={cn(
              'absolute right-0 top-1/2 -translate-y-1/2 z-10',
              'w-7 h-7 rounded-full bg-background/90 shadow border border-border',
              'flex items-center justify-center',
              'opacity-0 group-hover/scroll:opacity-100 transition-opacity duration-200',
              'hover:bg-background'
            )}
          >
            <ChevronRight className="w-3.5 h-3.5 text-foreground" />
          </button>
        )}
      </div>

      {/* Hide scrollbar with CSS */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default HorizontalReelsSection;
