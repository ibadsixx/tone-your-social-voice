import React, { useState, useMemo, memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Inbox, Search, X, Users, Hash, Archive } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { MessageRequestsModal } from './MessageRequestsModal';
import { useMessageRequests } from '@/hooks/useMessageRequests';
import { cn } from '@/lib/utils';
import { EmojiText } from '@/components/EmojiText';
import { isOnline, formatLastSeen } from '@/hooks/usePresence';

type Conversation = {
  conversation_id: string;
  type: string;
  name?: string;
  description?: string | null;
  other_user?: {
    id: string;
    username: string;
    display_name: string;
    profile_pic?: string;
    last_seen_at?: string;
  };
  last_message?: {
    content?: string;
    created_at: string;
  };
  unread_count: number;
};

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  loading: boolean;
  currentUserId?: string;
  onArchiveConversation?: (conversationId: string) => void;
}

const formatLastMessage = (message?: Conversation['last_message']) => {
  if (!message) return 'No messages yet';
  const content = message.content || 'Sent an attachment';
  return content.length > 35 ? content.slice(0, 35) + '...' : content;
};

const ConversationItem = memo(({
  conversation,
  isActive,
  onSelect,
  onArchive,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onArchive?: (id: string) => void;
}) => {
  const isGroup = conversation.type === 'group';
  const isChannel = conversation.type === 'channel';
  const isMulti = isGroup || isChannel;
  const hasUnread = conversation.unread_count > 0;
  const timeAgo = conversation.last_message
    ? formatDistanceToNow(new Date(conversation.last_message.created_at), { addSuffix: false })
    : null;
  const displayName = isMulti
    ? (conversation.name || (isChannel ? 'Channel' : 'Group'))
    : (conversation.other_user?.display_name || 'Unknown');
  const initial = displayName.charAt(0).toUpperCase();
  const previewText = formatLastMessage(conversation.last_message);
  const online = !isMulti && isOnline(conversation.other_user?.last_seen_at);

  return (
    <button
      onClick={() => onSelect(conversation.conversation_id)}
      className={cn(
        "group w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left",
        isActive
          ? "bg-primary/10"
          : "hover:bg-accent"
      )}
    >
      <div className="relative shrink-0">
        {isMulti ? (
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            isChannel ? "bg-orange-500/10" : "bg-muted"
          )}>
            {isChannel ? (
              <Hash className="h-5 w-5 text-orange-500" />
            ) : (
              <Users className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        ) : (
          <Avatar className="w-10 h-10">
            <AvatarImage
              src={conversation.other_user?.profile_pic}
              alt={displayName}
            />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
              {initial}
            </AvatarFallback>
          </Avatar>
        )}
        {!isMulti && (
          <div className={cn(
            "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card",
            online ? "bg-green-500" : "bg-gray-400"
          )} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className={cn(
            "font-medium truncate",
            hasUnread ? "text-foreground" : "text-foreground/90"
          )}>
            {displayName}
          </h3>
          {timeAgo && (
            <span className={cn(
              "text-xs shrink-0",
              hasUnread ? "text-primary font-medium" : "text-muted-foreground"
            )}>
              {timeAgo}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className={cn(
            "text-sm truncate",
            hasUnread
              ? "text-foreground font-medium"
              : "text-muted-foreground"
          )}>
            <EmojiText text={previewText} emojiSize={14} />
          </div>
          {hasUnread && (
            <Badge
              variant="default"
              className="h-5 min-w-[20px] px-1.5 text-xs font-bold shrink-0"
            >
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </Badge>
          )}
        </div>

        {!isMulti && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {online ? 'Online' : formatLastSeen(conversation.other_user?.last_seen_at)}
          </p>
        )}
        {isChannel && conversation.description && (
          <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
            {conversation.description}
          </p>
        )}
      </div>
      {onArchive && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onArchive(conversation.conversation_id); }}
        >
          <Archive className="h-4 w-4" />
        </Button>
      )}
    </button>
  );
});

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  loading,
  currentUserId,
  onArchiveConversation
}) => {
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { requests } = useMessageRequests(currentUserId);
  const totalRequests = requests.length;

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(conv => {
      const isMulti = conv.type === 'group' || conv.type === 'channel';
      const name = isMulti
        ? (conv.name || '').toLowerCase()
        : (conv.other_user?.display_name || '').toLowerCase();
      const username = conv.other_user?.username?.toLowerCase() || '';
      return name.includes(query) || username.includes(query);
    });
  }, [conversations, searchQuery]);

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden">
        <div className="p-2 space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2 p-2 animate-pulse">
              <div className="w-10 h-10 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-2 py-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search Messenger"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-7 bg-muted border-0 rounded-full h-8 text-sm"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {totalRequests > 0 && (
        <div className="px-2 py-1">
          <Button
            variant="ghost"
            className="w-full justify-start h-auto py-2 hover:bg-accent rounded-lg"
            onClick={() => setRequestsModalOpen(true)}
          >
            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center mr-2 shrink-0">
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-foreground truncate">Message Requests</p>
              <p className="text-xs text-muted-foreground truncate">
                {totalRequests} pending
              </p>
            </div>
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="px-2 py-1">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              {searchQuery ? (
                <>
                  <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No conversations found</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Inbox className="h-8 w-8 text-primary" />
                  </div>
                  <p className="font-medium text-foreground mb-1">No conversations yet</p>
                  <p className="text-sm text-muted-foreground">
                    Start a new chat with your friends!
                  </p>
                </>
              )}
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <ConversationItem
                key={conversation.conversation_id}
                conversation={conversation}
                isActive={activeConversationId === conversation.conversation_id}
                onSelect={onSelectConversation}
                onArchive={onArchiveConversation}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <MessageRequestsModal
        open={requestsModalOpen}
        onOpenChange={setRequestsModalOpen}
        currentUserId={currentUserId}
      />
    </div>
  );
};