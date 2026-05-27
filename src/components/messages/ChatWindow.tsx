import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Phone, Video, Info, Users, Flame, X, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MessageBubble, Message } from './MessageBubble';
import { MessageInput, ReplyToMessage } from './MessageInput';
import { ChatInfoPanel } from './ChatInfoPanel';
import { ForwardMessageModal } from './ForwardMessageModal';
import { ReportMessageModal } from './ReportMessageModal';
import { PinnedMessagesBanner } from './PinnedMessagesBanner';
import { useCall } from '@/contexts/CallContext';
import { useConversationReport, useConversationSettings } from '@/hooks/useConversationSettings';
import { useBlocks } from '@/hooks/useBlocks';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { useMessageActions } from '@/hooks/useMessageActions';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { ReactionKey } from '@/lib/reactions';
import { GifItem } from '@/hooks/useGifSearch';
import { isOnline, formatLastSeen } from '@/hooks/usePresence';

type OtherUser = {
  id: string;
  username: string;
  display_name: string;
  profile_pic?: string;
  last_seen_at?: string;
};

interface ChatWindowProps {
  otherUser: OtherUser | null;
  messages: Message[];
  firstUnreadIndex?: number;
  currentUserId: string;
  conversationId?: string;
  onSendMessage: (content?: string, mediaUrl?: string, replyToId?: string) => void;
  onSendGif?: (gif: GifItem) => void;
  onSendAudioMessage?: (audioPath: string, duration: number, mimeType: string, fileSize: number) => void;
  onLoadMore?: () => void;
  loading?: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  otherUser,
  messages,
  firstUnreadIndex,
  currentUserId,
  conversationId,
  onSendMessage,
  onSendGif,
  onSendAudioMessage,
  onLoadMore,
  loading = false
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { initiateCall, status } = useCall();
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyToMessage | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState<Message | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [pendingScrollToMessageId, setPendingScrollToMessageId] = useState<string | null>(null);
  const [chatTheme, setChatTheme] = useState('default');
  const scrollAttemptsRef = useRef<Record<string, number>>({});
  const navigate = useNavigate();
  const { toast } = useToast();
  const [otherUserReadReceiptsEnabled, setOtherUserReadReceiptsEnabled] = useState(true);
  const { reportConversation } = useConversationReport();
  const { settings: conversationSettings, updateChatTheme, toggleVanishingMessages: toggleVanish, updateQuickEmoji } = useConversationSettings(conversationId);
  const { toggleReaction, fetchReactions, getMessageReactions } = useMessageReactions(conversationId);
  const { blockStatus, blockUser, unblockUser } = useBlocks(otherUser?.id || '', currentUserId);
  const { deleteMessage, pinMessage, reportMessage: submitReport, getPinnedMessages } = useMessageActions(conversationId, currentUserId);

  // Vanish mode: swipe gesture state
  const swipeStartY = useRef<number | null>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const vanishJustActivated = useRef(false);

  // Derive chat theme and quick emoji from conversation settings (fetched via RPC in useConversationSettings)
  useEffect(() => {
    if (conversationSettings?.chat_theme) {
      setChatTheme(conversationSettings.chat_theme);
    }
  }, [conversationSettings?.chat_theme]);

  const quickEmoji = conversationSettings?.quick_emoji || '👌';
  const vanishingMessagesEnabled = conversationSettings?.vanishing_messages_enabled ?? false;
  const readReceiptsEnabled = conversationSettings?.read_receipts_enabled ?? true;

  // Fetch the other user's read_receipts_enabled preference
  useEffect(() => {
    if (!conversationId || !otherUser?.id) return;
    supabase.rpc('get_other_user_read_receipts_enabled', {
      p_conversation_id: conversationId,
      p_other_user_id: otherUser.id
    }).then(({ data, error }) => {
      if (!error && data !== null) {
        setOtherUserReadReceiptsEnabled(data);
      }
    });
  }, [conversationId, otherUser?.id]);

  // Real-time subscription for other user's read_receipts_enabled changes
  useEffect(() => {
    if (!conversationId || !otherUser?.id) return;

    const channel = supabase
      .channel(`other-read-receipts-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_settings',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as {
            user_id: string;
            read_receipts_enabled: boolean;
          };
          if (updated.user_id === otherUser.id) {
            setOtherUserReadReceiptsEnabled(updated.read_receipts_enabled ?? true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, otherUser?.id]);

  // Fetch pinned messages and reactions when conversation changes
  useEffect(() => {
    if (conversationId) {
      getPinnedMessages().then(setPinnedMessageIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      const messageIds = messages.map(m => m.id);
      fetchReactions(messageIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Delete seen vanish-mode messages when disabling vanish mode
  const handleToggleVanish = async () => {
    if (!conversationId) return;
    const wasEnabled = vanishingMessagesEnabled;
    await toggleVanish();
    // When turning vanish mode OFF, clean up messages that were already seen
    if (wasEnabled) {
      supabase.rpc('delete_read_vanish_messages', {
        p_conversation_id: conversationId
      }).then(({ error }) => {
        if (error) console.error('Error cleaning up vanish messages:', error);
      });
    }
  };

  // Screenshot detection for vanish mode
  const wasHiddenRef = useRef(false);
  useEffect(() => {
    if (!vanishingMessagesEnabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasHiddenRef.current = true;
      } else if (wasHiddenRef.current) {
        wasHiddenRef.current = false;
        toast({
          title: "Screenshot detected",
          description: "Someone may have taken a screenshot of this chat",
        });
      }
    };

    const handleWindowBlur = () => {
      wasHiddenRef.current = true;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [vanishingMessagesEnabled, toast]);

  const handleReaction = async (messageId: string, reaction: string) => {
    await toggleReaction(messageId, reaction as ReactionKey, currentUserId);
  };

  const handleThemeChange = async (themeId: string) => {
    setChatTheme(themeId);
    await updateChatTheme(themeId);
  };

  const handleQuickEmojiChange = async (emoji: string) => {
    await updateQuickEmoji(emoji);
  };

  // Handle delete message
  const handleDeleteMessage = async (messageId: string) => {
    await deleteMessage(messageId);
  };

  // Handle pin message
  const handlePinMessage = async (messageId: string) => {
    const success = await pinMessage(messageId);
    if (success) {
      setPinnedMessageIds(prev => 
        prev.includes(messageId) 
          ? prev.filter(id => id !== messageId)
          : [...prev, messageId]
      );
    }
  };

  // Handle report message
  const handleReportMessage = async (reason: string, details?: string): Promise<boolean> => {
    if (!reportMessage) return false;
    return await submitReport(reportMessage.id, reason, details);
  };

  const tryScrollToMessage = (messageId: string) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return false;

    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Add a brief highlight effect
    messageElement.classList.add('bg-primary/10');
    setTimeout(() => {
      messageElement.classList.remove('bg-primary/10');
    }, 1500);
    return true;
  };

  // Scroll to a specific message by ID (auto-load older messages if needed)
  const handleScrollToMessage = (messageId: string) => {
    if (tryScrollToMessage(messageId)) {
      setPendingScrollToMessageId(null);
      delete scrollAttemptsRef.current[messageId];
      return;
    }

    if (!onLoadMore) return;

    const nextAttempts = (scrollAttemptsRef.current[messageId] ?? 0) + 1;
    scrollAttemptsRef.current[messageId] = nextAttempts;

    // Avoid infinite loops if the message is too old / unavailable
    if (nextAttempts > 5) {
      setPendingScrollToMessageId(null);
      return;
    }

    setPendingScrollToMessageId(messageId);
    onLoadMore();
  };

  // If we requested older messages to find a target, retry after messages update
  useEffect(() => {
    if (!pendingScrollToMessageId) return;
    if (tryScrollToMessage(pendingScrollToMessageId)) {
      delete scrollAttemptsRef.current[pendingScrollToMessageId];
      setPendingScrollToMessageId(null);
    }
    }, [pendingScrollToMessageId, messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStartCall = (type: 'voice' | 'video') => {
    if (!otherUser) return;
    
    initiateCall(otherUser.id, {
      id: otherUser.id,
      username: otherUser.username,
      displayName: otherUser.display_name,
      profilePic: otherUser.profile_pic,
    }, type);
  };

  const isInCall = status !== 'idle';

  if (!otherUser) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Select a conversation
          </h3>
          <p className="text-muted-foreground">
            Choose a conversation from the sidebar to start chatting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex bg-background relative h-full overflow-hidden">
      {/* Main Chat Area */}
      <div
        ref={chatAreaRef}
        className={cn(
          "flex-1 flex flex-col min-w-0 h-full overflow-hidden relative transition-colors duration-500",
          vanishingMessagesEnabled && "bg-gradient-to-b from-zinc-900 via-zinc-950 to-black"
        )}
        onTouchStart={(e) => {
          swipeStartY.current = e.touches[0].clientY;
        }}
        onTouchMove={(e) => {
          if (swipeStartY.current === null) return;
          const deltaY = e.touches[0].clientY - swipeStartY.current;
          if (deltaY < -80 && !vanishJustActivated.current) {
            e.preventDefault();
            vanishJustActivated.current = true;
            swipeStartY.current = null;
            const newValue = !vanishingMessagesEnabled;
            supabase.rpc('update_conversation_settings', {
              p_conversation_id: conversationId,
              p_vanishing_messages_enabled: newValue
            }).then(() => {
              // When turning vanish mode OFF, clean up seen messages
              if (!newValue && conversationId) {
                supabase.rpc('delete_read_vanish_messages', {
                  p_conversation_id: conversationId
                }).catch(console.error);
              }
            }).catch(console.error);
            toast({
              title: newValue ? "Vanish Mode activated" : "Vanish Mode deactivated",
              description: newValue
                ? "Messages disappear after being read"
                : "Messages will be kept permanently",
            });
            setTimeout(() => { vanishJustActivated.current = false; }, 1000);
          }
        }}
        onTouchEnd={() => {
          swipeStartY.current = null;
        }}
      >
        {/* Vanish Mode Banner */}
        {vanishingMessagesEnabled && (
          <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-orange-600/20 via-amber-600/20 to-yellow-600/20 border-b border-orange-500/20 animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-medium text-orange-300">Vanish Mode is on</span>
              <span className="text-xs text-orange-400/70">Messages disappear after being read</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleVanish}
              className="h-6 w-6 p-0 text-orange-400/70 hover:text-orange-300 hover:bg-orange-500/10"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Chat Header */}
        <CardHeader className={cn(
          "border-b p-4 shrink-0 transition-colors duration-500",
          vanishingMessagesEnabled ? "border-zinc-700/50 bg-zinc-900/50" : "border-border"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={otherUser.profile_pic} alt={otherUser.display_name} />
                <AvatarFallback className={cn(
                  "bg-primary text-primary-foreground",
                  vanishingMessagesEnabled && "ring-2 ring-orange-500/50"
                )}>
                  {otherUser.display_name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className={cn(
                  "font-semibold transition-colors",
                  vanishingMessagesEnabled ? "text-zinc-100" : "text-foreground"
                )}>{otherUser.display_name}</h3>
                <div className="flex items-center gap-1">
                  <p className={cn(
                    "text-sm transition-colors",
                    vanishingMessagesEnabled ? "text-zinc-400" : "text-muted-foreground"
                  )}>@{otherUser.username}</p>
                  <span className={cn(
                    "inline-flex items-center gap-1 text-xs",
                    isOnline(otherUser.last_seen_at) ? "text-green-500" : "text-muted-foreground"
                  )}>
                    <span className={cn(
                      "inline-block w-2 h-2 rounded-full",
                      isOnline(otherUser.last_seen_at) ? "bg-green-500" : "bg-gray-400"
                    )} />
                    {isOnline(otherUser.last_seen_at) ? 'Online' : formatLastSeen(otherUser.last_seen_at)}
                  </span>
                </div>
                  {readReceiptsEnabled && !otherUserReadReceiptsEnabled && (
                    <p className="text-xs text-muted-foreground/50 mt-0.5">Read receipts are off</p>
                  )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Call Buttons */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleStartCall('voice')}
                disabled={isInCall}
                className={cn(
                  "h-10 w-10 p-0 transition-colors",
                  vanishingMessagesEnabled
                    ? "hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-100"
                    : "hover:bg-primary/10 hover:text-primary"
                )}
              >
                <Phone className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleStartCall('video')}
                disabled={isInCall}
                className={cn(
                  "h-10 w-10 p-0 transition-colors",
                  vanishingMessagesEnabled
                    ? "hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-100"
                    : "hover:bg-primary/10 hover:text-primary"
                )}
              >
                <Video className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsInfoPanelOpen(!isInfoPanelOpen)}
                className={cn(
                  "h-10 w-10 p-0 transition-colors",
                  vanishingMessagesEnabled
                    ? "hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-100"
                    : "hover:bg-primary/10 hover:text-primary"
                )}
              >
                <Info className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Messages Area */}
        <ScrollArea className={cn(
          "flex-1 p-4 min-h-0 transition-colors duration-500",
          vanishingMessagesEnabled && "bg-zinc-950/50"
        )} ref={scrollAreaRef}>

          {loading && messages.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-end space-x-2 animate-pulse">
                  <div className="w-8 h-8 bg-muted rounded-full" />
                  <div className="bg-muted h-12 rounded-2xl flex-1 max-w-xs" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {messages.length > 0 && onLoadMore && (
                <div className="text-center mb-4">
                  <Button variant="ghost" size="sm" onClick={onLoadMore}>
                    Load older messages
                  </Button>
                </div>
              )}
              
              <div className="space-y-1">
                {messages.map((message, index) => {
                  const isOwnMessage = message.sender_id === currentUserId;
                  const prevMessage = messages[index - 1];
                  const showAvatar = !prevMessage || 
                    prevMessage.sender_id !== message.sender_id ||
                    new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 300000; // 5 minutes

                  const messageReactions = getMessageReactions(message.id);
                  const isPinned = pinnedMessageIds.includes(message.id);
                  
                  return (
                    <React.Fragment key={message.id}>
                    {firstUnreadIndex !== undefined && firstUnreadIndex >= 0 && index === firstUnreadIndex && (
                      <div className="flex items-center gap-2 my-4">
                        <div className="flex-1 h-px bg-primary/30" />
                        <span className="text-xs font-semibold text-primary shrink-0">Unread messages</span>
                        <div className="flex-1 h-px bg-primary/30" />
                      </div>
                    )}
                      <MessageBubble
                        message={message}
                        isOwn={isOwnMessage}
                        showAvatar={showAvatar}
                        reactions={messageReactions}
                        currentUserId={currentUserId}
                        isPinned={isPinned}
                        chatTheme={chatTheme}
                        isVanishing={vanishingMessagesEnabled}
                        showSeenStatus={readReceiptsEnabled}
                      onReact={handleReaction}
                      onReply={(msg) => setReplyTo({
                        id: msg.id,
                        content: msg.content,
                        sender_profile: msg.sender_profile
                      })}
                      onForward={(msg) => {
                        setForwardMessage(msg);
                        setIsForwardModalOpen(true);
                      }}
                      onDelete={handleDeleteMessage}
                      onPin={handlePinMessage}
                      onReport={(msg) => {
                        setReportMessage(msg);
                        setIsReportModalOpen(true);
                      }}
                      onScrollToMessage={handleScrollToMessage}
                    />
                    </React.Fragment>
                  );
                })}
              </div>
              <div ref={messagesEndRef} />
            </>
          )}
        </ScrollArea>

        {/* Pinned Messages Banner - Facebook Messenger Style (positioned above input) */}
        <PinnedMessagesBanner
          messages={messages}
          pinnedMessageIds={pinnedMessageIds}
          currentUserId={currentUserId}
          onScrollToMessage={handleScrollToMessage}
          onUnpin={handlePinMessage}
        />

        {/* Message Input */}
        <MessageInput
          onSendMessage={(content, mediaUrl, replyToId) => {
            onSendMessage(content, mediaUrl, replyToId);
          }}

          onSendGif={onSendGif}
          onSendAudioMessage={onSendAudioMessage}
          conversationId={conversationId}
          disabled={loading}
          placeholder={`Message ${otherUser.display_name}...`}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          quickEmoji={quickEmoji}
          vanishing={vanishingMessagesEnabled}
        />
      </div>

      {/* Chat Info Panel */}
      <ChatInfoPanel
        isOpen={isInfoPanelOpen}
        onClose={() => setIsInfoPanelOpen(false)}
        conversationId={conversationId}
        otherUser={otherUser}
        pinnedMessageIds={pinnedMessageIds}
        chatTheme={chatTheme}
        quickEmoji={quickEmoji}
        onThemeChange={handleThemeChange}
        onQuickEmojiChange={handleQuickEmojiChange}
        onViewProfile={() => {
          if (otherUser) navigate(`/profile/${otherUser.username}`);
        }}
        onSearch={() => console.log('Search in chat')}
        onBlock={async (blockType?: 'messaging' | 'full') => {
          if (blockStatus.isBlocked) {
            await unblockUser();
          } else {
            await blockUser(blockType || 'full');
          }
        }}
        isBlocked={blockStatus.isBlocked}
        onReport={async (reportedUserId, reason, details) => {
          if (conversationId) {
            await reportConversation(conversationId, reportedUserId, reason || 'inappropriate', details || '');
          }
        }}
        onClearHistory={() => console.log('Clear chat history')}
        onScrollToMessage={handleScrollToMessage}
        vanishingMessagesEnabled={vanishingMessagesEnabled}
        onToggleVanishingMessages={handleToggleVanish}
        otherUserReadReceiptsEnabled={otherUserReadReceiptsEnabled}
      />

      {/* Forward Message Modal */}
      <ForwardMessageModal
        open={isForwardModalOpen}
        onOpenChange={setIsForwardModalOpen}
        message={forwardMessage}
        currentUserId={currentUserId}
      />

      {/* Report Message Modal */}
      <ReportMessageModal
        open={isReportModalOpen}
        onOpenChange={setIsReportModalOpen}
        onReport={handleReportMessage}
      />
    </div>
  );
};
