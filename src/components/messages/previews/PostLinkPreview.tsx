import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { User, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PostData {
  id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  } | null;
}

interface PostLinkPreviewProps {
  postId: string;
}

export const PostLinkPreview = ({ postId }: PostLinkPreviewProps) => {
  const navigate = useNavigate();
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchPost = async () => {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select(`
            id,
            content,
            media_url,
            created_at,
            profiles!posts_user_id_fkey (
              username,
              display_name,
              profile_pic
            )
          `)
          .eq('id', postId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
        } else {
          setPost(data as unknown as PostData);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPost();
    return () => { cancelled = true; };
  }, [postId]);

  if (loading) {
    return (
      <Card className="mt-2 p-3 border border-border/50 bg-background/50 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-muted" />
          <div className="h-3 w-24 bg-muted rounded" />
        </div>
        <div className="h-3 w-48 bg-muted rounded mt-2" />
      </Card>
    );
  }

  if (notFound || !post) {
    return (
      <Card className="mt-2 p-3 border border-dashed border-border/30 bg-background/50">
        <p className="text-xs text-muted-foreground">Post no longer available</p>
      </Card>
    );
  }

  return (
    <Card
      className="mt-2 border border-border/50 bg-background/50 cursor-pointer hover:bg-accent/30 transition-colors overflow-hidden"
      onClick={() => navigate(`/post/${post.id}`)}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Avatar className="w-5 h-5">
            <AvatarImage src={post.profiles?.profile_pic || undefined} />
            <AvatarFallback className="text-[8px]">
              {post.profiles?.display_name?.charAt(0)?.toUpperCase() || <User className="w-2.5 h-2.5" />}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium truncate">{post.profiles?.display_name}</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </span>
        </div>
        {post.content && (
          <p className="text-xs text-muted-foreground line-clamp-2">{post.content}</p>
        )}
        {post.media_url && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>View post</span>
          </div>
        )}
      </div>
    </Card>
  );
};
