import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Loader2,
  Archive,
  EyeOff,
  Globe,
  Users,
  Calendar,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import PageContainer from '@/components/PageContainer';

interface PageArchiveData {
  id: string;
  name: string;
  profile_pic?: string | null;
  archived: boolean;
  created_at?: string;
  follower_count?: number;
}

const PageArchive = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [page, setPage] = useState<PageArchiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!id) return;

    const state = location.state as PageArchiveData | null;
    if (state?.id === id) {
      setPage(state);
      setLoading(false);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, name, profile_pic, archived, created_at')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        setPage({ id, name: 'Page', profile_pic: null, archived: false });
        setLoading(false);
        return;
      }

      const { count } = await supabase
        .from('page_followers')
        .select('*', { count: 'exact', head: true })
        .eq('page_id', id);
      setPage({ ...data, follower_count: count ?? 0 } as PageArchiveData);
      setLoading(false);
    })();
  }, [id, location.state]);

  const handleToggleArchive = async () => {
    if (!page || !user || !id) return;
    setToggling(true);
    const newArchived = !page.archived;
    const { error } = await supabase
      .from('pages')
      .update({ archived: newArchived })
      .eq('id', id);
    setToggling(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setPage({ ...page, archived: newArchived });
    toast({
      title: newArchived ? 'Page archived' : 'Page unarchived',
      description: newArchived ? 'Your page has been archived and is hidden from the public.' : 'Your page has been restored and is visible to everyone again.',
    });
  };

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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Page Archive</h1>
            {page.archived ? (
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30">
                <Archive className="h-3 w-3 mr-1" /> Archived
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Active
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{page.name}</p>
        </div>
      </div>

      <Card className={page.archived ? 'border-amber-500/30 bg-amber-500/5' : ''}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full shrink-0 ${page.archived ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
              {page.archived ? (
                <EyeOff className="h-5 w-5 text-amber-600" />
              ) : (
                <Globe className="h-5 w-5 text-green-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">
                {page.archived ? 'Page is archived' : 'Page is active'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {page.archived
                  ? 'This page is currently archived and hidden from the public. Only page admins can see it. Visitors who try to access it will see a notice that the page is unavailable.'
                  : 'This page is publicly visible. Anyone can view it, follow it, and interact with its content.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Followers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{page.follower_count ?? 0}</p>
          </CardContent>
        </Card>
        {page.created_at && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Created
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground">
                {new Date(page.created_at).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm">
                {page.archived ? 'Unarchive this page?' : 'Archive this page?'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {page.archived
                  ? 'Restoring the page will make it publicly visible again. Followers will be able to see it in their feeds.'
                  : 'Archiving will hide this page from the public. Your followers and posts will be preserved but not visible to others.'}
              </p>
              <Button
                variant={page.archived ? 'default' : 'destructive'}
                className="mt-3"
                onClick={handleToggleArchive}
                disabled={toggling}
              >
                {toggling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Archive className="h-4 w-4 mr-2" />}
                {page.archived ? 'Unarchive page' : 'Archive page'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default PageArchive;
