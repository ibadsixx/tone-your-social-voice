import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EmojiText } from '../EmojiText';
import {
  MoreVertical, 
  Reply, 
  Forward, 
  Copy,
  Pin,
  Flag,
  Trash2,
  Download,
  Play,
  Pause,
  Volume2,
  VolumeX,
  MoreHorizontal,
  Smile,
  Flame
} from 'lucide-react';
import MessageReactionPicker from './MessageReactionPicker';
import StaticReactionIcon from '@/components/StaticReactionIcon';
import { getReactionConfig, type ReactionKey } from '@/lib/reactions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';


export interface Message {
  id: string;
  content?: string;
  message_type?: 'text' | 'image' | 'gif' | 'sticker' | 'audio' | 'video' | 'file';
  media_url?: string;
  attachment_url?: string;
  image_url?: string;
  is_image?: boolean;
  audio_path?: string;
  audio_url?: string;
  audio_duration?: number;
  audio_mime?: string;
  audio_size?: number;
  is_sticker?: boolean;
  sticker_id?: string;
  sticker_url?: string;
  sticker_set?: string;
  is_gif?: boolean;
  gif_id?: string;
  gif_url?: string;
  created_at: string;
  sender_id: string;
  sender_profile?: {
    username: string;
    display_name: string;
    profile_pic?: string;
  };
  is_system?: boolean;
  reply_to_id?: string | null;
  reply_to?: {
    id: string;
    content?: string;
    image_url?: string | null;
    media_url?: string | null;
    attachment_url?: string | null;
    is_image?: boolean | null;
    sender_profile?: {
      display_name: string;
    } | null;
  } | null;
}

type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
};

interface MessageBubbleProps {
  message: Message;
  isOwn?: boolean;
  showAvatar?: boolean;
  reactions?: MessageReaction[];
  currentUserId?: string;
  isPinned?: boolean;
  chatTheme?: string;
  isVanishing?: boolean;
  onReact?: (messageId: string, reaction: string) => void;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onReport?: (message: Message) => void;
  onScrollToMessage?: (messageId: string) => void;
}

