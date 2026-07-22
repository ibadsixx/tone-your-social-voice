import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import ReelCard from './ReelCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useHiddenContent } from '@/hooks/useHiddenContent';

interface Reel {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  duration: number;
  music_url: string | null;
  music_source: string | null;
  music_start: number;
  music_video_id: string | null;
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

interface ReelFeedProps {
  initialCursor?: string;
}

const REELS_PER_PAGE = 10;

const ReelFeed = ({ initialCursor }: ReelFeedProps) => {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cursor, setCursor] = useState<string | null>(initialCursor || null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const { toast } = useToast();
  const { shouldShowContent, hideContent, isContentHidden } = useHiddenContent();

  // Filter reels based on hidden content (content_id OR profile_id)
  const filteredReels = useMemo(() => {
    return reels.filter(reel => shouldShowContent(reel.id, reel.user_id));
  }, [reels, shouldShowContent]);

  // Fetch reels
  const fetchReels = useCallback(async (reset = false) => {
    try {
      setLoading(true);

      let query = gateway
        .from('posts')
        .select(`
          id,
          user_id,
          media_url,
          media_type,
          duration,
          music_url,
          music_source,
          music_start,
          music_video_id,
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
        .eq('type', 'reel' as any)
        .eq('status', 'published')
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(REELS_PER_PAGE);

      if (!reset && cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedReels = (data || []).map(reel => ({
        ...reel,
        media_type: reel.media_type as 'image' | 'video',
        likes_count: reel.likes_count || 0,
        comments_count: reel.comments_count || 0,
        profiles: Array.isArray(reel.profiles) ? reel.profiles[0] : reel.profiles
      })) as Reel[];

      if (reset) {
        setReels(formattedReels);
      } else {
        setReels(prev => [...prev, ...formattedReels]);
      }

      setHasMore(formattedReels.length === REELS_PER_PAGE);
      
      if (formattedReels.length > 0) {
        setCursor(formattedReels[formattedReels.length - 1].created_at);
      }
    } catch (error: any) {
      console.error('Error fetching reels:', error);
      toast({
        title: 'Error',
        description: 'Failed to load reels',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [cursor, toast]);

  // Initial load
  useEffect(() => {
    fetchReels(true);
  }, []);

  // Setup intersection observer for active reel detection
  useEffect(() => {
    if (!containerRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            setActiveIndex(index);

            // Load more when near the end (use filteredReels length)
            if (index >= filteredReels.length - 3 && hasMore && !loading) {
              fetchReels();
            }
          }
        });
      },
      {
        root: null,
        threshold: [0.6],
        rootMargin: '0px'
      }
    );

    const reelElements = containerRef.current.querySelectorAll('[data-reel-item]');
    reelElements.forEach((el) => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [filteredReels.length, hasMore, loading, fetchReels]);

  // Scroll to next reel on video end (optional)
  const handleReelEnd = useCallback((index: number) => {
    if (index < filteredReels.length - 1) {
      const nextElement = containerRef.current?.querySelector(`[data-index="${index + 1}"]`);
      nextElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filteredReels.length]);

  return (
    <div 
      ref={containerRef}
      className="h-screen overflow-y-scroll snap-y snap-mandatory scroll-smooth"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {filteredReels.map((reel, index) => (
        <div
          key={reel.id}
          data-reel-item
          data-index={index}
          className="h-screen snap-start snap-always"
        >
          <ReelCard
            reel={reel}
            isActive={index === activeIndex}
            onDoubleTap={() => {}}
            onHideReel={async () => {
              console.log('[SEE_LESS] Hiding reel:', reel.id, 'owner:', reel.user_id);
              await hideContent(reel.id, 'reel');
            }}
          />
        </div>
      ))}

      {loading && (
        <div className="h-screen snap-start snap-always flex items-center justify-center bg-black">
          <div className="w-full max-w-[600px] aspect-[9/16] rounded-xl overflow-hidden">
            <Skeleton className="w-full h-full bg-gray-800" />
          </div>
        </div>
      )}

      {!loading && filteredReels.length === 0 && (
        <div className="h-screen flex items-center justify-center bg-black">
          <div className="text-center text-white">
            <p className="text-xl mb-2">No reels available</p>
            <p className="text-muted-foreground">Be the first to create one!</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReelFeed;
