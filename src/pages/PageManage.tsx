import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowLeft,
  Loader2,
  FileText,
  Users,
  Heart,
  MessageCircle,
  ToggleLeft,
  Archive,
  Hash,
  ChevronRight,
} from 'lucide-react';
import PageContainer from '@/components/PageContainer';

interface PageManageData {
  id: string;
  name: string;
  profile_pic?: string | null;
  description?: string | null;
  category?: string | null;
  created_at?: string;
}

const PageManage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState<PageManageData | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const state = location.state as PageManageData | null;
    if (state?.id === id) {
      setPage(state);
    }

    (async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, name, profile_pic, description, category, created_at')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        setPage(data);
      } else if (!state) {
        setPage({ id, name: 'Page', profile_pic: null });
      }

      const { count: fCount } = await supabase
        .from('page_followers')
        .select('*', { count: 'exact', head: true })
        .eq('page_id', id);
      setFollowerCount(fCount ?? 0);

      const { count: pCount } = await supabase
        .from('page_posts')
        .select('*', { count: 'exact', head: true })
        .eq('page_id', id);
      setPostCount(pCount ?? 0);

      setLoading(false);
    })();
  }, [id, location.state]);

  if (loading) {
    return (
      <PageContainer size="sm">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageContainer>
    );
  }

  if (!page) return null;

  const quickLinks = [
    {
      label: 'Page Status',
      description: 'View page quality and standing',
      icon: ToggleLeft,
      path: `/pages/${page.id}/status`,
    },
    {
      label: 'Archive',
      description: 'Archive or restore this page',
      icon: Archive,
      path: `/pages/${page.id}/archive`,
    },
    {
      label: 'Activity Log',
      description: 'Review posts and page activity',
      icon: Hash,
      path: `/pages/${page.id}/activity-log`,
    },
  ];

  return (
    <PageContainer size="sm" className="space-y-6">
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
          <h1 className="text-xl font-bold">Manage Page</h1>
          <p className="text-sm text-muted-foreground">{page.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              Followers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{followerCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" />
              Posts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{postCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.path}
                onClick={() => navigate(link.path, { state: { id: page.id, name: page.name, profile_pic: page.profile_pic } })}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
              >
                <div className="p-2 rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{link.label}</div>
                  <div className="text-xs text-muted-foreground">{link.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </CardContent>
      </Card>

      {page.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{page.description}</p>
            {page.category && (
              <p className="text-sm text-muted-foreground mt-2">Category: {page.category}</p>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
};

export default PageManage;
