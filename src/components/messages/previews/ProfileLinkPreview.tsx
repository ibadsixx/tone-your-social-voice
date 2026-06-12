import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { User } from 'lucide-react';

interface ProfileData {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  bio: string | null;
}

interface ProfileLinkPreviewProps {
  username: string;
}

export const ProfileLinkPreview = ({ username }: ProfileLinkPreviewProps) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, profile_pic, bio')
          .eq('username', username)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
        } else {
          setProfile(data);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, [username]);

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

  if (notFound || !profile) {
    return (
      <Card className="mt-2 p-3 border border-dashed border-border/30 bg-background/50">
        <p className="text-xs text-muted-foreground">User not found</p>
      </Card>
    );
  }

  return (
    <Card
      className="mt-2 border border-border/50 bg-background/50 cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={() => navigate(`/profile/${profile.username}`)}
    >
      <div className="p-3 flex items-center gap-3">
        <Avatar className="w-8 h-8">
          <AvatarImage src={profile.profile_pic || undefined} />
          <AvatarFallback>
            {profile.display_name?.charAt(0)?.toUpperCase() || <User className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{profile.display_name}</p>
          <p className="text-xs text-muted-foreground truncate">@{profile.username}</p>
          {profile.bio && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{profile.bio}</p>
          )}
        </div>
      </div>
    </Card>
  );
};
