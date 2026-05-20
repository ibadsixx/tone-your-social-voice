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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Star,
  Link2,
  Mail,
  MapPin,
  Phone,
  Image as ImageIcon,
  ShieldCheck,
  UserCog,
  Megaphone,
  Hash,
  User as UserIcon,
  BadgeCheck,
  Briefcase,
  Building2,
  Sparkles,
  ExternalLink,
  Upload,
  ToggleLeft,
  PlusSquare,
  Archive,
  Hash as HashIcon,
  PhoneCall,
  ShoppingCart,
  BookOpen,
  Hand,
  Youtube,
  BellRing,
  Send,
  Navigation,
  Plus,
  X,
} from 'lucide-react';
import NewPost from '@/components/NewPost';
import Post from '@/components/Post';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import { usePageSwitch } from '@/contexts/PageSwitchContext';
import { useCall } from '@/contexts/CallContext';
import { useConversations } from '@/hooks/useConversations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

const categories = [
  'Business', 'Entertainment', 'Education', 'Sports', 'Technology',
  'Travel', 'Food & Cooking', 'Fashion', 'Health & Fitness', 'Art & Culture',
  'Music', 'Gaming', 'News & Media', 'Non-profit', 'Community', 'Other'
];

interface PageLink {
  type: string;
  url: string;
}

const LINK_TYPES = [
  'Website', 'Twitter', 'Instagram', 'Facebook', 'YouTube', 'TikTok',
  'LinkedIn', 'GitHub', 'Discord', 'Telegram', 'WhatsApp', 'Other',
];

const SOCIAL_TYPES = new Set(['Twitter', 'Instagram', 'Facebook', 'YouTube', 'TikTok', 'LinkedIn', 'GitHub', 'Discord', 'Telegram', 'WhatsApp']);

const COUNTRY_CODES = [
  { label: '🇺🇸 US +1', value: '1' },
  { label: '🇬🇧 UK +44', value: '44' },
  { label: '🇨🇦 Canada +1', value: '1' },
  { label: '🇦🇺 Australia +61', value: '61' },
  { label: '🇮🇳 India +91', value: '91' },
  { label: '🇵🇭 Philippines +63', value: '63' },
  { label: '🇳🇬 Nigeria +234', value: '234' },
  { label: '🇩🇪 Germany +49', value: '49' },
  { label: '🇫🇷 France +33', value: '33' },
  { label: '🇧🇷 Brazil +55', value: '55' },
  { label: '🇲🇽 Mexico +52', value: '52' },
  { label: '🇯🇵 Japan +81', value: '81' },
  { label: '🇰🇷 South Korea +82', value: '82' },
  { label: '🇷🇺 Russia +7', value: '7' },
  { label: '🇿🇦 South Africa +27', value: '27' },
  { label: '🇪🇸 Spain +34', value: '34' },
  { label: '🇮🇹 Italy +39', value: '39' },
  { label: '🇸🇦 Saudi Arabia +966', value: '966' },
  { label: '🇦🇪 UAE +971', value: '971' },
  { label: '🇵🇰 Pakistan +92', value: '92' },
  { label: '🇧🇩 Bangladesh +880', value: '880' },
  { label: '🇮🇩 Indonesia +62', value: '62' },
  { label: '🇹🇷 Turkey +90', value: '90' },
  { label: '🇻🇳 Vietnam +84', value: '84' },
  { label: '🇹🇭 Thailand +66', value: '66' },
  { label: '🇪🇬 Egypt +20', value: '20' },
  { label: '🇦🇷 Argentina +54', value: '54' },
  { label: '🇨🇴 Colombia +57', value: '57' },
];

interface PageRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  cover_image: string | null;
  profile_pic?: string | null;
  admin_id: string;
  created_at: string;
  button_type: string | null;
  button_url: string | null;
  archived: boolean;
  links?: PageLink[] | null;
}

