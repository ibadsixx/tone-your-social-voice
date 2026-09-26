import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Pin, X } from 'lucide-react';
import { Message } from './MessageBubble';

interface PinnedMessagesBannerProps {
  messages: Message[];
  pinnedMessageIds: string[];
  currentUserId: string;
  onScrollToMessage: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
}

export const PinnedMessagesBanner: React.FC<PinnedMessagesBannerProps> = ({
  messages,
  pinnedMessageIds,
  currentUserId,
  onScrollToMessage,
  onUnpin
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Filter to only get pinned messages
  const pinnedMessages = messages.filter(m => pinnedMessageIds.includes(m.id));
  
  if (pinnedMessages.length === 0) return null;
  
  // Get the most recent pinned message for the collapsed view
  const latestPinned = pinnedMessages[pinnedMessages.length - 1];
  
  // Get message preview text
  const getPreviewText = (message: Message): string => {
    if (message.content) return message.content;
    if (message.is_image || message.image_url) return '📷 Photo';
    if (message.is_gif || message.gif_url) return 'GIF';
    if (message.is_sticker || message.sticker_url) return '🎨 Sticker';
    if (message.audio_path || message.audio_url) return '🎤 Voice message';
    if (message.media_url) return '📎 Attachment';
    return 'Message';
  };
  
  // Get sender name
  const getSenderName = (message: Message): string => {
    if (message.sender_id === currentUserId) return 'You';
    return message.sender_profile?.display_name || 'Unknown';
  };

  return (
    <>
      {/* Bottom bar - Facebook Messenger style */}
      {!isExpanded && (
        <div className="absolute bottom-[72px] left-0 right-0 z-10 flex justify-center pointer-events-none">
          <div 
            className="bg-card border border-border rounded-full px-4 py-2 shadow-lg pointer-events-auto cursor-pointer hover:bg-muted/50 transition-colors flex items-center gap-2"
            onClick={() => onScrollToMessage(latestPinned.id)}
          >
            <span className="text-sm text-muted-foreground">
              You pinned a message.
            </span>
            <button
              className="text-sm font-medium text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
            >
              See All
            </button>
          </div>
        </div>
      )}
      
      {/* Expanded view showing all pinned messages */}
      {isExpanded && (
        <div className="absolute bottom-[72px] left-4 right-4 z-10 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                Pinned Messages ({pinnedMessages.length})
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground"
              onClick={() => setIsExpanded(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <ScrollArea className="max-h-[250px]">
            <div className="divide-y divide-border">
              {pinnedMessages.map((message) => (
                <div
                  key={message.id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors group"
                  onClick={() => {
                    onScrollToMessage(message.id);
                    setIsExpanded(false);
                  }}
                >
                  {/* Sender avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {message.sender_profile?.profile_pic ? (
                      <img 
                        src={message.sender_profile.profile_pic}
                        alt={message.sender_profile.display_name}
                        className="w-10 h-10 rounded-full object-cover"
                       loading="lazy" decoding="async" />
                    ) : (
                      <span className="text-sm font-medium text-primary">
                        {getSenderName(message).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {getSenderName(message)}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {getPreviewText(message)}
                    </p>
                  </div>
                  
                  {/* Image thumbnail if it's an image message */}
                  {(message.is_image || message.image_url) && (
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                      <img 
                        src={message.image_url || message.media_url || ''}
                        alt="Pinned"
                        className="w-full h-full object-cover"
                       loading="lazy" decoding="async" />
                    </div>
                  )}
                  
                  {onUnpin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnpin(message.id);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </>
  );
};
