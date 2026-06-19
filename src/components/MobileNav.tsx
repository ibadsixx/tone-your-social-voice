import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Search,
  MessageCircle,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  profilePic?: string | null;
  displayName?: string | null;
  email?: string | null;
  actingPageName?: string | null;
  actingPagePic?: string | null;
  avatarMenu?: ReactNode;
}

const mainNav = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Search, label: 'Search', href: '/search' },
  { icon: MessageCircle, label: 'Messages', href: '/messages' },
];

const MobileNav = ({ profilePic, displayName, email, actingPageName, actingPagePic, avatarMenu }: MobileNavProps) => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/80 backdrop-blur-lg supports-[backdrop-filter]:bg-card/60 md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-12 px-2">
        {mainNav.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              to={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0 w-12 h-full rounded-lg transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
        <Sheet>
          <SheetTrigger asChild>
            <button
              className={cn(
                'flex flex-col items-center justify-center gap-0 w-12 h-full rounded-lg transition-colors',
                'text-muted-foreground hover:text-foreground'
              )}
            >
              <Avatar className="h-6 w-6 border-2 border-tone-purple/20">
                <AvatarImage src={actingPagePic || profilePic || '/default-avatar.png'} className="object-cover" />
                <AvatarFallback className="bg-tone-gradient text-white text-[10px]">
                  {(actingPageName || displayName || email || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="p-0 max-h-[80vh] overflow-y-auto rounded-t-xl">
            <div className="px-4 pt-3 pb-1 text-center text-xs text-muted-foreground border-b">
              Account
            </div>
            {avatarMenu}
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};

export default MobileNav;