const BUTTON_TYPES = [
  { value: 'order_now', label: 'Order now', icon: ShoppingCart, needsLink: true },
  { value: 'register_now', label: 'Register now', icon: Hand, needsLink: true },
  { value: 'request_ticket', label: 'Request a ticket', icon: Mail, needsLink: true },
  { value: 'book_now', label: 'Book now', icon: Calendar, needsLink: true },
  { value: 'learn_more', label: 'Learn now', icon: BookOpen, needsLink: true },
  { value: 'watch_now', label: 'Watch now', icon: Youtube, needsLink: true },
  { value: 'play_now', label: 'Play now', icon: BellRing, needsLink: true },
  { value: 'buy_now', label: 'Buy now', icon: ShoppingCart, needsLink: true },
  { value: 'message', label: 'Message', icon: Send, needsLink: false },
  { value: 'call', label: 'Call', icon: PhoneCall, needsLink: false },
  { value: 'email', label: 'Email', icon: Mail, needsLink: false },
  { value: 'group', label: 'Group', icon: Users, needsLink: false },
] as const;

const PageDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState<PageRow | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !id) return;
    try {
      localStorage.setItem(`tone:lastPageId:${user.id}`, id);
    } catch {}
  }, [user?.id, id]);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aboutEditing, setAboutEditing] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [links, setLinks] = useState<PageLink[]>([]);
  const [activeTab, setActiveTab] = useState('posts');
  const [aboutSection, setAboutSection] = useState('contact');
  const [pagePosts, setPagePosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [adminProfile, setAdminProfile] = useState<any>(null);
  const [addButtonOpen, setAddButtonOpen] = useState(false);
  const [selectedButtonType, setSelectedButtonType] = useState<string>('message');
  const [buttonUrl, setButtonUrl] = useState('');
  const [savingButton, setSavingButton] = useState(false);

  const { createPost } = useHomeFeed();
  const { actingPage, switchToPage, switchToPersonal } = usePageSwitch();
  const { initiateCall } = useCall();
  const { getOrCreateDM } = useConversations(user?.id || undefined);

  const handleButtonClick = async () => {
    if (!page?.button_type) return;
    const btn = BUTTON_TYPES.find((t) => t.value === page.button_type);
    if (!btn) return;

    if (btn.needsLink && page.button_url) {
      window.open(page.button_url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (!user) return;

    switch (page.button_type) {
      case 'message': {
        const convId = await getOrCreateDM(page.admin_id);
        if (convId) navigate(`/messages/${convId}`);
        break;
      }
      case 'call': {
        if (!adminProfile) return;
        initiateCall(page.admin_id, {
          id: page.admin_id,
          display_name: adminProfile.display_name || adminProfile.username || 'User',
          username: adminProfile.username || '',
          profile_pic: adminProfile.profile_pic || undefined,
        }, 'audio');
        break;
      }
      case 'email': {
        const email = adminProfile?.email;
        if (email) window.location.href = `mailto:${email}`;
        break;
      }
      case 'group': {
        navigate('/groups');
        break;
      }
    }
  };

  const isPageAdmin = !!user && page?.admin_id === user.id;
  // Only act as the page (edit/post) when admin has explicitly switched to page mode
  const actingAsPage = isPageAdmin && actingPage?.id === page?.id;
  // Backwards-compatible alias used throughout the editing UI
  const isAdmin = actingAsPage;

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
      setLinks((data as any).links ?? []);

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

  // Fetch followers list + admin profile for transparency
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from('page_followers')
        .select('user_id, role, followed_at, profiles:user_id (id, display_name, username, profile_pic)')
        .eq('page_id', id)
        .order('followed_at', { ascending: false })
        .limit(50);
      setFollowers(data || []);
    })();
  }, [id, followerCount]);

  useEffect(() => {
    if (!page?.admin_id) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, username, profile_pic, email')
        .eq('id', page.admin_id)
        .maybeSingle();
      setAdminProfile(data);
    })();
  }, [page?.admin_id]);

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
        links: links.length > 0 ? links : null,
      })
      .eq('id', page.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setPage({ ...page, name: name.trim(), description: description.trim() || null, category: category || null, links: links.length > 0 ? links : null });
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !page || !isAdmin) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `page_avatars/${page.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploading(false);
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      return;
    }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const profile_pic = urlData.publicUrl;
    const { error } = await supabase.from('pages').update({ profile_pic }).eq('id', page.id);
    setUploading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setPage({ ...page, profile_pic });
    // Update actingPage in context if currently acting as this page
    if (actingPage?.id === page.id) {
      switchToPage({ id: page.id, name: page.name, cover_image: page.cover_image, profile_pic });
    }
    toast({ title: 'Avatar updated' });
  };

  const handleSaveButton = async () => {
    if (!page || !isPageAdmin) return;
    const needsLink = BUTTON_TYPES.find((t) => t.value === selectedButtonType)?.needsLink;
    if (needsLink && !buttonUrl.trim()) {
      toast({ title: 'Error', description: 'Please add a link', variant: 'destructive' });
      return;
    }
    setSavingButton(true);
    const url = needsLink ? buttonUrl.trim() : null;
    const { error } = await supabase
      .from('pages')
      .update({ button_type: selectedButtonType, button_url: url })
      .eq('id', page.id);
    setSavingButton(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setPage({ ...page, button_type: selectedButtonType, button_url: url });
    toast({ title: 'Button saved', description: 'Page button updated successfully' });
    setAddButtonOpen(false);
  };

  const handleRemoveButton = async () => {
    if (!page || !isPageAdmin) return;
    setSavingButton(true);
    const { error } = await supabase
      .from('pages')
      .update({ button_type: null, button_url: null })
      .eq('id', page.id);
    setSavingButton(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setPage({ ...page, button_type: null, button_url: null });
    toast({ title: 'Button removed' });
    setAddButtonOpen(false);
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
        {page.archived && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-6 py-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Archive className="h-4 w-4 shrink-0" />
            <span>This page is archived. Only you can see it.</span>
          </div>
        )}
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
            <div className="relative">
              <Avatar className="h-32 w-32 -mt-20 border-4 border-background shadow-md">
                <AvatarImage src={page.profile_pic || ''} />
                <AvatarFallback className="bg-primary/10 text-primary text-4xl font-bold">
                  {page.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isAdmin && (
                <div className="absolute bottom-0 right-0">
                  <Button
                    size="sm"
                    className="rounded-full h-10 w-10 p-0"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold text-foreground truncate">{page.name}</h1>
              <div className="text-sm text-muted-foreground mt-1">
                {followerCount} followers · {page.category || 'Page'}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!isAdmin && user && (
                <>
                  {page.button_type ? (
                    <Button variant="default" onClick={handleButtonClick}>
                      {(() => {
                        const bt = BUTTON_TYPES.find((t) => t.value === page.button_type);
                        const Icon = bt?.icon || PlusSquare;
                        return <Icon className="h-4 w-4 mr-2" />;
                      })()}
                      {BUTTON_TYPES.find((t) => t.value === page.button_type)?.label || page.button_type}
                    </Button>
                  ) : (
                    <Button variant="default">
                      <MessageCircle className="h-4 w-4 mr-2" /> Message
                    </Button>
                  )}
                  <Button
                    onClick={toggleFollow}
                    disabled={followBusy}
                    variant="outline"
                  >
                    <Heart className={`h-4 w-4 mr-2 ${isFollowing ? 'fill-current' : ''}`} />
                    {isFollowing ? 'Following' : 'Follow'}
                  </Button>
                  <Button variant="outline" onClick={() => setSearchOpen((v) => !v)}>
                    <Search className="h-4 w-4 mr-2" /> Search
                  </Button>
                </>
              )}
              {isAdmin && (
                <>
                  <Button onClick={() => navigate(`/pages/${page.id}/manage`, { state: { id: page.id, name: page.name, profile_pic: page.profile_pic } })} variant="default">
                    Manage Page
                  </Button>
                  <Button variant="outline" onClick={() => setSearchOpen((v) => !v)}>
                    <Search className="h-4 w-4 mr-2" /> Search
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {isAdmin ? (
                    <>
                      <DropdownMenuItem onClick={() => navigate(`/pages/${page.id}/status`, { state: { id: page.id, name: page.name, profile_pic: page.profile_pic } })}>
                        <ToggleLeft className="h-4 w-4 mr-2" />
                        Page status
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSelectedButtonType(page.button_type || 'message');
                        setButtonUrl(page.button_url || '');
                        setAddButtonOpen(true);
                      }}>
                        <PlusSquare className="h-4 w-4 mr-2" />
                        Add button
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate(`/pages/${page.id}/archive`, { state: { id: page.id, name: page.name, profile_pic: page.profile_pic, archived: page.archived } })}>
                        <Archive className="h-4 w-4 mr-2" />
                        {page.archived ? 'Unarchive' : 'Archive'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/pages/${page.id}/activity-log`, { state: { id: page.id, name: page.name, profile_pic: page.profile_pic } })}>
                        <HashIcon className="h-4 w-4 mr-2" />
                        Posts/tags
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        toast({ title: 'Link copied', description: 'Page link copied to clipboard' });
                      }}>
                        <Link2 className="h-4 w-4 mr-2" />
                        Copy link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast({ title: 'Share', description: 'Coming soon' })}>
                        <Share2 className="h-4 w-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => toast({ title: 'Report', description: 'Coming soon' })}>
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        Report page
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Tabs bar */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-2">
            <TabsList className="bg-transparent h-12 p-0 gap-1">
              <TabsTrigger value="posts" className="data-[state=active]:bg-accent rounded-md px-4 h-10">Posts</TabsTrigger>
              <TabsTrigger value="about" className="data-[state=active]:bg-accent rounded-md px-4 h-10">About</TabsTrigger>
              <TabsTrigger value="mentions" className="data-[state=active]:bg-accent rounded-md px-4 h-10">Mentions</TabsTrigger>
              <TabsTrigger value="reviews" className="data-[state=active]:bg-accent rounded-md px-4 h-10">Reviews</TabsTrigger>
              <TabsTrigger value="followers" className="data-[state=active]:bg-accent rounded-md px-4 h-10">Followers</TabsTrigger>
              <TabsTrigger value="photos" className="data-[state=active]:bg-accent rounded-md px-4 h-10">Photos</TabsTrigger>
            </TabsList>
          </div>

          {/* Posts tab — Facebook-style two-column */}
          <TabsContent value="posts" className="m-0">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4">
              {/* Left: Intro + admin switcher */}
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

                  </CardContent>
                </Card>
              </aside>

              {/* Right: composer + posts */}
              <section className="md:col-span-3 space-y-4">
                {isAdmin && <NewPost onCreatePost={handlePagePost} />}
                {searchOpen && (
                  <Input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search posts on this page..."
                  />
                )}
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
                  pagePosts
                    .filter((pp) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (pp.post?.content || '').toLowerCase().includes(q);
                    })
                    .map((pp) =>
                      pp.post ? (
                        <Post key={pp.id} {...pp.post} page={{ id: page.id, name: page.name, cover_image: page.cover_image }} onDelete={() => fetchPagePosts()} />
                      ) : null,
                    )
                )}
              </section>
            </div>
          </TabsContent>

          {/* About — Facebook-style with sub-nav + sections */}
          <TabsContent value="about" className="m-0 p-4">
            <Card>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-4">
                  {/* Sub-nav */}
                  <aside className="md:col-span-1 border-r p-4">
                    <h2 className="text-xl font-bold mb-3">About</h2>
                    <nav className="flex flex-col gap-1 text-sm">
                      {[
                        { id: 'contact', label: 'Contact and basic info' },
                        { id: 'privacy', label: 'Privacy and legal info' },
                        { id: 'work', label: 'Work and education' },
                        { id: 'places', label: 'Places lived' },
                        { id: 'transparency', label: 'Page transparency' },
                        { id: 'family', label: 'Family and relationships' },
                        { id: 'life', label: 'Life updates' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setAboutSection(s.id)}
                          className={`text-left px-3 py-2 rounded-md transition-colors ${
                            aboutSection === s.id
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'hover:bg-accent text-foreground'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </nav>
                  </aside>

                  {/* Section content */}
                  <div className="md:col-span-3 p-6 space-y-6">
                    {isAdmin && (
                      <div className="flex justify-end">
                        {aboutEditing ? (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setAboutEditing(false); setDescription(page.description ?? ''); setCategory(page.category ?? ''); setLinks(page.links ?? []); }}>
                              Cancel
                            </Button>
                            <Button variant="default" size="sm" onClick={() => { handleSave(); setAboutEditing(false); }} disabled={saving}>
                              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                              Save
                            </Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setAboutEditing(true)}>
                            Edit
                          </Button>
                        )}
                      </div>
                    )}
                    {aboutSection === 'contact' && (
                      <>
                        <section>
                          <h3 className="font-semibold mb-3">Category</h3>
                          <div className="flex items-center gap-2 text-sm text-foreground">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            <span>{page.category || 'Uncategorized'}</span>
                          </div>
                        </section>

                        <section>
                          <h3 className="font-semibold mb-3">Description</h3>
                          {aboutEditing ? (
                            <Textarea
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              rows={4}
                              placeholder="Add a description for your page"
                            />
                          ) : (
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {page.description || 'No description provided.'}
                            </p>
                          )}
                        </section>

                          <section>
                          <h3 className="font-semibold mb-3">Websites and social links</h3>
                          {aboutEditing ? (
                            <div className="space-y-3">
                              {links.map((link, i) => {
                                const isWA = link.type === 'WhatsApp';
                                let waCode = '1', waPhone = '';
                                if (isWA && link.url) {
                                  const digits = link.url.replace(/^https?:\/\/wa\.me\//, '').replace(/\D/g, '');
                                  const sorted = [...COUNTRY_CODES].sort((a, b) => b.value.length - a.value.length);
                                  const match = sorted.find((c) => digits.startsWith(c.value));
                                  if (match) {
                                    waCode = match.value;
                                    waPhone = digits.slice(match.value.length);
                                  } else {
                                    waPhone = digits;
                                  }
                                }
                                return (
                                <div key={i} className="flex items-start gap-2">
                                  <Select
                                    value={link.type}
                                    onValueChange={(val) => {
                                      let nextUrl = link.url;
                                      if (val !== 'WhatsApp' && link.type === 'WhatsApp') {
                                        nextUrl = '';
                                      }
                                      if (val === 'WhatsApp' && link.type !== 'WhatsApp') {
                                        nextUrl = '';
                                      }
                                      const next = [...links];
                                      next[i] = { type: val, url: nextUrl };
                                      setLinks(next);
                                    }}
                                  >
                                    <SelectTrigger className="w-36 shrink-0">
                                      <SelectValue placeholder="Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {LINK_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {isWA ? (
                                    <div className="flex-1 flex gap-2">
                                      <Select
                                        value={waCode}
                                        onValueChange={(code) => {
                                          const next = [...links];
                                          next[i] = { ...next[i], url: `https://wa.me/${code}${waPhone}` };
                                          setLinks(next);
                                        }}
                                      >
                                        <SelectTrigger className="w-30 shrink-0">
                                          <SelectValue placeholder="Code" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {COUNTRY_CODES.map((c) => (
                                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        value={waPhone}
                                        onChange={(e) => {
                                          const phone = e.target.value.replace(/\D/g, '');
                                          const next = [...links];
                                          next[i] = { ...next[i], url: `https://wa.me/${waCode}${phone}` };
                                          setLinks(next);
                                        }}
                                        placeholder="phone number"
                                        type="text"
                                      />
                                    </div>
                                  ) : (
                                  <Input
                                    value={link.url}
                                    onChange={(e) => {
                                      const next = [...links];
                                      next[i] = { ...next[i], url: e.target.value };
                                      setLinks(next);
                                    }}
                                    placeholder={SOCIAL_TYPES.has(link.type) ? 'username' : 'https://example.com'}
                                    type={SOCIAL_TYPES.has(link.type) ? 'text' : 'url'}
                                  />
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="mt-0.5 shrink-0"
                                    onClick={() => setLinks(links.filter((_, j) => j !== i))}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                );
                              })}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLinks([...links, { type: 'Website', url: '' }])}
                              >
                                <Plus className="h-4 w-4 mr-2" /> Add link
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2 text-sm">
                              {links.length > 0 ? (
                                links.map((link, i) => (
                                  <a
                                    key={i}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-primary hover:underline"
                                  >
                                    <Link2 className="h-4 w-4 shrink-0" />
                                    <span className="truncate font-medium">{link.type}</span>
                                    <span className="truncate text-muted-foreground">{link.url}</span>
                                  </a>
                                ))
                              ) : (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Link2 className="h-4 w-4" />
                                  <span>No links added yet</span>
                                </div>
                              )}
                            </div>
                          )}
                        </section>

                        <section>
                          <h3 className="font-semibold mb-3">Basic info</h3>
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Star className="h-4 w-4" />
                              <span>Not yet rated (0 Reviews)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>Created {createdAt}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Globe className="h-4 w-4" />
                              <span>Public page</span>
                            </div>
                          </div>
                        </section>
                      </>
                    )}

                    {aboutSection === 'privacy' && (
                      <p className="text-sm text-muted-foreground">No privacy or legal info added yet.</p>
                    )}
                    {aboutSection === 'work' && (
                      <p className="text-sm text-muted-foreground">No work or education info added yet.</p>
                    )}
                    {aboutSection === 'places' && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" /> <span>No places added yet.</span>
                      </div>
                    )}
                    {aboutSection === 'transparency' && (
                      <div className="space-y-5 text-sm">
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">Page transparency</h3>
                          <p className="text-muted-foreground">
                            We're showing information to help you understand the purpose of this Page.
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <Hash className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <div className="text-foreground font-mono">{page.id}</div>
                            <div className="text-xs text-muted-foreground">Page ID</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <div className="text-foreground">{createdAt}</div>
                            <div className="text-xs text-muted-foreground">Creation date</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <UserCog className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <div className="text-foreground font-medium">Admin info</div>
                            {adminProfile ? (
                              <button
                                onClick={() => navigate(`/profile/${adminProfile.username || adminProfile.id}`)}
                                className="flex items-center gap-2 mt-1 hover:underline"
                              >
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-xs">
                                    {(adminProfile.display_name || 'U').charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-foreground">
                                  {adminProfile.display_name || adminProfile.username || 'Page admin'}
                                </span>
                              </button>
                            ) : (
                              <p className="text-xs text-muted-foreground mt-1">
                                This Page doesn't have any other admins.
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Megaphone className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div className="text-muted-foreground">This Page isn't currently running ads.</div>
                        </div>
                        <Button variant="secondary" className="w-full">See all</Button>
                      </div>
                    )}
                    {aboutSection === 'family' && (
                      <p className="text-sm text-muted-foreground">No family or relationships info.</p>
                    )}
                    {aboutSection === 'life' && (
                      <p className="text-sm text-muted-foreground">No life updates yet.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Followers preview */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">Followers</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {followerCount} {followerCount === 1 ? 'person follows' : 'people follow'} this page.
                </p>
              </CardContent>
            </Card>

            {/* Photos preview */}
            <Card className="mt-4">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Photos</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('photos')}>See all</Button>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-4 w-4" /> <span>No photos yet.</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mentions" className="m-0 p-4">
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No mentions yet.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews" className="m-0 p-4">
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Not yet rated · 0 Reviews
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="followers" className="m-0 p-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Followers</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {followerCount} {followerCount === 1 ? 'person follows' : 'people follow'} this Page.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {followers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No followers yet.</p>
                ) : (
                  followers.map((f) => (
                    <div key={f.user_id} className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => navigate(`/profile/${f.profiles?.username || f.user_id}`)}
                        className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {(f.profiles?.display_name || f.profiles?.username || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 text-left">
                          <div className="text-sm font-medium text-foreground truncate">
                            {f.profiles?.display_name || f.profiles?.username || 'User'}
                          </div>
                          {f.role && f.role !== 'follower' && (
                            <div className="text-xs text-muted-foreground capitalize">{f.role}</div>
                          )}
                        </div>
                      </button>
                      {user && f.user_id !== user.id && (
                        <Button size="sm" variant="secondary">
                          <MessageCircle className="h-4 w-4 mr-2" /> Message
                        </Button>
                      )}
                    </div>
                  ))
                )}
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

      </Tabs>
      </Card>

      <Dialog open={addButtonOpen} onOpenChange={setAddButtonOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a button to your page</DialogTitle>
            <DialogDescription>
              Choose a call-to-action button for visitors.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Button type</Label>
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                {BUTTON_TYPES.map((bt) => {
                  const Icon = bt.icon;
                  return (
                    <button
                      key={bt.value}
                      type="button"
                      onClick={() => setSelectedButtonType(bt.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        selectedButtonType === bt.value
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border hover:border-primary/50 hover:bg-accent'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{bt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {BUTTON_TYPES.find((t) => t.value === selectedButtonType)?.needsLink && (
              <div className="space-y-2">
                <Label htmlFor="button-url">
                  Add link <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="button-url"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  placeholder="https://example.com"
                  type="url"
                  required
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {page.button_type && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveButton}
                disabled={savingButton}
                className="mr-auto"
              >
                Remove button
              </Button>
            )}
            <DialogClose asChild>
              <Button variant="outline" disabled={savingButton}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveButton} disabled={savingButton || (BUTTON_TYPES.find((t) => t.value === selectedButtonType)?.needsLink && !buttonUrl.trim())}>
              {savingButton ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default PageDetail;