import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Search,
  MessageCircle,
  Plus,
  Image,
  Video,
  Clapperboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const mainNav = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Search, label: 'Search', href: '/search' },
  { icon: MessageCircle, label: 'Messages', href: '/messages' },
];

const createOptions = [
  { icon: Image, label: 'Post', href: '/', action: 'post' },
  { icon: Video, label: 'Story', href: '/', action: 'story' },
  { icon: Clapperboard, label: 'Reel', href: '/', action: 'reel' },
];

const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/80 backdrop-blur-lg supports-[backdrop-filter]:bg-card/60 md:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {mainNav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 w-14 h-full rounded-lg transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}

          {/* Create button — center, prominent */}
          <button
            onClick={() => setCreateOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 w-14 h-full rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-md">
              <Plus className="h-5 w-5" />
            </span>
          </button>
        </div>
      </nav>

      {/* Create action sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetTitle className="text-center text-base font-semibold py-4">
            Create
          </SheetTitle>
          <Separator />
          <div className="grid grid-cols-3 gap-4 py-6 px-4">
            {createOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.label}
                  onClick={() => {
                    setCreateOpen(false);
                    navigate(option.href);
                  }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-accent transition-colors"
                >
                  <span className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default MobileNav;
