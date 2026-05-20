import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Loader2,
  FileText,
  User,
  Calendar,
  MessageSquare,
} from 'lucide-react';

interface PageActivityData {
  id: string;
  name: string;
  profile_pic?: string | null;
}

interface ActivityEntry {
  id: string;
  type: 'post';
  message: string | null;
  created_at: string;
  shared_by_name?: string;
  shared_by_pic?: string;
}

const PageActivityLog = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState<PageActivityData | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const state = location.state as PageActivityData | null;
    if (state?.id === id) {
      setPage(state);
    } else {
      (async () => {
        const { data, error } = await supabase
          .from('pages')
          .select('id, name, profile_pic')
          .eq('id', id)
          .maybeSingle();
        if (error || !data) {
          setPage({ id, name: 'Page', profile_pic: null });
        } else {
          setPage(data);
        }
      })();
    }

    (async () => {
      const { data: pagePosts } = await supabase
        .from('page_posts')
        .select(`
          id, message, created_at,
          shared_by,
          post:post_id (content)
        `)
        .eq('page_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      const entries: ActivityEntry[] = (pagePosts || []).map((pp) => ({
        id: pp.id,
        type: 'post' as const,
        message: pp.message || pp.post?.content || null,
        created_at: pp.created_at,
      }));

      const sharerIds = [...new Set((pagePosts || []).map((pp) => pp.shared_by))];
      if (sharerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, username, profile_pic')
          .in('id', sharerIds);
        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
        for (const entry of entries) {
          const pp = pagePosts?.find((p) => p.id === entry.id);
          if (pp) {
            const prof = profileMap.get(pp.shared_by);
            entry.shared_by_name = prof?.display_name || prof?.username || 'Unknown';
            entry.shared_by_pic = prof?.profile_pic || undefined;
          }
        }
      }

      setActivity(entries);
      setLoading(false);
    })();
  }, [id, location.state]);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) {
      const hours = Math.floor(diff / 3600000);
      if (hours === 0) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes}m ago`;
      }
      return `${hours}h ago`;
    }
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!page) return null;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/pages/${page.id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={page.profile_pic || ''} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {page.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Activity Log</h1>
            <Badge variant="outline" className="text-xs">
              {activity.length} {activity.length === 1 ? 'entry' : 'entries'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{page.name}</p>
        </div>
      </div>

      {activity.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No activity yet. Posts published by this page will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activity.map((entry) => (
            <Card key={entry.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-primary/10 shrink-0">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">Published a post</span>
                      <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
                    </div>
                    {entry.message && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{entry.message}</p>
                    )}
                    {entry.shared_by_name && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>by {entry.shared_by_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PageActivityLog;
