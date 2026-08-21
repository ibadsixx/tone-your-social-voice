import React, { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { X, Minus, Phone, Video } from 'lucide-react';
import { useConversations } from '@/hooks/useConversations';
import { MessageInput } from '@/components/messages/MessageInput';
import type { GifItem } from '@/hooks/useGifSearch';
import { gateway } from '@/lib/gateway';
import { useCall } from '@/contexts/CallContext';
import { parseCallLog, callLogLabel, formatCallDuration } from '@/lib/callLog';

interface MiniChatUser {
  id: string;
  username: string;
  display_name: string;
  profile_pic?: string | null;
}

interface MiniChatWindowProps {
  user: MiniChatUser;
  currentUserId: string;
  onClose: () => void;
  onMinimize: () => void;
  isMinimized: boolean;
  style?: React.CSSProperties;
}

export const MiniChatWindow: React.FC<MiniChatWindowProps> = ({
  user,
  currentUserId,
  onClose,
  onMinimize,
  isMinimized,
  style,
}) => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { initiateCall, status } = useCall();
  const isInCall = status !== 'idle';

  const handleStartCall = (type: 'voice' | 'video') => {
    initiateCall(user.id, {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      profilePic: user.profile_pic ?? undefined,
    }, type);
  };

  const {
    messages,
    fetchMessages,
    sendMessage,
    getOrCreateDM,
    setActiveConversationId,
  } = useConversations(currentUserId);

  // Initialize conversation
  useEffect(() => {
    const initConversation = async () => {
      const convId = await getOrCreateDM(user.id);
      if (convId) {
        setConversationId(convId);
        setActiveConversationId(convId);
        fetchMessages(convId, 0);
      }
    };
    initConversation();

    return () => {
      setActiveConversationId(null);
    };
  }, [user.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendGif = async (gif: GifItem) => {
    if (!conversationId) return;
    const { error } = await gateway
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        gif_id: gif.id,
        gif_url: gif.url,
        is_gif: true,
      });
    if (error) {
      console.error('Error sending GIF:', error);
      return;
    }
    await fetchMessages(conversationId, 0);
  };

  if (isMinimized) {
    return (
      <button
        onClick={onMinimize}
        className="relative group"
        title={user.display_name}
      >
        <Avatar className="h-12 w-12 border-2 border-primary/30 ring-2 ring-transparent group-hover:ring-primary/40 transition-all shadow-lg cursor-pointer">
          <AvatarImage src={user.profile_pic || ''} className="object-cover" />
          <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
            {user.display_name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full" />
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute -top-1 -right-1 w-5 h-5 bg-muted rounded-full items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden group-hover:flex"
        >
          <X className="h-3 w-3" />
        </button>
      </button>
    );
  }

  return (
    <div
      className="w-80 h-[420px] bg-card border border-border rounded-t-lg shadow-xl flex flex-col overflow-hidden"
      style={style}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-card border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.profile_pic || ''} className="object-cover" />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {user.display_name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-card rounded-full" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user.display_name}</p>
            <p className="text-[10px] text-muted-foreground">Active now</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => handleStartCall('voice')} disabled={isInCall} className="h-7 w-7 text-primary hover:bg-primary/10">
            <Phone className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleStartCall('video')} disabled={isInCall} className="h-7 w-7 text-primary hover:bg-primary/10">
            <Video className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-accent" onClick={onMinimize}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-accent" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Avatar className="h-16 w-16 mb-3">
              <AvatarImage src={user.profile_pic || ''} className="object-cover" />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {user.display_name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="text-sm font-semibold text-foreground">{user.display_name}</p>
            <p className="text-xs text-muted-foreground mt-1">Start a conversation</p>
          </div>
        ) : (
          messages.map((msg) => {
            const callInfo = parseCallLog(msg.content);
            if (callInfo) {
              return (
                <div key={msg.id} className="flex justify-center my-1">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/60 border border-border text-muted-foreground">
                    {callLogLabel(callInfo, currentUserId)}
                    {callInfo.status === 'ended' && callInfo.duration > 0 && (
                      <> · {formatCallDuration(callInfo.duration)}</>
                    )}
                  </span>
                </div>
              );
            }
            const isMine = msg.sender_id === currentUserId;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                {!isMine && (
                  <Avatar className="h-6 w-6 mr-1 mt-auto shrink-0">
                    <AvatarImage src={user.profile_pic || ''} className="object-cover" />
                    <AvatarFallback className="text-[10px] bg-muted">{user.display_name.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[70%] w-fit px-3 py-1.5 rounded-2xl text-sm ${
                    isMine
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {msg.content && <p className="break-words">{msg.content}</p>}
                  {msg.gif_url && (
                    <img src={msg.gif_url} alt="" className="max-w-full rounded-lg mt-1" />
                  )}
                  {msg.image_url && (
                    <img src={msg.image_url} alt="" className="max-w-full rounded-lg mt-1" />
                  )}
                  {msg.media_url && (
                    <video src={msg.media_url} className="max-w-full rounded-lg mt-1" controls />
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-2 py-2 border-t border-border">
        <MessageInput
          onSendMessage={(content, mediaUrl, replyToId) => {
            if (conversationId) sendMessage(conversationId, content, mediaUrl, replyToId);
          }}
          onSendGif={handleSendGif}
          conversationId={conversationId || undefined}
          placeholder="Aa"
        />
      </div>
    </div>
  );
};
