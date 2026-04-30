import { useState, useEffect } from 'react';
import { ArrowLeft, MessageSquare, CheckCircle, XCircle, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Post from '@/components/Post';

interface GroupYourContentProps {
  groupId: string;
  groupName: string;
  onBack: () => void;
}

const tabs = [
  { key: 'pending', label: 'Pending', icon: MessageSquare },
  { key: 'published', label: 'Published', icon: CheckCircle },
  { key: 'declined', label: 'Declined', icon: XCircle },
  { key: 'removed', label: 'Removed', icon: Trash2 },
] as const;

type TabKey = typeof tabs[number]['key'];

const GroupYourContent = ({ groupId, groupName, onBack }: GroupYourContentProps) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('published');
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    const fetchPosts = async () => {
      if (!user || activeTab !== 'published') {
        setPosts([]);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('group_posts')
          .select(`
            id, message, created_at,
            post:post_id (
              *,
              profiles!posts_user_id_fkey (username, display_name, profile_pic),
              likes (id, user_id),
              comments (id, content, profiles:user_id (display_name))
            )
          `)
          .eq('group_id', groupId)
          .eq('shared_by', user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        console.debug('[GroupYourContent] published posts:', data);
        setPosts((data || []).filter((r: any) => r.post));
      } catch (err) {
        console.error('[GroupYourContent] fetch error:', err);
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, [groupId, user, activeTab]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-xs text-muted-foreground">{groupName} › Your content</p>
          <h1 className="text-xl font-bold">Your content</h1>
          <p className="text-sm text-muted-foreground">
            Manage and view your posts in the group. Admins and moderators may have feedback.
          </p>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 border-r border-border p-2 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content area */}
        <div className="flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
              <div className="text-6xl mb-4">📭</div>
              <p className="text-lg font-semibold text-muted-foreground">No posts to show</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-2xl mx-auto">
              {posts.map((row) => (
                <Post key={row.id} {...row.post} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupYourContent;
