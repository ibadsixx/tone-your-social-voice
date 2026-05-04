import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Camera,
  Loader2,
  Save,
  Users,
  Heart,
  MessageCircle,
  Share2,
  Globe,
  Calendar,
  Tag,
  MoreHorizontal,
  Search,
} from 'lucide-react';
import NewPost from '@/components/NewPost';
import Post from '@/components/Post';
import { useHomeFeed } from '@/hooks/useHomeFeed';

const categories = [
  'Business', 'Entertainment', 'Education', 'Sports', 'Technology',
  'Travel', 'Food & Cooking', 'Fashion', 'Health & Fitness', 'Art & Culture',
  'Music', 'Gaming', 'News & Media', 'Non-profit', 'Community', 'Other'
];

interface PageRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  cover_image: string | null;
  admin_id: string;
  created_at: string;
}

const PageDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState<PageRow | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [activeTab, setActiveTab] = useState('posts');
  const [pagePosts, setPagePosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const { createPost } = useHomeFeed();

  const isAdmin = !!user && page?.admin_id === user.id;

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        toast({ title: 'Error', description: 'Page not found', variant: 'destructive' });
        navigate('/pages');
        return;
      }
      setPage(data as PageRow);
      setName(data.name);
      setDescription(data.description ?? '');
      setCategory(data.category ?? '');

      const { count } = await supabase
        .from('page_followers')
        .select('*', { count: 'exact', head: true })
        .eq('page_id', id);
      setFollowerCount(count ?? 0);
      setLoading(false);
    })();
  }, [id, navigate, toast]);

  const fetchPagePosts = async () => {
    if (!id) return;
    setPostsLoading(true);
    const { data } = await supabase
      .from('page_posts')
      .select(`
        id, message, created_at, shared_by,
        post:post_id (
          *,
          profiles!posts_user_id_fkey (username, display_name, profile_pic),
          likes (id, user_id),
          comments (id, content, profiles:user_id (display_name))
        )
      `)
      .eq('page_id', id)
      .order('created_at', { ascending: false });
    setPagePosts(data || []);
    setPostsLoading(false);
  };

  useEffect(() => {
    if (id) fetchPagePosts();
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      const { data } = await supabase
        .from('page_followers')
        .select('user_id')
        .eq('page_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      setIsFollowing(!!data);
    })();
  }, [id, user]);

  const handlePagePost = async (
    content: string,
    media?: File[],
    taggedUsers?: any[],
    audience?: any,
    feeling?: any,
    scheduledAt?: Date,
    location?: any,
  ) => {
    if (!id || !user) return undefined;
    try {
      const postId = await createPost(content, media, taggedUsers, audience, feeling, scheduledAt, location);
      if (postId) {
        const { error } = await supabase.from('page_posts').insert({
          page_id: id,
          post_id: postId,
          shared_by: user.id,
        });
        if (error) throw error;
        fetchPagePosts();
      }
      return postId;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message ?? 'Failed to post', variant: 'destructive' });
      return undefined;
    }
  };

  const toggleFollow = async () => {
    if (!id || !user) return;
    setFollowBusy(true);
    if (isFollowing) {
      await supabase.from('page_followers').delete().eq('page_id', id).eq('user_id', user.id);
      setIsFollowing(false);
      setFollowerCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from('page_followers').insert({ page_id: id, user_id: user.id, role: 'follower' });
      setIsFollowing(true);
      setFollowerCount((c) => c + 1);
    }
    setFollowBusy(false);
  };

  const handleSave = async () => {
    if (!page || !isAdmin) return;
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('pages')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        category: category || null,
      })
      .eq('id', page.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setPage({ ...page, name: name.trim(), description: description.trim() || null, category: category || null });
    toast({ title: 'Saved', description: 'Page updated successfully' });
  };

  const handleCoverUpload = async (file: File) => {
    if (!page || !isAdmin) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${page.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('covers')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploading(false);
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      return;
    }
    const { data: urlData } = supabase.storage.from('covers').getPublicUrl(path);
    const cover_image = urlData.publicUrl;
    const { error } = await supabase.from('pages').update({ cover_image }).eq('id', page.id);
    setUploading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setPage({ ...page, cover_image });
    toast({ title: 'Cover updated' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!page) return null;

  const createdAt = new Date(page.created_at).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <div className="px-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/pages')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pages
        </Button>
      </div>

      {/* Cover + Header (Facebook-style) */}
      <Card className="overflow-hidden mt-3 mx-4 rounded-xl">
        <div className="relative h-56 md:h-72 bg-gradient-to-br from-primary/20 to-purple-500/20">
          {page.cover_image && (
            <img src={page.cover_image} alt={page.name} className="w-full h-full object-cover" />
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="secondary"
              className="absolute bottom-3 right-3"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
              {uploading ? 'Uploading...' : 'Edit cover'}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCoverUpload(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="px-6 pt-4 pb-4 border-b">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <Avatar className="h-32 w-32 -mt-20 border-4 border-background shadow-md">
              <AvatarFallback className="bg-primary/10 text-primary text-4xl font-bold">
                {page.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold text-foreground truncate">{page.name}</h1>
              <div className="text-sm text-muted-foreground mt-1">
                {followerCount} followers · {page.category || 'Page'}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!isAdmin && user && (
                <>
                  <Button
                    onClick={toggleFollow}
                    disabled={followBusy}
                    variant={isFollowing ? 'secondary' : 'default'}
                  >
                    <Heart className={`h-4 w-4 mr-2 ${isFollowing ? 'fill-current' : ''}`} />
                    {isFollowing ? 'Following' : 'Follow'}
                  </Button>
                  <Button variant="secondary">
                    <MessageCircle className="h-4 w-4 mr-2" /> Message
                  </Button>
                </>
              )}
              {isAdmin && (
                <Button onClick={() => setActiveTab('manage')} variant="default">
                  Manage Page
                </Button>
              )}
              <Button variant="secondary" size="icon">
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="icon">
                <Search className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs bar */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-2">
            <TabsList className="bg-transparent h-12 p-0 gap-1">
              <TabsTrigger value="posts" className="data-[state=active]:bg-accent rounded-md px-4 h-10">Posts</TabsTrigger>
              <TabsTrigger value="about" className="data-[state=active]:bg-accent rounded-md px-4 h-10">About</TabsTrigger>
              <TabsTrigger value="followers" className="data-[state=active]:bg-accent rounded-md px-4 h-10">Followers</TabsTrigger>
              <TabsTrigger value="photos" className="data-[state=active]:bg-accent rounded-md px-4 h-10">Photos</TabsTrigger>
              {isAdmin && <TabsTrigger value="manage" className="data-[state=active]:bg-accent rounded-md px-4 h-10">Manage</TabsTrigger>}
            </TabsList>
          </div>

          {/* Posts tab — Facebook-style two-column */}
          <TabsContent value="posts" className="m-0">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4">
              {/* Left: Intro */}
              <aside className="md:col-span-2 space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Intro</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {page.description ? (
                      <p className="text-foreground whitespace-pre-wrap text-center">{page.description}</p>
                    ) : (
                      <p className="text-muted-foreground text-center">No description yet.</p>
                    )}
                    {page.category && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Tag className="h-4 w-4" /> <span>{page.category}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="h-4 w-4" /> <span>Public page</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" /> <span>Created {createdAt}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" /> <span>{followerCount} followers</span>
                    </div>
                    {isAdmin && (
                      <Button variant="secondary" className="w-full mt-2" onClick={() => setActiveTab('manage')}>
                        Edit details
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </aside>

              {/* Right: composer + posts */}
              <section className="md:col-span-3 space-y-4">
                {isAdmin && <NewPost onCreatePost={handlePagePost} />}
                {postsLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : pagePosts.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      {isAdmin ? 'No posts yet. Share your first post above.' : 'This page has no posts yet.'}
                    </CardContent>
                  </Card>
                ) : (
                  pagePosts.map((pp) =>
                    pp.post ? (
                      <Post key={pp.id} {...pp.post} onDelete={() => fetchPagePosts()} />
                    ) : null,
                  )
                )}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="about" className="m-0 p-4">
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {page.description || 'No description provided.'}
                </p>
                {page.category && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Category: </span>
                    <Badge variant="secondary">{page.category}</Badge>
                  </div>
                )}
                <div className="text-sm text-muted-foreground">Created on {createdAt}</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="followers" className="m-0 p-4">
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {followerCount} {followerCount === 1 ? 'person follows' : 'people follow'} this page.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="photos" className="m-0 p-4">
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Photos shared on this page will appear here.
              </CardContent>
            </Card>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="manage" className="m-0 p-4">
              <Card>
          <CardHeader>
            <CardTitle>Manage page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="page-name">Name</Label>
              <Input id="page-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="page-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-description">Description</Label>
              <Textarea
                id="page-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save changes
              </Button>
            </div>
          </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
      </Card>
    </div>
  );
};

export default PageDetail;