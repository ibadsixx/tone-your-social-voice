import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTrendingHashtags } from '@/hooks/useTrendingHashtags';
import { useHashtagSearch } from '@/hooks/useHashtagSearch';
import { Input } from '@/components/ui/input';
import { Hash, TrendingUp, Clock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PageContainer from '@/components/PageContainer';

export default function HashtagExplorer() {
  const [searchQuery, setSearchQuery] = useState('');
  const { hashtags: trending, loading: trendingLoading } = useTrendingHashtags(20);
  const { results: searchResults, loading: searchLoading } = useHashtagSearch(searchQuery, 20);

  const displayHashtags = searchQuery ? searchResults : trending.map(h => ({ 
    id: h.tag, 
    tag: h.tag, 
    follower_count: 0,
    post_count: h.count 
  }));

  return (
    <PageContainer size="md">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Explore Hashtags</h1>
        <p className="text-muted-foreground">
          Discover trending topics and popular conversations
        </p>
      </div>

        <div className="mb-6">
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for hashtags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs defaultValue="trending" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="trending">
              <TrendingUp className="h-4 w-4 mr-2" />
              Trending
            </TabsTrigger>
            <TabsTrigger value="popular">
              <Users className="h-4 w-4 mr-2" />
              Popular
            </TabsTrigger>
            <TabsTrigger value="recent">
              <Clock className="h-4 w-4 mr-2" />
              Recent
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trending" className="mt-6">
            <HashtagGrid 
              hashtags={displayHashtags} 
              loading={searchQuery ? searchLoading : trendingLoading}
              emptyMessage="No trending hashtags found"
            />
          </TabsContent>

          <TabsContent value="popular" className="mt-6">
            <HashtagGrid 
              hashtags={displayHashtags.sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0))} 
              loading={searchQuery ? searchLoading : trendingLoading}
              emptyMessage="No popular hashtags found"
            />
          </TabsContent>

          <TabsContent value="recent" className="mt-6">
            <HashtagGrid 
              hashtags={displayHashtags} 
              loading={searchQuery ? searchLoading : trendingLoading}
              emptyMessage="No recent hashtags found"
            />
          </TabsContent>
        </Tabs>
      </PageContainer>
    );
  }

interface HashtagGridProps {
  hashtags: Array<{
    id: string;
    tag: string;
    follower_count?: number;
    post_count?: number;
  }>;
  loading: boolean;
  emptyMessage: string;
}

function HashtagGrid({ hashtags, loading, emptyMessage }: HashtagGridProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-24 mt-2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (hashtags.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Hash className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {hashtags.map((hashtag) => (
        <Card key={hashtag.id} className="hover:border-primary transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              <Link to={`/hashtag/${hashtag.tag}`} className="hover:underline">
                {hashtag.tag}
              </Link>
            </CardTitle>
            <CardDescription className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {hashtag.post_count || 0} posts
              </span>
              {hashtag.follower_count !== undefined && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {hashtag.follower_count} followers
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to={`/hashtag/${hashtag.tag}/analytics`}>
                View Analytics
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
