import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Image,
  Users,
  MessageCircle,
  UserPlus,
  UserMinus,
  Heart,
  Trash2,
  Settings,
  Camera,
  Clock,
  Eye,
  Search,
  Bell,
  Smile
} from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns';

interface UserActivity {
  id: string;
  user_id: string;
  type: string;
  metadata: any;
  created_at: string;
}

interface ActivityGroup {
  date: string;
  label: string;
  activities: UserActivity[];
}

type Section = 'all' | 'posts' | 'comments' | 'likes' | 'pokes' | 'search';

interface SectionTab {
  id: Section;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionTab[] = [
  { id: 'all', label: 'All', icon: <Clock className="h-4 w-4" /> },
  { id: 'posts', label: 'Posts', icon: <FileText className="h-4 w-4" /> },
  { id: 'comments', label: 'Comments', icon: <MessageCircle className="h-4 w-4" /> },
  { id: 'likes', label: 'Likes & Reactions', icon: <Heart className="h-4 w-4" /> },
  { id: 'pokes', label: 'Pokes', icon: <Bell className="h-4 w-4" /> },
  { id: 'search', label: 'Search', icon: <Search className="h-4 w-4" /> },
];

const SECTION_TYPES: Record<Section, string[]> = {
  all: [],
  posts: ['post_created', 'photo_uploaded', 'group_post', 'page_post', 'post_deleted', 'group_deleted', 'page_deleted'],
  comments: ['comment_created', 'comment_deleted'],
  likes: ['like_created', 'reaction_created'],
  pokes: ['poke_created'],
  search: ['search_query'],
};

const YourActivity: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [activeSection, setActiveSection] = useState<Section>('all');
  const limit = 20;

  useEffect(() => {
    if (user) {
      fetchActivities(true);
    }
  }, [user]);

  const filteredActivities = activeSection === 'all'
    ? activities
    : activities.filter(a => SECTION_TYPES[activeSection].includes(a.type));

