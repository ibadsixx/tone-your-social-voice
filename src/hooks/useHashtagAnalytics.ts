import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';

interface HashtagAnalytics {
  id: string;
  tag: string;
  follower_count: number;
  post_count: number;
  posts_last_hour: number;
  posts_last_day: number;
  posts_last_week: number;
  posts_last_month: number;
  posts_last_year: number;
  created_at: string;
}

interface TopContributor {
  user_id: string;
  username: string;
  display_name: string;
  profile_pic: string;
  post_count: number;
}

interface TimeSeriesData {
  date: string;
  count: number;
}

export const useHashtagAnalytics = (tag: string) => {
  const [analytics, setAnalytics] = useState<HashtagAnalytics | null>(null);
  const [topContributors, setTopContributors] = useState<TopContributor[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [relatedHashtags, setRelatedHashtags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!tag) return;

      setLoading(true);
      try {
        // Fetch basic analytics from view
        const { data: analyticsData } = await gateway
          .from('hashtag_analytics' as any)
          .select('*')
          .eq('tag', tag.toLowerCase())
          .single();

        if (analyticsData) {
          setAnalytics(analyticsData as any);

          // Fetch top contributors
          const { data: links } = await gateway
            .from('hashtag_links' as any)
            .select(`
              source_id,
              posts!inner(
                user_id,
                profiles:user_id(id, username, display_name, profile_pic)
              )
            `)
            .eq('hashtag_id', (analyticsData as any).id)
            .eq('source_type', 'post');

          if (links) {
            const contributorMap = new Map<string, any>();
            (links as any[]).forEach((link: any) => {
              if (link.posts?.profiles) {
                const userId = link.posts.profiles.id;
                if (contributorMap.has(userId)) {
                  contributorMap.get(userId).post_count++;
                } else {
                  contributorMap.set(userId, {
                    user_id: userId,
                    username: link.posts.profiles.username,
                    display_name: link.posts.profiles.display_name,
                    profile_pic: link.posts.profiles.profile_pic,
                    post_count: 1,
                  });
                }
              }
            });

            const contributors = Array.from(contributorMap.values())
              .sort((a, b) => b.post_count - a.post_count)
              .slice(0, 5);
            setTopContributors(contributors);
          }

          // Fetch time series data for the last 30 days
          const { data: timeData } = await gateway
            .from('hashtag_links' as any)
            .select('created_at')
            .eq('hashtag_id', (analyticsData as any).id)
            .eq('source_type', 'post')
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

          if (timeData) {
            const dateMap = new Map<string, number>();
            (timeData as any[]).forEach((item: any) => {
              const date = new Date(item.created_at).toISOString().split('T')[0];
              dateMap.set(date, (dateMap.get(date) || 0) + 1);
            });

            const series = Array.from(dateMap.entries())
              .map(([date, count]) => ({ date, count }))
              .sort((a, b) => a.date.localeCompare(b.date));
            setTimeSeriesData(series);
          }

          // Fetch related hashtags (co-occurring hashtags)
          const { data: relatedData } = await gateway
            .from('hashtag_links' as any)
            .select('source_id')
            .eq('hashtag_id', (analyticsData as any).id)
            .eq('source_type', 'post')
            .limit(100);

          if (relatedData && (relatedData as any[]).length > 0) {
            const postIds = (relatedData as any[]).map((r: any) => r.source_id);
            
            const { data: coOccurring } = await gateway
              .from('hashtag_links' as any)
              .select(`
                hashtag_id,
                hashtags!inner(tag)
              `)
              .in('source_id', postIds)
              .neq('hashtag_id', (analyticsData as any).id)
              .eq('source_type', 'post');

            if (coOccurring) {
              const tagCount = new Map<string, number>();
              (coOccurring as any[]).forEach((item: any) => {
                if (item.hashtags?.tag) {
                  const currentCount = tagCount.get(item.hashtags.tag) || 0;
                  tagCount.set(item.hashtags.tag, currentCount + 1);
                }
              });

              const related = Array.from(tagCount.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([tag]) => tag);
              setRelatedHashtags(related);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching hashtag analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [tag]);

  return { analytics, topContributors, timeSeriesData, relatedHashtags, loading };
};
