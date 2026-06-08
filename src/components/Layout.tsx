import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useTheme } from 'next-themes';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { FloatingIM } from '@/components/im/FloatingIM';
import { ChatWindowManager } from '@/components/im/ChatWindowManager';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HeaderAvatarMenuProvider, useHeaderAvatarMenu } from '@/contexts/HeaderAvatarMenuContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePageSwitch } from '@/contexts/PageSwitchContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import GiveFeedbackDialog from '@/components/GiveFeedbackDialog';
import { 
  Home, 
  MessageCircle, 
  User, 
  Search, 
  Settings, 
  Users, 
  FileText,
  LogOut,
  Heart,
  Bookmark,
  AtSign,
  Hash,
  ChevronRight,
  ChevronUp,
  Plus,
  HelpCircle,
  Moon,
  Sun,
  MessageSquareWarning,
  Shield,
  ArrowLeftRight,
} from 'lucide-react';

const HeaderAvatar = ({ profile, user }: { profile: any; user: any }) => {
  const { menu } = useHeaderAvatarMenu();
  const { signOut } = useAuth();
  const { actingPage, switchToPage, switchToPersonal } = usePageSwitch();
  const navigate = useNavigate();
  const [ownedPages, setOwnedPages] = useState<Array<{ id: string; name: string; cover_image: string | null; profile_pic: string | null }>>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('pages')
        .select('*')
        .eq('admin_id', user.id)
        .order('created_at', { ascending: false });
      if (!data) return;
      const seen = new Set<string>();
      const unique = data.filter((p) => {
        const key = p.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setOwnedPages(unique);
    })();
  }, [user?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setFeedbackOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const firstPage = ownedPages[0] || null;

  const avatar = (
    <Avatar className="h-9 w-9 border-2 border-tone-purple/20 ring-2 ring-transparent hover:ring-tone-purple/30 transition-all cursor-pointer">
      <AvatarImage src={actingPage?.profile_pic || profile?.profile_pic || '/default-avatar.png'} className="object-cover" />
      <AvatarFallback className="bg-tone-gradient text-white">
        {actingPage ? actingPage.name.charAt(0).toUpperCase() : profile?.display_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  const defaultMenu = (
    <div className="py-2">
      <div className="px-2">
        {actingPage ? (
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar className="h-9 w-9">
                {actingPage.profile_pic && <AvatarImage src={actingPage.profile_pic} className="object-cover" />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {actingPage.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold truncate block">{actingPage.name}</span>
                <span className="text-xs text-muted-foreground">Active page</span>
              </div>
            </div>
            <button
              onClick={() => {
                switchToPersonal();
                navigate('/');
              }}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={profile?.profile_pic || '/default-avatar.png'} className="object-cover" />
                <AvatarFallback className="bg-tone-gradient text-white text-xs font-bold">
                  {profile?.display_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm flex-1">{profile?.display_name || user?.email}</span>
              <ArrowLeftRight className="h-3 w-3 text-muted-foreground shrink-0" />
            </button>
          </div>
        ) : (
          <>
            <Link
              to="/profile"
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.profile_pic || '/default-avatar.png'} className="object-cover" />
                <AvatarFallback className="bg-tone-gradient text-white text-xs font-bold">
                  {profile?.display_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-semibold truncate">{profile?.display_name || user?.email}</span>
            </Link>
            {firstPage ? (
              <button
                onClick={() => {
                  switchToPage(firstPage);
                  navigate(`/pages/${firstPage.id}`);
                }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors"
              >
                <Avatar className="h-9 w-9">
                  {firstPage.profile_pic && <AvatarImage src={firstPage.profile_pic} className="object-cover" />}
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                    {firstPage.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-semibold truncate flex-1 text-left">{firstPage.name}</span>
                <ArrowLeftRight className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>
            ) : null}
          </>
        )}
        <Link
          to="/pages"
          className="mt-2 mb-1 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-muted hover:bg-accent transition-colors text-sm font-medium"
        >
          <Users className="h-4 w-4" />
          See all profiles
        </Link>
      </div>

      <div className="my-2 border-t" />

      <nav className="px-2 space-y-1">
        <div className="relative">
          <button
            type="button"
            onClick={() => setSettingsOpen(prev => !prev)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-sm text-left"
          >
            <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
              <Settings className="h-5 w-5 text-foreground" />
            </span>
            <span className="flex-1 truncate font-medium">Settings & privacy</span>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${settingsOpen ? 'rotate-90' : ''}`} />
          </button>
          {settingsOpen && (
            <div className="ml-12 mt-1 mb-1 space-y-1 border-l-2 border-muted pl-3">
              {[
                { label: 'Settings', to: '/settings' },
                { label: 'Profiles & personal details', to: '/settings/details' },
                { label: 'Password & Security', to: '/settings/security' },
                { label: 'Information & Permissions', to: '/settings/information' },
                { label: 'Manage Blocking', to: '/settings/blocked' },
              ].map(({ label, to }) => (
                <Link
                  key={label}
                  to={to}
                  onClick={() => setSettingsOpen(false)}
                  className="block w-full px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>
        <Link
          to="/settings"
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-sm"
        >
          <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <HelpCircle className="h-5 w-5 text-foreground" />
          </span>
          <span className="flex-1 truncate font-medium">Help & support</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setDisplayOpen(prev => !prev)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-sm text-left"
          >
            <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
              <Moon className="h-5 w-5 text-foreground" />
            </span>
            <span className="flex-1 truncate font-medium">Display & accessibility</span>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${displayOpen ? 'rotate-90' : ''}`} />
          </button>
          {displayOpen && (
            <div className="ml-12 mt-1 mb-1 space-y-1 border-l-2 border-muted pl-3">
              <div className="flex items-center justify-between px-3 py-1.5 rounded-md">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sun className="h-4 w-4" />
                  <span>Dark mode</span>
                </div>
                <Switch
                  checked={theme === 'dark'}
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                />
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-sm text-left"
        >
          <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <MessageSquareWarning className="h-5 w-5 text-foreground" />
          </span>
          <span className="flex-1">
            <span className="block font-medium">Give feedback</span>
            <span className="block text-xs text-muted-foreground">CTRL B</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-sm text-left"
        >
          <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <LogOut className="h-5 w-5 text-foreground" />
          </span>
          <span className="flex-1 font-medium">Log out</span>
        </button>
      </nav>

      <div className="px-4 pt-3 pb-1 text-[11px] text-muted-foreground leading-relaxed">
        Privacy · Terms · Advertising · Ad Choices · Cookies · More
      </div>
    </div>
  );

  return (
    <>
    <GiveFeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    <Popover>
      <PopoverTrigger asChild>{avatar}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 max-h-[80vh] overflow-y-auto">
        {menu && <div className="border-b">{menu}</div>}
        {defaultMenu}
      </PopoverContent>
    </Popover>
    </>
  );
};

const Layout = () => {
  const { user, signOut, loading } = useAuth();
  const { profile } = useProfile();
  const { actingPage, switchToPersonal } = usePageSwitch();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    // Preserve the intended destination so we can send the user back after login
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Messages', href: '/messages', icon: MessageCircle },
    { name: 'Profile', href: actingPage ? `/pages/${actingPage.id}` : '/profile', icon: User },
    { name: 'Search', href: '/search', icon: Search },
    { name: 'Following Hashtags', href: '/hashtags/following', icon: Hash },
    { name: 'Saved', href: '/saved', icon: Bookmark },
    { name: 'Groups', href: '/groups', icon: Users },
    { name: 'Pages', href: '/pages', icon: FileText },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <HeaderAvatarMenuProvider>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/80 backdrop-blur-lg supports-[backdrop-filter]:bg-card/60 shadow-tone">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-tone-gradient rounded-lg flex items-center justify-center shadow-tone-glow">
              <span className="text-white font-bold text-lg">T</span>
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-tone-purple to-tone-blue bg-clip-text text-transparent">
              Tone
            </span>
          </Link>
          
          <div className="flex items-center gap-3">
            <NotificationsDropdown />
            
            <Button variant="ghost" size="sm" className="hover:bg-tone-purple/10 hover:text-tone-purple transition-colors">
              <Heart className="h-4 w-4" />
            </Button>

            <HeaderAvatar profile={profile} user={user} />
            
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {actingPage && (
        <div className="border-b border-primary/10 bg-primary/5">
          <div className="container mx-auto px-6 py-2 flex items-center justify-between">
            <p className="text-sm text-foreground">
              You're posting as <span className="font-semibold text-primary">{actingPage.name}</span>
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                switchToPersonal();
                navigate('/');
              }}
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Switch back to personal
            </Button>
          </div>
        </div>
      )}

      <div className="flex">
        {/* Sidebar - hidden on settings pages */}
        {!location.pathname.startsWith('/settings') && (
          <aside className="w-16 h-[calc(100vh-4rem)] border-r border-border/50 bg-card/50 sticky top-16">
            <nav className="flex flex-col items-center gap-1 py-4">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                
                return (
                  <Tooltip key={item.name}>
                    <TooltipTrigger asChild>
                      <Link
                        to={item.href}
                        className={`flex items-center justify-center w-10 h-10 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Main Content */}
        <main className={`flex-1 min-h-[calc(100vh-4rem)] ${location.pathname.startsWith('/settings') ? '' : location.pathname.startsWith('/messages') ? '' : 'xl:mr-[260px]'}`}>
          <Outlet />
        </main>
      </div>

      {/* Chat windows — always visible */}
      <ChatWindowManager />
      {/* Floating IM contacts sidebar — hidden on profile, page profile, and messages pages */}
      {!location.pathname.startsWith('/profile') && !location.pathname.startsWith('/pages') && !location.pathname.startsWith('/messages') && !location.pathname.startsWith('/settings') && <FloatingIM />}
    </div>
    </HeaderAvatarMenuProvider>
  );
};

export default Layout;