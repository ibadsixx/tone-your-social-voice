import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Search,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const mainNav = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Search, label: 'Search', href: '/search' },
  { icon: MessageCircle, label: 'Messages', href: '/messages' },
];

const MobileNav = () => {
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
      </div>
    </nav>
  );
};

export default MobileNav;
