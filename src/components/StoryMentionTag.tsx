import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { gateway } from '@/lib/gateway';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
}

interface StoryMentionTagProps {
  onMention: (userId: string) => void;
}

const StoryMentionTag = ({ onMention }: StoryMentionTagProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const searchPattern = `%${query.trim()}%`;
      const { data, error } = await gateway
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .or(`display_name.ilike.${searchPattern},username.ilike.${searchPattern}`)
        .limit(10);

      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (userId: string) => {
    onMention(userId);
    setOpen(false);
    setSearchQuery('');
    setResults([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
          <UserPlus className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tag People</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Search for users..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
              ) : results.length === 0 && searchQuery ? (
                <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
              ) : (
                results.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelect(user.id)}
                    className="w-full flex items-center gap-3 p-2 hover:bg-accent rounded-lg transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.profile_pic || undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {user.display_name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <p className="font-semibold text-sm">{user.display_name}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StoryMentionTag;