// Theme gradient mappings
const THEME_GRADIENTS: Record<string, string> = {
  'default': 'bg-primary',
  'purple-pink': 'bg-gradient-to-br from-purple-500 to-pink-500',
  'blue-cyan': 'bg-gradient-to-br from-blue-500 to-cyan-400',
  'orange-red': 'bg-gradient-to-br from-orange-500 to-red-500',
  'green-teal': 'bg-gradient-to-br from-green-500 to-teal-400',
  'indigo-purple': 'bg-gradient-to-br from-indigo-500 to-purple-500',
  'rose-pink': 'bg-gradient-to-br from-rose-400 to-pink-400',
  'amber-yellow': 'bg-gradient-to-br from-amber-400 to-yellow-300',
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn = false,
  showAvatar = true,
  reactions = [],
  currentUserId,
  isPinned = false,
  chatTheme = 'default',
  isVanishing = false,
  onReact,
  onReply,
  onForward,
  onDelete,
  onPin,
  onReport,
  onScrollToMessage
}) => {
  const themeClass = THEME_GRADIENTS[chatTheme] || THEME_GRADIENTS['default'];
  const currentUserReactionKey: ReactionKey | null = (() => {
    if (!currentUserId) return null;
    const mine = reactions.find(r => r.user_id === currentUserId);
    if (!mine) return null;
    return getReactionConfig(mine.reaction) ? (mine.reaction as ReactionKey) : null;
  })();

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Load audio URL when component mounts
  useEffect(() => {
    if (message.audio_path && !audioUrl && !loadingAudio) {
      loadAudioUrl();
    }
  }, [message.audio_path]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const loadAudioUrl = async () => {
    if (!message.audio_path) return;
    
    setLoadingAudio(true);
    setAudioError(null);
    
    try {
      const { data, error } = await supabase.storage
        .from('message_audios')
        .createSignedUrl(message.audio_path, 3600); // 1 hour expiry
      
      if (error) throw error;
      
      setAudioUrl(data.signedUrl);
    } catch (error: any) {
      console.error('Error loading audio:', error);
      setAudioError('Failed to load audio');
    } finally {
      setLoadingAudio(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((error) => {
        console.error('Error playing audio:', error);
        setAudioError('Failed to play audio');
      });
    }
  };

  const handleSeek = (newTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatAudioTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyMessage = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
    }
  };

  // Helper to strip query params from URL for extension matching
  const getUrlPath = (url: string) => url.split('?')[0];

  // Check if a URL points to a video file
  const isVideoUrl = (url?: string | null) => {
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i.test(getUrlPath(url));
  };

  // Check if a URL points to an image file
  const isImageUrl = (url?: string | null) => {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|svg)$/i.test(getUrlPath(url));
  };

  // Get the actual media URL from available fields
  const getMediaUrl = () => {
    return message.image_url || message.media_url || message.attachment_url || null;
  };

  // Check if this is a video-only message (video file flagged as is_image or in image_url)
  const isVideoOnlyMessage = () => {
    const url = getMediaUrl();
    const hasNoText = !message.content || message.content.trim() === '';
    return hasNoText && url && isVideoUrl(url);
  };

  // Check if this is an image-only message (no text content)
  const isImageOnlyMessage = () => {
    // If it's actually a video, don't treat as image
    if (isVideoOnlyMessage()) return false;
    const hasImage = (message.is_image && !isVideoUrl(getMediaUrl())) || 
      (message.image_url && !message.content && isImageUrl(message.image_url)) ||
      (message.media_url && isImageUrl(message.media_url) && !message.content) ||
      (message.attachment_url && isImageUrl(message.attachment_url) && !message.content);
    const hasNoText = !message.content || message.content.trim() === '';
    return hasImage && hasNoText;
  };

  // Check if this is an emoji-only message (1-3 emojis, no other text)
  const isEmojiOnlyMessage = () => {
    if (!message.content) return false;
    const content = message.content.trim();
    if (content.length === 0) return false;
    
    // Comprehensive emoji regex
    const emojiRegex = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?/gu;
    
    // Remove all emojis from the content
    const withoutEmojis = content.replace(emojiRegex, '').trim();
    
    // If there's any remaining text, it's not emoji-only
    if (withoutEmojis.length > 0) return false;
    
    // Count the number of emojis (limit to 3 for large display)
    const emojis = content.match(emojiRegex);
    return emojis && emojis.length >= 1 && emojis.length <= 3;
  };

  // Get the image URL for standalone rendering (only actual images, not videos)
  const getImageUrl = () => {
    if (message.image_url && !isVideoUrl(message.image_url)) return message.image_url;
    if (message.media_url && isImageUrl(message.media_url)) return message.media_url;
    if (message.attachment_url && isImageUrl(message.attachment_url)) return message.attachment_url;
    return null;
  };

  const renderMediaContent = () => {
    // Skip if standalone media (will be rendered separately without bubble)
    if (isImageOnlyMessage() || isVideoOnlyMessage()) return null;

    // Handle inline videos (is_image might be true but URL is video)
    if (message.is_image && message.image_url && isVideoUrl(message.image_url)) {
      return (
        <div className="mt-2">
          <video
            src={message.image_url}
            controls
            className="max-w-xs rounded-lg"
            style={{ maxHeight: '300px' }}
          />
        </div>
      );
    }

    // Handle inline images (when there's also text content)
    if (message.is_image && message.image_url && !isVideoUrl(message.image_url)) {
      return (
        <div className="mt-2">
          <img
            src={message.image_url}
            alt="Shared image"
            className="rounded-xl max-w-[250px] max-h-[250px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(message.image_url, '_blank')}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = `
                <div class="flex items-center space-x-2 p-2 bg-muted rounded border text-muted-foreground">
                  <span>🖼️ Image unavailable</span>
                </div>
              `;
            }}
          />
        </div>
      );
    }

    // Legacy media_url and attachment_url handling
    if (!message.media_url && !message.attachment_url) return null;

    if (message.media_url) {
      const mediaPath = getUrlPath(message.media_url);
      const isImage = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(mediaPath);
      const isVideo = /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i.test(mediaPath);

      if (isImage) {
        return (
          <div className="mt-2">
            <img
              src={message.media_url}
              alt="Shared image"
              className="rounded-xl max-w-[250px] max-h-[250px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(message.media_url, '_blank')}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = `
                  <div class="flex items-center space-x-2 p-2 bg-muted rounded border text-muted-foreground">
                    <span>🖼️ Image unavailable</span>
                  </div>
                `;
              }}
            />
          </div>
        );
      }

      if (isVideo) {
        return (
          <div className="mt-2">
            <video
              src={message.media_url}
              controls
              className="max-w-xs rounded-lg"
              style={{ maxHeight: '300px' }}
            />
          </div>
        );
      }
    }

    if (message.attachment_url) {
      const attachPath = getUrlPath(message.attachment_url);
      const isImage = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(attachPath);
      const isVideo = /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i.test(attachPath);
      
      if (isImage) {
        return (
          <div className="mt-2">
            <img
              src={message.attachment_url}
              alt="Shared image"
              className="rounded-xl max-w-[250px] max-h-[250px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(message.attachment_url, '_blank')}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = `
                  <div class="flex items-center space-x-2 p-2 bg-muted rounded border text-muted-foreground">
                    <span>🖼️ Image unavailable</span>
                  </div>
                `;
              }}
            />
          </div>
        );
      } else if (isVideo) {
        return (
          <div className="mt-2">
            <video
              src={message.attachment_url}
              controls
              className="max-w-xs rounded-lg"
              style={{ maxHeight: '300px' }}
            />
          </div>
        );
      } else {
        return (
          <div className="mt-2">
            <div className="flex items-center space-x-2 p-2 bg-muted rounded border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(message.attachment_url, '_blank')}
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </Button>
            </div>
          </div>
        );
      }
    }

    return (
      <div className="mt-2">
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          📎 View attachment
        </a>
      </div>
    );
  };

  return (
    <div
      data-message-id={message.id}
      className={`flex items-end space-x-2 mb-4 group ${
        isOwn ? 'flex-row-reverse space-x-reverse' : ''
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {showAvatar && !isOwn && (
        <Avatar className="w-8 h-8">
          <AvatarImage
            src={message.sender_profile?.profile_pic}
            alt={message.sender_profile?.display_name}
          />
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {message.sender_profile?.display_name?.charAt(0).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message Content */}
      <div className={`max-w-xs lg:max-w-md ${isOwn ? 'ml-auto' : ''}`}>
        {/* Pinned badge - Facebook Messenger style */}
        {isPinned && (
          <div className={`flex items-center gap-1 mb-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-primary/30 bg-primary/10">
              <Pin className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-primary">Pinned</span>
            </div>
          </div>
        )}

        {/* Sender name (for group chats) */}
        {!isOwn && showAvatar && (
          <p className="text-xs text-muted-foreground mb-1 px-3">
            {message.sender_profile?.display_name}
          </p>
        )}

        {/* Video-only message - render video player without bubble */}
        {isVideoOnlyMessage() ? (
          <div className="relative">
            <video
              src={getMediaUrl() || ''}
              controls
              className="rounded-2xl max-w-[280px] max-h-[320px] shadow-sm"
              style={{ maxHeight: '320px' }}
            />
            <p className={`text-xs mt-1 ${isOwn ? 'text-right' : 'text-left'} text-muted-foreground`}>
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </p>
          </div>
        ) : isImageOnlyMessage() ? (
          <div className="relative">
            <img
              src={getImageUrl() || ''}
              alt="Shared image"
              className="rounded-2xl max-w-[280px] max-h-[320px] object-cover cursor-pointer hover:opacity-95 transition-opacity shadow-sm"
              onClick={() => window.open(getImageUrl() || '', '_blank')}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = `
                  <div class="flex items-center space-x-2 p-3 bg-muted rounded-2xl border text-muted-foreground">
                    <span>🖼️ Image unavailable</span>
                  </div>
                `;
              }}
            />
            <p className={`text-xs mt-1 ${isOwn ? 'text-right' : 'text-left'} text-muted-foreground`}>
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </p>
          </div>
        ) : isEmojiOnlyMessage() ? (
          /* Emoji-only message - large emoji without bubble like Facebook Messenger */
          <div className={`relative ${isOwn ? 'text-right' : 'text-left'}`}>
            <EmojiText 
              text={message.content || ''} 
              emojiSize={64}
              className="leading-none inline-block"
            />
            <p className={`text-xs mt-1 text-muted-foreground`}>
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </p>
          </div>
        ) : (
          /* Regular message bubble */
          <div
            className={cn(
              "relative px-4 py-2 rounded-2xl shadow-sm",
              isOwn
                ? `${themeClass} text-white rounded-br-md`
                : 'bg-card border border-border rounded-bl-md'
            )}
          >
            {/* Reply reference - Facebook Messenger style */}
            {message.reply_to && (
              <div className="mb-2">
                {/* "You replied to" header */}
                <p className={cn(
                  "text-[11px] mb-1 flex items-center gap-1",
                  isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  <Reply className="h-3 w-3" />
                  {isOwn ? 'You replied to ' : 'Replied to '}
                  <span className="font-medium">
                    {message.reply_to.sender_profile?.display_name || 'a message'}
                  </span>
                </p>
                {/* Quoted message preview - with image thumbnail support */}
                {(() => {
                  const replyImageUrl = message.reply_to.image_url || 
                    (message.reply_to.media_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(message.reply_to.media_url) ? message.reply_to.media_url : null) ||
                    (message.reply_to.attachment_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(message.reply_to.attachment_url) ? message.reply_to.attachment_url : null);
                  
                  const handleScrollToReply = () => {
                    if (message.reply_to?.id && onScrollToMessage) {
                      onScrollToMessage(message.reply_to.id);
                    }
                  };
                  
                  if (replyImageUrl) {
                    return (
                      <div 
                        className={cn(
                          "rounded-lg overflow-hidden max-w-[80px] cursor-pointer hover:opacity-80 transition-opacity",
                          isOwn ? "bg-primary-foreground/15" : "bg-muted/70"
                        )}
                        onClick={handleScrollToReply}
                      >
                        <img 
                          src={replyImageUrl}
                          alt="Reply image"
                          className="w-full h-[60px] object-cover"
                        />
                        {message.reply_to.content && (
                          <p className={cn(
                            "truncate px-2 py-1 text-xs",
                            isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}>
                            {message.reply_to.content}
                          </p>
                        )}
                      </div>
                    );
                  }
                  
                  return (
                    <div 
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-xs cursor-pointer hover:opacity-80 transition-opacity",
                        isOwn ? "bg-primary-foreground/15" : "bg-muted/70"
                      )}
                      onClick={handleScrollToReply}
                    >
                      <p className={cn(
                        "truncate max-w-[200px]",
                        isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}>
                        {message.reply_to.content || 'Attachment 📎'}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Sticker message */}
            {(message.is_sticker || message.message_type === 'sticker') && (message.sticker_url || message.content) ? (
              <div className="flex justify-center p-1">
                <img 
                  src={message.sticker_url || message.content}
                  alt="Sticker"
                  className="w-[100px] h-[100px] object-contain rounded-lg hover:scale-110 transition-transform duration-200 cursor-pointer"
                  loading="lazy"
                  onClick={() => {
                    // Optional: Could add sticker enlargement on click
                  }}
                />
              </div>
            ) : (message.is_gif || message.message_type === 'gif') && message.gif_url ? (
              /* GIF message */
              <div className="flex justify-center p-1">
                <video
                  src={message.gif_url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="max-w-[250px] max-h-[200px] rounded-xl object-contain cursor-pointer hover:scale-105 transition-transform duration-200"
                  onClick={() => {
                    // Optional: Could add GIF enlargement on click
                  }}
                  onError={(e) => {
                    // Fallback to img if video fails
                    const target = e.target as HTMLVideoElement;
                    const img = document.createElement('img');
                    img.src = message.gif_url || '';
                    img.className = target.className;
                    img.alt = 'GIF';
                    target.parentNode?.replaceChild(img, target);
                  }}
                />
              </div>
            ) : (
              <>
                {/* Text content */}
                {message.content && (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    <EmojiText
                      text={message.content}
                      emojiSize={18}
                      className={isOwn ? 'text-primary-foreground' : 'text-foreground'}
                    />
                  </div>
                )}

                {/* Audio content */}
                {message.audio_path && (
                  <div className="mt-2 max-w-xs">
                    <Card className={cn("p-3", isOwn ? "bg-primary-foreground/10" : "bg-muted/50")}>
                    <div className="flex items-center space-x-3">
                      {/* Play/Pause Button */}
                      <Button
                        onClick={handlePlayPause}
                        disabled={loadingAudio || !!audioError}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-10 w-10 rounded-full",
                          isOwn ? "bg-primary-foreground/20 hover:bg-primary-foreground/30" : "bg-primary/10 hover:bg-primary/20"
                        )}
                      >
                        {loadingAudio ? (
                          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                        ) : isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>

                      {/* Audio Progress */}
                      <div className="flex-1 space-y-1">
                        {audioUrl && !audioError && (
                          <>
                            <audio
                              ref={audioRef}
                              src={audioUrl}
                              preload="metadata"
                              className="hidden"
                            />
                            <div
                              className={cn(
                                "h-2 rounded-full cursor-pointer",
                                isOwn ? "bg-primary-foreground/20" : "bg-muted-foreground/20"
                              )}
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clickX = e.clientX - rect.left;
                                const newTime = (clickX / rect.width) * duration;
                                handleSeek(newTime);
                              }}
                            >
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  isOwn ? "bg-primary-foreground" : "bg-primary"
                                )}
                                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                              />
                            </div>
                            <div className={cn(
                              "flex justify-between text-xs",
                              isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                            )}>
                              <span>{formatAudioTime(currentTime)}</span>
                              <span>{formatAudioTime(duration || message.audio_duration || 0)}</span>
                            </div>
                          </>
                        )}
                        
                        {audioError && (
                          <div className="text-xs text-destructive">
                            {audioError}
                            <Button
                              onClick={loadAudioUrl}
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 ml-2 text-xs underline"
                            >
                              Retry
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Volume indicator */}
                      <Volume2 className={cn("h-4 w-4", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")} />
                    </div>
                  </Card>
                </div>
              )}

              {/* Media content */}
              {renderMediaContent()}
            </>
          )}

          {/* Reactions display */}
          {reactions.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {/* Group reactions by type and count */}
              {Object.entries(
                reactions.reduce((acc, r) => {
                  acc[r.reaction] = (acc[r.reaction] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([reactionKey, count]) => {
                const userReacted = reactions.some(r => r.reaction === reactionKey && r.user_id === currentUserId);
                return (
                  <button
                    key={reactionKey}
                    onClick={() => onReact?.(message.id, reactionKey)}
                    className={cn(
                      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors",
                      userReacted 
                        ? "bg-primary/20 border border-primary/40" 
                        : "bg-muted hover:bg-muted/80 border border-border"
                    )}
                  >
                    <StaticReactionIcon
                      reactionKey={reactionKey}
                      size="sm"
                      count={count}
                      isActive={userReacted}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {/* Timestamp - always show but smaller for stickers/GIFs */}
          <p
            className={`text-xs mt-1 flex items-center gap-1 ${
              (message.is_sticker || message.message_type === 'sticker' || message.is_gif || message.message_type === 'gif') ? 'text-center justify-center' : ''
            } ${
              isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
            }`}
          >
            {isVanishing && <Flame className="h-3 w-3 text-orange-400" />}
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </p>
          </div>
        )}
      </div>

      {/* Message Actions */}
      {showActions && (
        <div className={`flex items-center space-x-1 ${isOwn ? 'mr-2' : 'ml-2'}`}>
          <MessageReactionPicker 
            onReact={(reactionKey) => onReact?.(message.id, reactionKey)}
            selectedReactionKey={currentUserReactionKey}
          />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onReply?.(message)}
            title="Reply"
          >
            <Reply className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onForward?.(message)}
            title="Forward"
          >
            <Forward className="h-4 w-4" />
          </Button>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity data-[state=open]:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align={isOwn ? "end" : "start"} 
              className="min-w-[140px] z-[100] bg-popover border border-border shadow-lg"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              {isOwn && (
                <DropdownMenuItem 
                  onClick={() => onDelete?.(message.id)}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </DropdownMenuItem>
              )}
              {onForward && (
                <DropdownMenuItem 
                  onClick={() => onForward(message)}
                  className="cursor-pointer"
                >
                  <Forward className="h-4 w-4 mr-2" />
                  Forward
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                onClick={() => onPin?.(message.id)}
                className="cursor-pointer"
              >
                <Pin className="h-4 w-4 mr-2" />
                {isPinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              {!isOwn && (
                <DropdownMenuItem 
                  onClick={() => onReport?.(message)}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Flag className="h-4 w-4 mr-2" />
                  Report
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};