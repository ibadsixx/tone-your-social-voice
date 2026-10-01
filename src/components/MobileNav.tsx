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
import { Badge } from '@/components/ui/badge';
import { useUnreadConversationCount } from '@/hooks/useUnreadConversationCount';
import { useOnlineFriends } from '@/hooks/useOnlineFriends';

interface MobileNavProps {
  guest?: boolean;
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

const MobileNav = ({ guest, profilePic, displayName, email, actingPageName, actingPagePic, avatarMenu }: MobileNavProps) => {
  const location = useLocation();
  const { count: unreadMessageCount } = useUnreadConversationCount();
  // MOBILE ONLY (do.md "green online-friends indicator"). The desktop rail in
  // Layout.tsx deliberately does NOT read this hook, so the dot cannot appear there
  // even if the desktop badge is later refactored - the indicator is absent by not
  // being consumed, rather than hidden by a media query that a layout change could
  // undo. The two indicators are independent: each renders from its own value, so
  // either, both, or neither can be on screen at once.
  const { hasOnlineFriend } = useOnlineFriends();
  // Logged-out visitors get Home + Search only; the Messages entry and the
  // account sheet are replaced with a Sign in link.
  const items = guest ? mainNav.filter((item) => item.href !== '/messages') : mainNav;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/80 backdrop-blur-lg supports-[backdrop-filter]:bg-card/60 md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-10 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              to={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0 w-10 h-full rounded-lg transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="relative">
                <Icon className="h-4 w-4" />
                {item.label === 'Messages' && unreadMessageCount > 0 && (
                  <Badge data-testid="messages-unread-badge" className="absolute -top-1.5 -right-2.5 h-3.5 min-w-3.5 px-1 text-[9px] leading-none bg-red-500 text-white flex items-center justify-center">
                    {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                  </Badge>
                )}
                {/* The green online-friends dot. BOTTOM-LEFT, and that is the whole
                    design decision: the unread badge owns the top-right corner, so
                    putting the dot anywhere near it would either overlap the count or
                    force the badge to move. Two corners, two indicators, no
                    collision, and both keep their existing geometry. `border-card`
                    matches the ring the other online dots in the app use (see
                    ConversationList) and the nav bar's own background, so the dot
                    reads as cut out of the bar rather than floating over it.

                    `absolute` is what keeps the row from jumping: the dot occupies no
                    layout space, so the link is the same 40x40 whether it is present
                    or absent. It is conditional on `hasOnlineFriend` alone, never on
                    the unread count, which is what makes the two independent - and a
                    logged-out session gets no dot, since the provider reports false
                    until a verified caller exists. */}
                {item.label === 'Messages' && hasOnlineFriend && (
                  <span
                    data-testid="messages-online-friends-dot"
                    aria-hidden="true"
                    className="absolute -bottom-1 -left-1.5 w-2.5 h-2.5 rounded-full border-2 border-card bg-green-500"
                  />
                )}
              </span>
            </Link>
          );
        })}
        {guest ? (
          <Link
            to="/auth"
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
        ) : (
          <Sheet>
            <SheetTrigger asChild>
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-0 w-10 h-full rounded-lg transition-colors',
                  'text-muted-foreground hover:text-foreground'
                )}
              >
                <Avatar className="h-5 w-5 border-2 border-tone-purple/20">
                  <AvatarImage src={actingPagePic || profilePic || '/default-avatar.png'} className="object-cover" />
                  <AvatarFallback className="bg-tone-gradient text-white text-[8px]">
                    {(actingPageName || displayName || email || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="p-0 max-h-[70vh] overflow-y-auto rounded-t-xl">
              <div className="px-4 pt-2 pb-1 text-center text-[10px] text-muted-foreground border-b">
                Account
              </div>
              {avatarMenu}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
};

export default MobileNav;
