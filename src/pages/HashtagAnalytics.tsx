import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHashtagAnalytics } from '@/hooks/useHashtagAnalytics';
import { Hash, TrendingUp, Users, Clock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import PageContainer from '@/components/PageContainer';

export default function HashtagAnalytics() {
  const { tag } = useParams<{ tag: string }>();
  const { analytics, topContributors, timeSeriesData, relatedHashtags, loading } = useHashtagAnalytics(tag || '');

  if (loading) {
    return (
      <PageContainer size="xl">
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  if (!analytics) {
    return (
      <PageContainer size="xl">
        <div className="text-center py-12">
          <Hash className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">Hashtag not found</h2>
          <p className="text-muted-foreground mb-4">
            The hashtag #{tag} doesn't exist or has no data yet.
          </p>
          <Button asChild>
            <Link to="/explore/hashtags">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Explorer
            </Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2">
              <Link to="/explore/hashtags">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Explorer
              </Link>
            </Button>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Hash className="h-8 w-8" />
              {analytics.tag}
            </h1>
            <p className="text-muted-foreground mt-1">
              Created {new Date(analytics.created_at).toLocaleDateString()}
            </p>
          </div>
          <Button asChild>
            <Link to={`/hashtag/${analytics.tag}`}>View Posts</Link>
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Posts</CardDescription>
              <CardTitle className="text-3xl">{analytics.post_count}</CardTitle>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Followers</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Users className="h-6 w-6" />
                {analytics.follower_count}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Posts Today</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <TrendingUp className="h-6 w-6" />
                {analytics.posts_last_day}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Posts This Week</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Clock className="h-6 w-6" />
                {analytics.posts_last_week}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Time Series Chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Usage Trend (Last 30 Days)</CardTitle>
            <CardDescription>Number of posts per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Top Contributors */}
          <Card>
            <CardHeader>
              <CardTitle>Top Contributors</CardTitle>
              <CardDescription>Users who use this hashtag most</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topContributors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No contributors yet
                  </p>
                ) : (
                  topContributors.map((contributor) => (
                    <Link
                      key={contributor.user_id}
                      to={`/profile/${contributor.username}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={contributor.profile_pic} />
                          <AvatarFallback>{contributor.display_name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{contributor.display_name}</p>
                          <p className="text-sm text-muted-foreground">@{contributor.username}</p>
                        </div>
                      </div>
                      <div className="text-sm font-medium">
                        {contributor.post_count} posts
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Related Hashtags */}
          <Card>
            <CardHeader>
              <CardTitle>Related Hashtags</CardTitle>
              <CardDescription>Often used together with this hashtag</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {relatedHashtags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 w-full">
                    No related hashtags found
                  </p>
                ) : (
                  relatedHashtags.map((relatedTag) => (
                    <Button
                      key={relatedTag}
                      asChild
                      variant="secondary"
                      size="sm"
                    >
                      <Link to={`/hashtag/${relatedTag}`}>
                        #{relatedTag}
                      </Link>
                    </Button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Post Distribution */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Post Distribution</CardTitle>
            <CardDescription>Activity breakdown by time period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Last Hour</span>
                <span className="text-2xl font-bold">{analytics.posts_last_hour}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Last Day</span>
                <span className="text-2xl font-bold">{analytics.posts_last_day}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Last Week</span>
                <span className="text-2xl font-bold">{analytics.posts_last_week}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Last Month</span>
                <span className="text-2xl font-bold">{analytics.posts_last_month}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Last Year</span>
                <span className="text-2xl font-bold">{analytics.posts_last_year}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }
