import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { emojiService, EmojiData } from '@/services/emojiService';

interface ChatEmojiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmoji?: string;
  onSelectEmoji: (emoji: string) => void;
}

export const ChatEmojiModal: React.FC<ChatEmojiModalProps> = ({
  open,
  onOpenChange,
  currentEmoji = '👌',
  onSelectEmoji,
}) => {
  const [selected, setSelected] = useState(currentEmoji);
  const [emojis, setEmojis] = useState<EmojiData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadEmojis = async () => {
      setIsLoading(true);
      const allEmojis = await emojiService.getAllEmojis();
      setEmojis(allEmojis);
      setIsLoading(false);
    };
    if (open) {
      loadEmojis();
    }
  }, [open]);

  const handleApply = () => {
    onSelectEmoji(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a quick reaction emoji</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-2">
          This emoji will appear as a quick action on messages.
        </p>
        <ScrollArea className="h-[300px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Loading emojis...</p>
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-3 py-2">
              {emojis.map((emoji) => (
                <button
                  key={emoji.emoji}
                  onClick={() => setSelected(emoji.emoji)}
                  className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center transition-all border-2',
                    selected === emoji.emoji
                      ? 'border-primary bg-primary/10 scale-110'
                      : 'border-transparent hover:bg-muted'
                  )}
                >
                  <img 
                    src={emoji.url} 
                    alt={emoji.name} 
                    className="w-8 h-8"
                   loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
