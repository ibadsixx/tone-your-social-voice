import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Users } from 'lucide-react';

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  profile_pic: string | null;
  member_count: number;
}

interface GroupLinkPreviewProps {
  groupId: string;
}

export const GroupLinkPreview = ({ groupId }: GroupLinkPreviewProps) => {
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchGroup = async () => {
      try {
        const { data, error } = await supabase
          .from('groups')
          .select('id, name, description, profile_pic, member_count')
          .eq('id', groupId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
        } else {
          setGroup(data);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchGroup();
    return () => { cancelled = true; };
  }, [groupId]);

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

  if (notFound || !group) {
    return (
      <Card className="mt-2 p-3 border border-dashed border-border/30 bg-background/50">
        <p className="text-xs text-muted-foreground">Group not found</p>
      </Card>
    );
  }

  return (
    <Card
      className="mt-2 border border-border/50 bg-background/50 cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={() => navigate(`/groups/${group.id}`)}
    >
      <div className="p-3 flex items-center gap-3">
        <Avatar className="w-8 h-8">
          <AvatarImage src={group.profile_pic || undefined} />
          <AvatarFallback>
            {group.name?.charAt(0)?.toUpperCase() || <Users className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{group.name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />
            {group.member_count} member{group.member_count !== 1 ? 's' : ''}
          </p>
          {group.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{group.description}</p>
          )}
        </div>
      </div>
    </Card>
  );
};