  const fetchActivities = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }

      const currentOffset = reset ? 0 : offset;

      const { data, error } = await supabase
        .from('user_activity')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + limit - 1);

      if (error) throw error;

      if (reset) {
        setActivities((data || []) as UserActivity[]);
      } else {
        setActivities(prev => [...prev, ...((data || []) as UserActivity[])]);
      }

      setHasMore((data || []).length === limit);
      setOffset(currentOffset + limit);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load activities',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'post_created':
        return <FileText className="h-4 w-4" />;
      case 'photo_uploaded':
        return <Image className="h-4 w-4" />;
      case 'profile_pic_changed':
      case 'cover_pic_changed':
        return <Camera className="h-4 w-4" />;
      case 'group_post':
      case 'group_created':
        return <Users className="h-4 w-4" />;
      case 'page_post':
      case 'page_created':
        return <Settings className="h-4 w-4" />;
      case 'comment_created':
        return <MessageCircle className="h-4 w-4" />;
      case 'friend_request_sent':
        return <UserPlus className="h-4 w-4" />;
      case 'follow':
        return <Heart className="h-4 w-4" />;
      case 'unfollow':
      case 'unfriend':
        return <UserMinus className="h-4 w-4" />;
      case 'post_deleted':
      case 'comment_deleted':
      case 'group_deleted':
      case 'page_deleted':
        return <Trash2 className="h-4 w-4" />;
      case 'like_created':
        return <Heart className="h-4 w-4" />;
      case 'reaction_created':
        return <Smile className="h-4 w-4" />;
      case 'poke_created':
        return <Bell className="h-4 w-4" />;
      case 'search_query':
        return <Search className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getActivityText = (activity: UserActivity): string => {
    const { type, metadata } = activity;

    switch (type) {
      case 'post_created':
        return 'You posted a new status';
      case 'photo_uploaded':
        return 'You uploaded a new photo';
      case 'profile_pic_changed':
        return 'You changed your profile picture';
      case 'cover_pic_changed':
        return 'You changed your cover picture';
      case 'group_post':
        return `You posted in group: ${metadata.group_name || 'Unknown Group'}`;
      case 'page_post':
        return `You posted on page: ${metadata.page_name || 'Unknown Page'}`;
      case 'group_created':
        return `You created a new group: ${metadata.group_name || 'Unnamed Group'}`;
      case 'page_created':
        return `You created a new page: ${metadata.page_name || 'Unnamed Page'}`;
      case 'comment_created':
        return 'You commented on a post';
      case 'ad_created':
        return 'You created a new advertisement';
      case 'post_deleted':
        return 'You deleted a post';
      case 'comment_deleted':
        return 'You deleted a comment';
      case 'group_deleted':
        return `You deleted group: ${metadata.group_name || 'Unknown Group'}`;
      case 'page_deleted':
        return `You deleted page: ${metadata.page_name || 'Unknown Page'}`;
      case 'friend_request_sent':
        return `You sent a friend request to ${metadata.friend_name || 'someone'}`;
      case 'follow':
        return `You followed ${metadata.user_name || 'someone'}`;
      case 'unfollow':
        return `You unfollowed ${metadata.user_name || 'someone'}`;
      case 'unfriend':
        return `You unfriended ${metadata.friend_name || 'someone'}`;
      case 'like_created':
        return 'You liked a post';
      case 'reaction_created':
        return `You reacted with ${metadata.reaction_type || 'like'} to a post`;
      case 'poke_created':
        return `You poked ${metadata.poked_user_name || 'someone'}`;
      case 'search_query':
        return `You searched for "${metadata.query || ''}"`;
      default:
        return 'Activity recorded';
    }
  };

  const getActivityPreview = (activity: UserActivity): string | null => {
    const { type, metadata } = activity;

    if (type === 'post_created' && metadata.content) {
      return metadata.content.length > 100
        ? `${metadata.content.substring(0, 100)}...`
        : metadata.content;
    }

    if (type === 'comment_created' && metadata.comment_content) {
      return metadata.comment_content.length > 80
        ? `${metadata.comment_content.substring(0, 80)}...`
        : metadata.comment_content;
    }

    if (type === 'search_query' && metadata.query) {
      return metadata.query.length > 100
        ? `${metadata.query.substring(0, 100)}...`
        : metadata.query;
    }

    return null;
  };

  const groupActivitiesByDate = (activities: UserActivity[]): ActivityGroup[] => {
    const groups: { [key: string]: ActivityGroup } = {};

    activities.forEach(activity => {
      const date = new Date(activity.created_at);
      let label: string;
      let groupKey: string;

      if (isToday(date)) {
        label = 'Today';
        groupKey = 'today';
      } else if (isYesterday(date)) {
        label = 'Yesterday';
        groupKey = 'yesterday';
      } else if (isThisWeek(date)) {
        label = 'This Week';
        groupKey = 'thisweek';
      } else {
        label = 'Older';
        groupKey = 'older';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          date: groupKey,
          label,
          activities: []
        };
      }

      groups[groupKey].activities.push(activity);
    });

    const order = ['today', 'yesterday', 'thisweek', 'older'];
    return order
      .filter(key => groups[key])
      .map(key => groups[key]);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Your Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-start space-x-3 animate-pulse">
                <div className="w-8 h-8 bg-muted rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupedActivities = groupActivitiesByDate(filteredActivities);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Your Activity
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Track your recent actions and activity across the platform
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5 mb-6">
          {SECTIONS.map(section => {
            const isActive = activeSection === section.id;
            const count = section.id === 'all'
              ? activities.length
              : activities.filter(a => SECTION_TYPES[section.id].includes(a.type)).length;

            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {section.icon}
                <span>{section.label}</span>
                {count > 0 && (
                  <span className={`text-xs ml-0.5 ${isActive ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}`}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {filteredActivities.length === 0 ? (
          <div className="text-center py-8">
            <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Activity Yet</h3>
            <p className="text-muted-foreground">
              {activeSection === 'all'
                ? 'Your activities will appear here as you interact with the platform'
                : `No ${SECTIONS.find(s => s.id === activeSection)?.label.toLowerCase()} activity yet`}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-6">
              {groupedActivities.map((group) => (
                <div key={group.date}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="font-medium">
                      {group.label}
                    </Badge>
                    <Separator className="flex-1" />
                  </div>

                  <div className="space-y-3">
                    {group.activities.map((activity) => {
                      const preview = getActivityPreview(activity);

                      return (
                        <div
                          key={activity.id}
                          className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            {getActivityIcon(activity.type)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {getActivityText(activity)}
                            </p>

                            {preview && (
                              <p className="text-xs text-muted-foreground mt-1 bg-muted/50 rounded p-2">
                                "{preview}"
                              </p>
                            )}

                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {hasMore && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchActivities(false)}
                    disabled={loadingMore}
                    size="sm"
                  >
                    {loadingMore ? 'Loading...' : 'Load More Activities'}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default YourActivity;
