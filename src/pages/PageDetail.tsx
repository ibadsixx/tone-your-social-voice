import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { buildSocialUrl } from '@/utils/socialLinks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

import PageContainer from '@/components/PageContainer';
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
  FileText,
} from 'lucide-react';
import NewPost from '@/components/NewPost';
import ProfileHeader from '@/components/ProfileHeader';
import ProfileTabs from '@/components/ProfileTabs';
import FilteredPostsLayout from '@/components/FilteredPostsLayout';
import PageCoverPhotoEditor from '@/components/PageCoverPhotoEditor';
import { createPageContentFetcher } from '@/api/pageContent';
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
  legal_info?: Record<string, string> | null;
  work_education?: Record<string, string> | null;
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
  const location = useLocation();
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
  const defaultLegalInfo = { birthplace: '', location: '', birthday: '', quotes: '', languages: '' };
  const [legalInfo, setLegalInfo] = useState<Record<string, string>>({ ...defaultLegalInfo });
  const defaultWork = { company: '', position: '', start_date: '', end_date: '', region: '', description: '' };
  const [workEducation, setWorkEducation] = useState<Record<string, string>>({ ...defaultWork });
  const [workCurrent, setWorkCurrent] = useState(false);
  const defaultEducation = { school: '', degree: '', field: '', start_date: '', end_date: '', grade: '', activities: '' };
  const [educationState, setEducationState] = useState<Record<string, string>>({ ...defaultEducation });
  const [educationCurrent, setEducationCurrent] = useState(false);
  const [familyMembers, setFamilyMembers] = useState<{ name: string; relationship: string; id?: string; type?: 'person' | 'page' }[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRelation, setNewMemberRelation] = useState('Family');
  const [familySearchQuery, setFamilySearchQuery] = useState('');
  const [familySearchResults, setFamilySearchResults] = useState<{ id: string; name: string; type: 'person' | 'page'; profile_pic?: string | null }[]>([]);
  const [familySearchLoading, setFamilySearchLoading] = useState(false);
  const [familySearchIdx, setFamilySearchIdx] = useState<number | null>(null);

  const RELATIONSHIP_OPTIONS = [
    'Spouse', 'Parent', 'Child', 'Sibling', 'Grandparent', 'Grandchild',
    'Aunt/Uncle', 'Cousin', 'Niece/Nephew', 'Fiancé/Fiancée', 'Partner', 'Guardian', 'Family',
  ];
  const pathParts = location.pathname.split('/');
  const aboutPathSection = pathParts[pathParts.length - 1];
  const isAboutPath = pathParts.includes('about');
  const [activeTab, setActiveTab] = useState(isAboutPath ? 'about' : 'posts');
  const [aboutSection, setAboutSection] = useState(isAboutPath && aboutPathSection !== 'about' ? aboutPathSection : 'contact');
  // Bumped after publishing a page post so the shared page feed remounts and
  // re-reads its content source (the feed owns its own cursor/state).
  const [postsVersion, setPostsVersion] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [adminProfile, setAdminProfile] = useState<any>(null);
  const [addButtonOpen, setAddButtonOpen] = useState(false);
  const [selectedButtonType, setSelectedButtonType] = useState<string>('message');
  const [buttonUrl, setButtonUrl] = useState('');
  const [savingButton, setSavingButton] = useState(false);
  const [pageContacts, setPageContacts] = useState<{ id: string; display_name: string; username: string; profile_pic?: string | null }[]>([]);

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
        if (convId && page?.id) {
          await gateway.from('conversations').update({ page_id: page.id }).eq('id', convId).maybeSingle();
          navigate(`/messages/${convId}`);
        }
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

  // The page's content, read through the SHARED profile content feed. The
  // adapter (api/pageContent.ts) targets the `page_posts` link table; the
  // section/feed components themselves are the personal-profile ones, so a
  // page feed is not a second implementation.
  const pageContentFetcher = useMemo(
    () =>
      page
        ? createPageContentFetcher({
            id: page.id,
            name: page.name,
            cover_image: page.cover_image,
            profile_pic: page.profile_pic ?? null,
          })
        : undefined,
    [page?.id, page?.name, page?.cover_image, page?.profile_pic],
  );

  // Top-level tab selection stays URL-backed for Posts/About (so /pages/:id and
  // /pages/:id/about/:section deep-link and survive refresh); Followers and
  // Mentions are local, exactly like their in-page nature.
  useEffect(() => {
    setActiveTab(isAboutPath ? 'about' : 'posts');
  }, [isAboutPath]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'about') navigate(`/pages/${id}/about/${aboutSection}`, { replace: true });
    else if (tab === 'posts') navigate(`/pages/${id}`, { replace: true });
  };

  const handleMessagePage = async () => {
    if (!user || !page) return;
    const convId = await getOrCreateDM(page.admin_id);
    if (convId) {
      await gateway.from('conversations').update({ page_id: page.id }).eq('id', convId).maybeSingle();
      navigate(`/messages/${convId}`);
    }
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await gateway
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
      setLegalInfo({ ...defaultLegalInfo, ...((data as any).legal_info ?? {}) });
      setWorkEducation({ ...defaultWork, ...(((data as any).work_education?.work) ?? {}) });
      setWorkCurrent(((data as any).work_education?.work?.current === true || (data as any).work_education?.work?.current === 'true'));
      setEducationState({ ...defaultEducation, ...(((data as any).work_education?.education) ?? {}) });
      setEducationCurrent(((data as any).work_education?.education?.current === true || (data as any).work_education?.education?.current === 'true'));
      setFamilyMembers((data as any).family_members ?? []);

      // Everything above is the page itself, and the cover, name, description,
      // tabs and admin actions all render from it. Releasing the page gate here
      // means the follower count below is the only thing still arriving, instead
      // of a decorative number holding the whole page behind a spinner.
      setLoading(false);

      const { data: followerData } = await gateway
        .from('page_followers')
        .select('*')
        .eq('page_id', id);
      setFollowerCount((followerData as any[])?.length ?? 0);
    })();
  }, [id, navigate, toast]);

  // Fetch followers list + admin profile for transparency
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await gateway
        .from('page_followers')
        .select('*')
        .eq('page_id', id)
        .order('followed_at', { ascending: false })
        .limit(50);

      const followersList = (data as any[]) || [];
      const userIds = [...new Set(followersList.map((f: any) => f.user_id).filter(Boolean))];
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await gateway
          .from('profiles')
          .select('id, display_name, username, profile_pic')
          .in('id', userIds);
        for (const p of (profiles as any[]) || []) {
          profilesMap[p.id] = p;
        }
      }

      setFollowers(followersList.map((f: any) => ({
        ...f,
        profiles: profilesMap[f.user_id] || null,
      })));
    })();
  }, [id, followerCount]);

  useEffect(() => {
    if (!page?.admin_id) return;
    (async () => {
      const { data } = await gateway
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
      const { data } = await gateway
        .from('page_followers')
        .select('user_id')
        .eq('page_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      setIsFollowing(!!data);
    })();
  }, [id, user]);

  // Fetch page contacts (conversations tagged with this page)
  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      const { data: convs } = await gateway
        .from('conversations')
        .select('id, created_by')
        .eq('page_id', id)
        .order('updated_at', { ascending: false });
      if (!convs || convs.length === 0) return;
      const convIds = convs.map((c: any) => c.id);
      const { data: participants } = await gateway
        .from('conversation_participants')
        .select('user_id')
        .in('conversation_id', convIds);
      if (!participants || participants.length === 0) return;
      const userIds = [...new Set<string>(participants.map((p: any) => p.user_id).filter((uid: string) => uid !== user.id))];
      if (userIds.length === 0) return;
      const { data: profiles } = await gateway
        .from('profiles')
        .select('id, display_name, username, profile_pic')
        .in('id', userIds);
      setPageContacts(profiles || []);
    })();
  }, [id, user]);

  useEffect(() => {
    if (!familySearchQuery.trim() || familySearchQuery.trim().length < 2 || familySearchIdx === null) {
      setFamilySearchResults([]);
      return;
    }
    const q = familySearchQuery.trim();
    const timer = setTimeout(async () => {
      setFamilySearchLoading(true);
      try {
        const pattern = `%${q}%`;
        const [profilesRes, pagesRes] = await Promise.all([
          gateway.from('profiles').select('id, display_name, username, profile_pic').or(`display_name.ilike.${pattern},username.ilike.${pattern}`).limit(10),
          gateway.from('pages').select('id, name, profile_pic').ilike('name', pattern).limit(10),
        ]);
        const results: { id: string; name: string; type: 'person' | 'page'; profile_pic?: string | null }[] = [];
        for (const p of profilesRes.data || []) {
          results.push({ id: p.id, name: p.display_name || p.username, type: 'person', profile_pic: p.profile_pic });
        }
        for (const p of pagesRes.data || []) {
          if (!results.some(r => r.id === p.id && r.type === 'page')) {
            results.push({ id: p.id, name: p.name, type: 'page', profile_pic: p.profile_pic });
          }
        }
        setFamilySearchResults(results);
      } catch {
        setFamilySearchResults([]);
      } finally {
        setFamilySearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [familySearchQuery, familySearchIdx]);

  const handlePagePost = async (
    content: string,
    media?: File[],
    taggedUsers?: any[],
    audience?: any,
    feeling?: any,
    scheduledAt?: Date,
    location?: any,
    preUploadedMedia?: { url: string; mediaType: 'image' | 'video' }[],
  ) => {
    if (!id || !user) return undefined;
    try {
      // `createPost` owns the page association: when `id` (the page being
      // viewed) is supplied it writes the existing `page_posts` join row, so
      // the post shows up here even though its author is the page admin's user
      // account. Forwarding `preUploadedMedia` avoids re-uploading media that
      // the composer already uploaded.
      const postId = await createPost(
        content,
        media,
        taggedUsers,
        audience,
        feeling,
        scheduledAt,
        location,
        preUploadedMedia,
        id,
      );
      if (postId) setPostsVersion((v) => v + 1);
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
      await gateway.from('page_followers').delete().eq('page_id', id).eq('user_id', user.id);
      setIsFollowing(false);
      setFollowerCount((c) => Math.max(0, c - 1));
    } else {
      await gateway.from('page_followers').insert({ page_id: id, user_id: user.id, role: 'follower' });
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

    const cleanLegalInfo: Record<string, string> = {};
    for (const [k, v] of Object.entries(legalInfo)) {
      if (v) cleanLegalInfo[k] = v;
    }
    const hasLegalInfo = Object.keys(cleanLegalInfo).length > 0;

    const cleanWork: Record<string, unknown> = { ...workEducation };
    for (const k of Object.keys(cleanWork)) {
      if (!cleanWork[k]) delete cleanWork[k];
    }
    if (workCurrent) cleanWork.current = true;
    const hasWork = Object.keys(cleanWork).length > 0;

    const cleanEducation: Record<string, unknown> = { ...educationState };
    for (const k of Object.keys(cleanEducation)) {
      if (!cleanEducation[k]) delete cleanEducation[k];
    }
    if (educationCurrent) cleanEducation.current = true;
    const hasEducation = Object.keys(cleanEducation).length > 0;

    const workPayload: Record<string, unknown> = {};
    if (hasWork) workPayload.work = cleanWork;
    if (hasEducation) workPayload.education = cleanEducation;

    const updates: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      category: category || null,
    };

    if (hasLegalInfo) {
      updates.legal_info = cleanLegalInfo;
    }
    if (hasWork || hasEducation) {
      updates.work_education = workPayload;
    }
    if (links.length > 0) {
      updates.links = links;
    }
    if (familyMembers.length > 0) {
      updates.family_members = familyMembers;
    }

    const { error } = await gateway
      .from('pages')
      .update(updates)
      .eq('id', page.id);

    if (error) {
      const msg = error.message || '';
      const missingColumn = msg.includes('links') || msg.includes('legal_info') || msg.includes('work_education') || msg.includes('family_members');
      if (missingColumn) {
        const fallback: Record<string, unknown> = {
          name: name.trim(),
          description: description.trim() || null,
          category: category || null,
        };
        if (links.length > 0 && !msg.includes('links')) {
          fallback.links = links;
        }
        if (hasLegalInfo && !msg.includes('legal_info')) {
          fallback.legal_info = cleanLegalInfo;
        }
        if ((hasWork || hasEducation) && !msg.includes('work_education')) {
          fallback.work_education = workPayload;
        }
        if (familyMembers.length > 0 && !msg.includes('family_members')) {
          fallback.family_members = familyMembers;
        }
        const { error: fallbackErr } = await gateway
          .from('pages')
          .update(fallback)
          .eq('id', page.id);

        setSaving(false);

        if (fallbackErr) {
          toast({ title: 'Error', description: fallbackErr.message, variant: 'destructive' });
          return;
        }

        setPage({
          ...page,
          name: name.trim(),
          description: description.trim() || null,
          category: category || null,
          links: links.length > 0 ? links : null,
          legal_info: hasLegalInfo ? cleanLegalInfo : null,
          work_education: (hasWork || hasEducation) ? workPayload : null,
          family_members: familyMembers.length > 0 ? familyMembers : null,
        });
        toast({ title: 'Saved' });
      } else {
        setSaving(false);
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
      return;
    }

    setSaving(false);
    setPage({
      ...page,
      name: name.trim(),
      description: description.trim() || null,
      category: category || null,
      links: links.length > 0 ? links : null,
      legal_info: hasLegalInfo ? cleanLegalInfo : null,
      work_education: (hasWork || hasEducation) ? workPayload : null,
      family_members: familyMembers.length > 0 ? familyMembers : null,
    });
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
    const { error: uploadError } = await gateway.storage
      .from('covers')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploading(false);
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      return;
    }
    const { data: urlData } = gateway.storage.from('covers').getPublicUrl(path);
    const cover_image = urlData.publicUrl;
    const { error } = await gateway.from('pages').update({ cover_image }).eq('id', page.id);
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
    const { error: uploadError } = await gateway.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploading(false);
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      return;
    }
    const { data: urlData } = gateway.storage.from('avatars').getPublicUrl(path);
    const profile_pic = urlData.publicUrl;
    const { error } = await gateway.from('pages').update({ profile_pic }).eq('id', page.id);
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
    const { error } = await gateway
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
    const { error } = await gateway
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

  const pageProfile = {
    id: page.id,
    username: page.id,
    display_name: page.name,
    bio: page.description,
    profile_pic: page.profile_pic ?? null,
    cover_pic: page.cover_image,
    created_at: page.created_at,
  };

  // Page action cluster. Rendered into the SHARED ProfileHeader's `actions`
  // slot: this is the page-specific counterpart of the personal-profile action
  // buttons, not a replacement header.
  const actionsContent = (
    <>
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
            <Button variant="default" onClick={handleMessagePage}>
              <MessageCircle className="h-4 w-4 mr-2" /> Message
            </Button>
          )}
          <Button onClick={toggleFollow} disabled={followBusy} variant="outline">
            <Heart className={`h-4 w-4 mr-2 ${isFollowing ? 'fill-current' : ''}`} />
            {isFollowing ? 'Following' : 'Follow'}
          </Button>
        </>
      )}
      {isAdmin && (
        <Button
          onClick={() => navigate(`/pages/${page.id}/manage`, { state: { id: page.id, name: page.name, profile_pic: page.profile_pic } })}
          variant="default"
        >
          Manage Page
        </Button>
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
    </>
  );

  const aboutContent = (
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
                        { id: 'transparency', label: 'Page transparency' },
                        { id: 'family', label: 'Family' },
                        { id: 'life', label: 'Life updates' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { setAboutSection(s.id); navigate(`/pages/${id}/about/${s.id}`, { replace: true }); }}
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
                            <Button variant="outline" size="sm" onClick={() => { setAboutEditing(false); setDescription(page.description ?? ''); setCategory(page.category ?? ''); setLinks(page.links ?? []); setLegalInfo({ ...defaultLegalInfo, ...(page.legal_info ?? {}) }); setWorkEducation({ ...defaultWork, ...((page.work_education?.work) ?? {}) }); setWorkCurrent(page.work_education?.work?.current === true || page.work_education?.work?.current === 'true'); setEducationState({ ...defaultEducation, ...((page.work_education?.education) ?? {}) }); setEducationCurrent(page.work_education?.education?.current === true || page.work_education?.education?.current === 'true'); setFamilyMembers(page.family_members ?? []); setNewMemberName(''); setNewMemberRelation('Family'); setFamilySearchQuery(''); setFamilySearchResults([]); setFamilySearchIdx(null); }}>
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
                                  <select
                                    value={link.type}
                                    onChange={(e) => {
                                      const val = e.target.value;
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
                                    className="w-36 shrink-0 bg-background border border-input rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  >
                                    {LINK_TYPES.map((t) => (
                                      <option key={t} value={t}>{t}</option>
                                    ))}
                                  </select>
                                  {isWA ? (
                                    <div className="flex-1 flex gap-2">
                                      <select
                                        value={waCode}
                                        onChange={(e) => {
                                          const code = e.target.value;
                                          const next = [...links];
                                          next[i] = { ...next[i], url: `https://wa.me/${code}${waPhone}` };
                                          setLinks(next);
                                        }}
                                        className="bg-background border border-input rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      >
                                        {COUNTRY_CODES.map((c) => (
                                          <option key={c.value} value={c.value}>{c.label}</option>
                                        ))}
                                      </select>
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
                                    href={buildSocialUrl(link.type, link.url)}
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
                          <h3 className="font-semibold mb-3">Contacts</h3>
                          {pageContacts.length > 0 ? (
                            <div className="space-y-2 text-sm">
                              {pageContacts.map((c) => (
                                <div key={c.id} className="flex items-center gap-3 px-2 py-1.5 rounded-md group hover:bg-accent transition-colors">
                                  <button
                                    onClick={() => navigate(`/profile/${c.username || c.id}`)}
                                    className="flex items-center gap-3 flex-1 text-left"
                                  >
                                    <Avatar className="h-8 w-8 shrink-0">
                                      <AvatarImage src={c.profile_pic || ''} />
                                      <AvatarFallback className="text-xs">{(c.display_name || '?')[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                      <p className="font-medium text-foreground truncate">{c.display_name}</p>
                                      <p className="text-xs text-muted-foreground truncate">@{c.username}</p>
                                    </div>
                                  </button>
                                  {actingAsPage && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={async () => {
                                        const convId = await getOrCreateDM(c.id);
                                        if (convId && page?.id) {
                                          await gateway.from('conversations').update({ page_id: page.id }).eq('id', convId).maybeSingle();
                                          navigate(`/messages/${convId}`);
                                        }
                                      }}
                                    >
                                      <MessageCircle className="h-4 w-4 mr-1" /> Message
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MessageCircle className="h-4 w-4" />
                              <span>No contacts yet. Message someone from this page to add them here.</span>
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
                      <section className="space-y-4">
                        <h3 className="font-semibold">Privacy and legal info</h3>
                        {aboutEditing ? (
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Gender</label>
                              <p className="text-sm text-foreground h-10 flex items-center px-3 rounded-md border border-input bg-muted/50">Other</p>
                              <p className="text-xs text-red-500 mt-1">Not available on this type of page</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Relationship</label>
                              <p className="text-sm text-foreground h-10 flex items-center px-3 rounded-md border border-input bg-muted/50">Select relationship</p>
                              <p className="text-xs text-red-500 mt-1">Not available on this type of page</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Family</label>
                              <p className="text-sm text-foreground h-10 flex items-center px-3 rounded-md border border-input bg-muted/50">Not available</p>
                              <p className="text-xs text-red-500 mt-1">Not available on this type of page</p>
                            </div>
                            {[
                              { key: 'birthplace', label: 'Birthplace', type: 'text', placeholder: 'City, Country' },
                              { key: 'location', label: 'Location', type: 'text', placeholder: 'City, Country' },
                              { key: 'birthday', label: 'Birthday', type: 'date' },
                              { key: 'quotes', label: 'Quotes', type: 'textarea', placeholder: 'Favorite quotes' },
                              { key: 'languages', label: 'Languages', type: 'text', placeholder: 'e.g. English, Spanish' },
                            ].map((field) => (
                              <div key={field.key}>
                                <label className="text-sm font-medium text-muted-foreground mb-1 block">{field.label}</label>
                                {field.type === 'textarea' ? (
                                  <textarea
                                    value={legalInfo[field.key] || ''}
                                    onChange={(e) => setLegalInfo(prev => ({ ...prev, [field.key]: e.target.value }))}
                                    placeholder={field.placeholder}
                                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
                                  />
                                ) : (
                                  <Input
                                    value={legalInfo[field.key] || ''}
                                    onChange={(e) => setLegalInfo(prev => ({ ...prev, [field.key]: e.target.value }))}
                                    placeholder={field.placeholder}
                                    type={field.type}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {[
                              { key: 'gender', label: 'Gender', icon: UserIcon, val: 'Other' },
                              { key: 'relationship', label: 'Relationship', icon: Heart, val: 'Select relationship' },
                              { key: 'family', label: 'Family', icon: Users, val: 'Not available' },
                              { key: 'birthplace', label: 'Birthplace', icon: MapPin },
                              { key: 'location', label: 'Location', icon: MapPin },
                              { key: 'birthday', label: 'Birthday', icon: Calendar },
                              { key: 'quotes', label: 'Quotes', icon: MessageCircle },
                              { key: 'languages', label: 'Languages', icon: Globe },
                            ].map((entry) => {
                              const val = entry.val || legalInfo[entry.key];
                              if (!val) return null;
                              return (
                                <div key={entry.key} className="flex items-start gap-3 text-sm">
                                  <entry.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                  <div>
                                    <span className="text-muted-foreground">{entry.label}: </span>
                                    <span className="text-foreground">{val}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    )}
                    {aboutSection === 'work' && (
                      <section className="space-y-4">
                        <h3 className="font-semibold">Work</h3>
                        {aboutEditing ? (
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Company / Organization</label>
                              <Input
                                value={workEducation.company || ''}
                                onChange={(e) => setWorkEducation(prev => ({ ...prev, company: e.target.value }))}
                                placeholder="Company name"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Position</label>
                              <Input
                                value={workEducation.position || ''}
                                onChange={(e) => setWorkEducation(prev => ({ ...prev, position: e.target.value }))}
                                placeholder="Job title / Role"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-muted-foreground mb-1 block">Start date</label>
                                <Input
                                  value={workEducation.start_date || ''}
                                  onChange={(e) => setWorkEducation(prev => ({ ...prev, start_date: e.target.value }))}
                                  type="date"
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground mb-1 block">End date</label>
                                <Input
                                  value={workEducation.end_date || ''}
                                  onChange={(e) => setWorkEducation(prev => ({ ...prev, end_date: e.target.value }))}
                                  type="date"
                                  disabled={workCurrent}
                                />
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={workCurrent}
                                onChange={(e) => setWorkCurrent(e.target.checked)}
                                className="accent-primary"
                              />
                              Until now
                            </label>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Region / City</label>
                              <Input
                                value={workEducation.region || ''}
                                onChange={(e) => setWorkEducation(prev => ({ ...prev, region: e.target.value }))}
                                placeholder="City, Region"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Description</label>
                              <textarea
                                value={workEducation.description || ''}
                                onChange={(e) => setWorkEducation(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Describe your role or work"
                                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
                              />
                            </div>
                            <h4 className="font-semibold mt-6 mb-2">Education</h4>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">School / University</label>
                              <Input
                                value={educationState.school || ''}
                                onChange={(e) => setEducationState(prev => ({ ...prev, school: e.target.value }))}
                                placeholder="School or university name"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Degree</label>
                              <Input
                                value={educationState.degree || ''}
                                onChange={(e) => setEducationState(prev => ({ ...prev, degree: e.target.value }))}
                                placeholder="e.g. Bachelor's, Master's"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Field of study</label>
                              <Input
                                value={educationState.field || ''}
                                onChange={(e) => setEducationState(prev => ({ ...prev, field: e.target.value }))}
                                placeholder="e.g. Computer Science"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-muted-foreground mb-1 block">Start date</label>
                                <Input
                                  value={educationState.start_date || ''}
                                  onChange={(e) => setEducationState(prev => ({ ...prev, start_date: e.target.value }))}
                                  type="date"
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground mb-1 block">End date</label>
                                <Input
                                  value={educationState.end_date || ''}
                                  onChange={(e) => setEducationState(prev => ({ ...prev, end_date: e.target.value }))}
                                  type="date"
                                  disabled={educationCurrent}
                                />
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={educationCurrent}
                                onChange={(e) => setEducationCurrent(e.target.checked)}
                                className="accent-primary"
                              />
                              Until now
                            </label>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Grade / GPA</label>
                              <Input
                                value={educationState.grade || ''}
                                onChange={(e) => setEducationState(prev => ({ ...prev, grade: e.target.value }))}
                                placeholder="e.g. 3.8 GPA"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground mb-1 block">Activities / Societies</label>
                              <textarea
                                value={educationState.activities || ''}
                                onChange={(e) => setEducationState(prev => ({ ...prev, activities: e.target.value }))}
                                placeholder="Clubs, sports, volunteer work"
                                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {[
                              { key: 'company', label: 'Company / Organization', icon: Building2 },
                              { key: 'position', label: 'Position', icon: Briefcase },
                              { key: 'region', label: 'Region / City', icon: MapPin },
                            ].map(({ key, label, icon: Icon }) => {
                              const val = workEducation[key];
                              if (!val) return null;
                              return (
                                <div key={key} className="flex items-start gap-3 text-sm">
                                  <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                  <div>
                                    <span className="text-muted-foreground">{label}: </span>
                                    <span className="text-foreground">{val}</span>
                                  </div>
                                </div>
                              );
                            })}
                            {(workEducation.start_date || workEducation.end_date || workCurrent) && (
                              <div className="flex items-start gap-3 text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                  <span className="text-muted-foreground">Period: </span>
                                  <span className="text-foreground">
                                    {workEducation.start_date || '?'} – {workCurrent ? 'Present' : (workEducation.end_date || '?')}
                                  </span>
                                </div>
                              </div>
                            )}
                            {workEducation.description && (
                              <div className="flex items-start gap-3 text-sm">
                                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                  <span className="text-muted-foreground">Description: </span>
                                  <span className="text-foreground whitespace-pre-wrap">{workEducation.description}</span>
                                </div>
                              </div>
                            )}
                            {Object.keys(workEducation).every(k => !workEducation[k]) && !workCurrent && (
                              <p className="text-sm text-muted-foreground">No work info added yet.</p>
                            )}
                            <h4 className="font-semibold mt-6 mb-2">Education</h4>
                            {[
                              { key: 'school', label: 'School / University', icon: Building2 },
                              { key: 'degree', label: 'Degree', icon: BadgeCheck },
                              { key: 'field', label: 'Field of study', icon: BookOpen },
                              { key: 'grade', label: 'Grade / GPA', icon: Star },
                            ].map(({ key, label, icon: Icon }) => {
                              const val = educationState[key];
                              if (!val) return null;
                              return (
                                <div key={key} className="flex items-start gap-3 text-sm">
                                  <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                  <div>
                                    <span className="text-muted-foreground">{label}: </span>
                                    <span className="text-foreground">{val}</span>
                                  </div>
                                </div>
                              );
                            })}
                            {(educationState.start_date || educationState.end_date || educationCurrent) && (
                              <div className="flex items-start gap-3 text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                  <span className="text-muted-foreground">Period: </span>
                                  <span className="text-foreground">
                                    {educationState.start_date || '?'} – {educationCurrent ? 'Present' : (educationState.end_date || '?')}
                                  </span>
                                </div>
                              </div>
                            )}
                            {educationState.activities && (
                              <div className="flex items-start gap-3 text-sm">
                                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                  <span className="text-muted-foreground">Activities: </span>
                                  <span className="text-foreground whitespace-pre-wrap">{educationState.activities}</span>
                                </div>
                              </div>
                            )}
                            {Object.keys(educationState).every(k => !educationState[k]) && !educationCurrent && (
                              <p className="text-sm text-muted-foreground">No education info added yet.</p>
                            )}
                          </div>
                        )}
                      </section>
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
                      <section className="space-y-4">
                        <h3 className="font-semibold">Family</h3>
                        {aboutEditing ? (
                          <div className="space-y-3">
                            {familyMembers.map((member, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <Input
                                  value={member.name}
                                  readOnly
                                  className="flex-1 bg-muted/50"
                                />
                                <select
                                  value={member.relationship}
                                  onChange={(e) => {
                                    const next = [...familyMembers];
                                    next[i] = { ...next[i], relationship: e.target.value };
                                    setFamilyMembers(next);
                                  }}
                                  className="flex h-10 w-[140px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                  {RELATIONSHIP_OPTIONS.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setFamilyMembers(familyMembers.filter((_, j) => j !== i))}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <div className="relative flex items-center gap-2">
                              <div className="relative flex-1">
                                <Input
                                  value={familySearchIdx === null ? '' : familySearchQuery}
                                  onChange={(e) => {
                                    setFamilySearchQuery(e.target.value);
                                    setFamilySearchIdx(0);
                                  }}
                                  placeholder="Search people or pages..."
                                  className="flex-1"
                                />
                                {familySearchLoading && (
                                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                                {familySearchResults.length > 0 && familySearchIdx !== null && (
                                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    {familySearchResults.map((r) => (
                                      <button
                                        key={`${r.type}-${r.id}`}
                                        type="button"
                                        className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                                        onClick={() => {
                                          setFamilyMembers([...familyMembers, { name: r.name, relationship: newMemberRelation, id: r.id, type: r.type }]);
                                          setFamilySearchQuery('');
                                          setFamilySearchResults([]);
                                          setFamilySearchIdx(null);
                                        }}
                                      >
                                        <Avatar className="h-8 w-8">
                                          <AvatarImage src={r.profile_pic || ''} />
                                          <AvatarFallback className="text-xs">{r.name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <p className="font-medium">{r.name}</p>
                                          <p className="text-xs text-muted-foreground capitalize">{r.type}</p>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <select
                                value={newMemberRelation}
                                onChange={(e) => setNewMemberRelation(e.target.value)}
                                className="flex h-10 w-[140px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              >
                                {RELATIONSHIP_OPTIONS.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {familyMembers.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No family info added yet.</p>
                            ) : (
                              familyMembers.map((member, i) => (
                                <div key={i} className="flex items-center gap-3 text-sm">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-foreground">{member.name}</span>
                                  <span className="text-muted-foreground">— {member.relationship}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </section>
                    )}
                    {aboutSection === 'life' && (
                      <p className="text-sm text-muted-foreground">No life updates yet.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
  );

  const followersContent = (
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
  );

  const mentionsContent = (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No mentions yet.
              </CardContent>
            </Card>
  );

  return (
    <PageContainer size="md" className="space-y-4 md:space-y-6 pb-10">
      {!isPageAdmin && (
        <Button variant="ghost" size="sm" onClick={() => navigate('/pages')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pages
        </Button>
      )}

      {/* The SHARED personal-profile header template; the page supplies its own
          cover editor and action cluster through explicit slots. */}
      <Card className="overflow-hidden">
        {page.archived && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-6 py-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Archive className="h-4 w-4 shrink-0" />
            <span>This page is archived. Only you can see it.</span>
          </div>
        )}
        <ProfileHeader
          profile={pageProfile}
          isOwnProfile={isPageAdmin}
          profileKind="page"
          hideBio
          hideJoined
          cover={
            <PageCoverPhotoEditor
              pageId={page.id}
              coverImage={page.cover_image}
              canEdit={isAdmin}
              onUploaded={(url) => setPage((prev) => (prev ? { ...prev, cover_image: url } : prev))}
            />
          }
          avatarEditor={
            isAdmin ? (
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
            ) : undefined
          }
          subtitle={
            <p className="text-muted-foreground">
              {page.category || 'Page'} · {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
            </p>
          }
          extraDetails={
            page.description ? (
              <p className="text-sm max-w-2xl whitespace-pre-wrap">{page.description}</p>
            ) : undefined
          }
          actions={actionsContent}
        />
      </Card>

      {/* The SHARED personal-profile tabbed body; posts reuse the shared feed. */}
      <ProfileTabs
        profileId={page.id}
        isOwnProfile={isPageAdmin}
        coverPic={page.cover_image}
        profileKind="page"
        activeTab={activeTab}
        onTabChange={handleTabChange}
        postsContent={
          <div className="space-y-4">
            {isAdmin && <NewPost onCreatePost={handlePagePost} pagePost />}
            <FilteredPostsLayout
              key={postsVersion}
              profileId={page.id}
              coverPic={page.cover_image}
              fetcher={pageContentFetcher}
              postPage={{ id: page.id, name: page.name, cover_image: page.cover_image, profile_pic: page.profile_pic ?? null }}
            />
          </div>
        }
        aboutContent={aboutContent}
        followersContent={followersContent}
        mentionsContent={mentionsContent}
      />

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

    </PageContainer>
  );
};

export default PageDetail;
