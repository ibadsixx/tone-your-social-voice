import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Smile, Search, SmilePlus } from 'lucide-react';

interface EmojiItem {
  emoji: string;
  name: string;
  category: string;
  url: string;
}

interface EmojiPickerProps {
  onEmojiSelect: (emoji: { url: string; name: string; emoji: string }) => void;
  className?: string;
  onOpenStickers?: () => void;
  onOpenGifs?: () => void;
}

// Category configuration matching emoji.json categories
const CATEGORIES = [
  { id: 'Smileys', icon: '/emoji/1f600.png', label: 'Smileys' },
  { id: 'People', icon: '/emoji/1f44b.png', label: 'People' },
  { id: 'Animals', icon: '/emoji/1f43c.png', label: 'Animals' },
  { id: 'Nature', icon: '/emoji/1f33f.png', label: 'Nature' },
  { id: 'Food', icon: '/emoji/1f354.png', label: 'Food' },
  { id: 'Travel', icon: '/emoji/1f697.png', label: 'Travel' },
  { id: 'Activities', icon: '/emoji/26bd.png', label: 'Activities' },
  { id: 'Objects', icon: '/emoji/1f4a1.png', label: 'Objects' },
  { id: 'Symbols', icon: '/emoji/2764.png', label: 'Symbols' },
  { id: 'Flags', icon: '/emoji/1f3f3.png', label: 'Flags' },
];

const STORAGE_KEY = 'emoji-picker-last-category';

// Shared hook for emoji loading and filtering
const useEmojiData = () => {
  const [emojis, setEmojis] = useState<EmojiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEmojis = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/emoji/emoji.json');
        if (!response.ok) {
          throw new Error(`Failed to load emojis: ${response.status}`);
        }
        const data: EmojiItem[] = await response.json();
        console.log('📥 EmojiPicker loaded', data.length, 'emojis from emoji.json');
        setEmojis(data);
      } catch (err) {
        console.error('❌ Failed to load emojis:', err);
        setError('Failed to load emojis');
      } finally {
        setLoading(false);
      }
    };

    loadEmojis();
  }, []);

  return { emojis, loading, error };
};

// Convert emoji hex code to character
const hexToEmoji = (hex: string): string => {
  try {
    return String.fromCodePoint(...hex.split('-').map(h => parseInt(h, 16)));
  } catch {
    return '';
  }
};

// Standalone panel component (no popover wrapper)
export const EmojiPickerPanel = ({ onEmojiSelect, onOpenStickers, onOpenGifs }: EmojiPickerProps) => {
  const { emojis, loading, error } = useEmojiData();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || CATEGORIES[0].id;
  });

  // Get unique categories from loaded emojis
  const availableCategories = useMemo(() => {
    const categorySet = new Set(emojis.map(e => e.category));
    return CATEGORIES.filter(cat => categorySet.has(cat.id));
  }, [emojis]);

  // Filter emojis by search or category
  const filteredEmojis = useMemo(() => {
    if (searchQuery.trim()) {
      return emojis.filter(emoji =>
        emoji.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emoji.emoji.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return emojis.filter(emoji => emoji.category === selectedCategory);
  }, [emojis, searchQuery, selectedCategory]);

  // Handle category change
  const handleCategoryChange = useCallback((categoryId: string) => {
    if (categoryId === '__stickers__' || categoryId === '__gif__') return;
    setSelectedCategory(categoryId);
    localStorage.setItem(STORAGE_KEY, categoryId);
    setSearchQuery('');
  }, []);

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emojiItem: EmojiItem) => {
    const emojiChar = hexToEmoji(emojiItem.emoji);
    onEmojiSelect({ 
      url: emojiItem.url, 
      name: emojiItem.name,
      emoji: emojiChar || emojiItem.emoji
    });
  }, [onEmojiSelect]);

  return (
    <div className="w-80 border border-border/50 shadow-lg bg-popover rounded-md overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col"
      >
        {/* Search Input */}
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emojis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm bg-background"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={handleCategoryChange} className="w-full">
          <TabsList className="w-full h-auto p-1 bg-muted/50 rounded-none border-b border-border flex-wrap justify-start gap-0.5">
            {availableCategories.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="h-7 px-1.5 text-xs data-[state=active]:bg-background"
                title={category.label}
              >
                <img src={category.icon} alt={category.label} className="h-4 w-4 object-contain" />
              </TabsTrigger>
            ))}
            {onOpenStickers && (
              <TabsTrigger
                value="__stickers__"
                className="h-7 px-1.5 text-xs data-[state=active]:bg-background"
                title="Stickers"
                onClick={() => onOpenStickers()}
              >
                <SmilePlus className="h-4 w-4" />
              </TabsTrigger>
            )}
            {onOpenGifs && (
              <TabsTrigger
                value="__gif__"
                className="h-7 px-1.5 text-xs font-bold data-[state=active]:bg-background"
                title="GIF"
                onClick={() => onOpenGifs()}
              >
                GIF
              </TabsTrigger>
            )}
          </TabsList>

          {/* Emoji Grid */}
          <TabsContent value={selectedCategory} className="m-0">
            <ScrollArea className="h-64">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  {error}
                </div>
              ) : filteredEmojis.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  {searchQuery ? 'No emojis found' : 'No emojis in this category'}
                </div>
              ) : (
                <div className="grid grid-cols-8 gap-1 p-2">
                  {filteredEmojis.map((emojiItem, index) => (
                    <button
                      key={`${emojiItem.emoji}-${index}`}
                      onClick={() => handleEmojiSelect(emojiItem)}
                      className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent transition-colors"
                      title={emojiItem.name}
                    >
                      <img 
                        src={emojiItem.url} 
                        alt={emojiItem.name}
                        className="h-6 w-6 object-contain"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          const parent = target.parentElement;
                          if (parent) {
                            const char = hexToEmoji(emojiItem.emoji);
                            if (char) {
                              target.style.display = 'none';
                              const span = document.createElement('span');
                              span.textContent = char;
                              span.className = 'text-lg';
                              parent.appendChild(span);
                            } else {
                              target.style.display = 'none';
                            }
                          }
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Footer with count */}
        <div className="px-2 py-1 border-t border-border text-xs text-muted-foreground">
          {searchQuery ? (
            <span>{filteredEmojis.length} results</span>
          ) : (
            <span>{filteredEmojis.length} emojis in {selectedCategory}</span>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// Main component with popover wrapper
export const EmojiPicker = ({ onEmojiSelect, className }: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback((emoji: { url: string; name: string; emoji: string }) => {
    onEmojiSelect(emoji);
    setOpen(false);
  }, [onEmojiSelect]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 w-8 p-0 hover:bg-accent text-muted-foreground hover:text-foreground ${className}`}
        >
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-0 border-0 shadow-none bg-transparent"
        align="end"
        side="top"
      >
        <EmojiPickerPanel onEmojiSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
};

export default EmojiPicker;
