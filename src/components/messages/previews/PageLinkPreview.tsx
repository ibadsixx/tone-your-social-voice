import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Heart } from 'lucide-react';

interface PageData {
  id: string;
  name: string;
  profile_pic: string | null;
  follower_count: number;
  category: string | null;
}

interface PageLinkPreviewProps {
  pageId: string;
}

export const PageLinkPreview = ({ pageId }: PageLinkPreviewProps) => {
  const navigate = useNavigate();
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchPage = async () => {
      try {
        const { data, error } = await supabase
          .from('pages')
          .select('id, name, profile_pic, follower_count, category')
          .eq('id', pageId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
        } else {
          setPage(data);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPage();
    return () => { cancelled = true; };
  }, [pageId]);

  if (loading) {
    return (
      <Card className="mt-2 p-3 border border-border/50 bg-background/50 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-muted" />
          <div className="flex-1 space-y-1">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-2.5 w-16 bg-muted rounded" />
          </div>
        </div>
      </Card>
    );
  }

  if (notFound || !page) {
    return (
      <Card className="mt-2 p-3 border border-dashed border-border/30 bg-background/50">
        <p className="text-xs text-muted-foreground">Page not found</p>
      </Card>
    );
  }

  return (
    <Card
      className="mt-2 border border-border/50 bg-background/50 cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={() => navigate(`/pages/${page.id}`)}
    >
      <div className="p-3 flex items-center gap-3">
        <Avatar className="w-8 h-8">
          <AvatarImage src={page.profile_pic || undefined} />
          <AvatarFallback>
            {page.name?.charAt(0)?.toUpperCase() || <Heart className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{page.name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Heart className="h-3 w-3" />
            {page.follower_count} follower{page.follower_count !== 1 ? 's' : ''}
          </p>
          {page.category && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{page.category}</p>
          )}
        </div>
      </div>
    </Card>
  );
};
