import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { FloatingIM } from '@/components/im/FloatingIM';
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
  Hash
} from 'lucide-react';

const Layout = () => {
  const { user, signOut, loading } = useAuth();
  const { profile } = useProfile();
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
    { name: 'Profile', href: '/profile', icon: User },
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

            <Avatar className="h-9 w-9 border-2 border-tone-purple/20 ring-2 ring-transparent hover:ring-tone-purple/30 transition-all cursor-pointer">
              <AvatarImage src={profile?.profile_pic || '/default-avatar.png'} className="object-cover" />
              <AvatarFallback className="bg-tone-gradient text-white">
                {profile?.display_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 h-[calc(100vh-4rem)] border-r border-border/50 bg-card/50 sticky top-16">
          <nav className="p-6 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-[calc(100vh-4rem)] xl:mr-[260px]">
          <Outlet />
        </main>
      </div>

      {/* Floating IM */}
      <FloatingIM />
    </div>
  );
};

export default Layout;