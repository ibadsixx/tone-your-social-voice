import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCloudinaryStickers, useCloudinaryGroupStickers, type CloudinarySticker } from '@/hooks/useCloudinaryStickers';
import { useAuth } from '@/hooks/useAuth';
import { gateway } from '@/lib/gateway';

interface StickerPickerProps {
  conversationId: string;
  onClose: () => void;
  onStickerSent?: () => void;
}

export const StickerPicker: React.FC<StickerPickerProps> = ({
  conversationId,
  onClose,
  onStickerSent
}) => {
  const { user } = useAuth();
  const { stickerGroups, loading: groupsLoading } = useCloudinaryStickers();
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [sending, setSending] = useState(false);

  // Set default selected group when groups load
  React.useEffect(() => {
    const groupKeys = Object.keys(stickerGroups);
    if (groupKeys.length > 0 && !selectedGroup) {
      setSelectedGroup(groupKeys[0]);
    }
  }, [stickerGroups, selectedGroup]);

  const selectedGroupData = selectedGroup ? stickerGroups[selectedGroup] : null;
  const { stickers, loading: stickersLoading } = useCloudinaryGroupStickers(
    selectedGroup, 
    selectedGroupData?.folder
  );

  const handleStickerClick = async (sticker: CloudinarySticker) => {
    if (!user || sending) return;

    try {
      setSending(true);

      const { error } = await gateway
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          message_type: 'sticker',
          content: sticker.secure_url,
          sticker_url: sticker.secure_url,
          sticker_id: sticker.public_id
        });

      if (error) throw error;

      // Update conversation timestamp
      await gateway
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      onStickerSent?.();
      onClose();
    } catch (error) {
      console.error('Error sending sticker:', error);
    } finally {
      setSending(false);
    }
  };

  const renderStickerGrid = (stickers: CloudinarySticker[]) => {
    if (stickersLoading) {
      return (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }

    if (stickers.length === 0) {
      return (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          No stickers available in this group
        </div>
      );
    }

    return (
      <div className="grid grid-cols-4 gap-3 p-4">
        {stickers.map((sticker) => (
          <motion.div
            key={sticker.public_id}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="relative"
          >
            <Button
              variant="ghost"
              className="w-16 h-16 p-2 rounded-xl hover:bg-muted transition-colors group"
              onClick={() => handleStickerClick(sticker)}
              disabled={sending}
              title={sticker.public_id}
            >
              <img
                src={sticker.secure_url}
                alt={sticker.public_id}
                className="w-12 h-12 object-contain group-hover:scale-110 transition-transform"
                loading="lazy"
              />
            </Button>
          </motion.div>
        ))}
      </div>
    );
  };

  if (groupsLoading) {
    return (
      <Card className="w-80 h-96 bg-card/95 backdrop-blur-sm border-border/50 shadow-lg">
        <CardContent className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading sticker groups...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupKeys = Object.keys(stickerGroups);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="w-80 h-96 bg-card/95 backdrop-blur-sm border-border/50 shadow-lg">
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <h3 className="font-semibold text-foreground">Stickers</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {groupKeys.length === 0 ? (
            <div className="flex items-center justify-center h-80">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">No sticker groups available</p>
                <p className="text-xs text-muted-foreground">
                  Configure your Cloudinary sticker_groups.json file
                </p>
              </div>
            </div>
          ) : (
            <Tabs value={selectedGroup} onValueChange={setSelectedGroup} className="h-80 flex flex-col">
              <TabsList className="w-full justify-start p-2 bg-transparent">
                {groupKeys.map((groupKey) => (
                  <TabsTrigger
                    key={groupKey}
                    value={groupKey}
                    className="flex items-center gap-1 text-xs px-3 py-1"
                  >
                    <span>{stickerGroups[groupKey].label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex-1">
                {groupKeys.map((groupKey) => (
                  <TabsContent key={groupKey} value={groupKey} className="h-full mt-0">
                    <ScrollArea className="h-72">
                      {selectedGroup === groupKey && renderStickerGrid(stickers)}
                    </ScrollArea>
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          )}

          {sending && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Sending sticker...</span>
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};