import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { gateway } from '@/lib/gateway';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface GroupSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
}

const GroupSearchDialog = ({ open, onOpenChange, groupName }: GroupSearchDialogProps) => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [profilePic, setProfilePic] = useState<string | null>(null);

  // Fetch current user profile on open
  useState(() => {
    if (user) {
      gateway
        .from('profiles')
        .select('display_name, profile_pic')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setDisplayName(data.display_name);
            setProfilePic(data.profile_pic);
          }
        });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 rounded-xl overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Search this group</DialogTitle>
        </VisuallyHidden>

        {/* Search input header */}
        <div className="flex items-center gap-2 p-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this group"
            className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm p-0"
            autoFocus
          />
          <button
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-full bg-muted p-1 hover:bg-muted/80 transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 space-y-4">
          {/* No recent searches */}
          {!query.trim() && (
            <p className="text-center text-sm text-muted-foreground">No recent searches</p>
          )}

          {/* Explore this group */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Explore this group</h3>

            {/* Current user activity */}
            {user && (
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={profilePic || undefined} />
                  <AvatarFallback className="text-xs">
                    {displayName?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{displayName || 'User'}</p>
                  <p className="text-xs text-muted-foreground">See your group activity.</p>
                </div>
              </div>
            )}

            {/* Search all */}
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm">Search all of the app</p>
            </div>
          </div>

          {/* Looking for something? */}
          <div className="text-center pt-2 border-t">
            <p className="text-sm font-semibold">Looking for something?</p>
            <p className="text-xs text-muted-foreground">
              Search {groupName} for posts, comments or members.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GroupSearchDialog;
