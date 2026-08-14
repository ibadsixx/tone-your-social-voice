import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Send, Image, X, Paperclip, Mic, Reply, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useAutoUpload } from '@/hooks/useAutoUpload';
import { useStatusVisibility } from '@/hooks/useStatusVisibility';
import { EmojiPickerPanel } from '@/components/EmojiPicker';
import { Emoji } from '@/components/Emoji';
import { EmojiAsset, normalizeEmojiToUnicode } from '@/components/EmojiAsset';
import { MessageRecorder } from './MessageRecorder';
import { StickerPicker } from './StickerPicker';
import { GifPicker } from './GifPicker';
import { GifItem } from '@/hooks/useGifSearch';
import { AudioRecording } from '@/hooks/useAudioRecorder';
import { gateway } from '@/lib/gateway';
import { v4 as uuidv4 } from 'uuid';

export interface ReplyToMessage {
  id: string;
  content?: string;
  sender_profile?: {
    display_name: string;
  };
}

interface MessageInputProps {
  onSendMessage: (content?: string, mediaUrl?: string, replyToId?: string) => void;
  onSendAudioMessage?: (audioPath: string, duration: number, mimeType: string, fileSize: number) => void;
  onSendGif?: (gif: GifItem) => void;
  conversationId?: string;
  disabled?: boolean;
  placeholder?: string;
  replyTo?: ReplyToMessage | null;
  onCancelReply?: () => void;
  /** Conversation-level quick emoji code (e.g., "1f44c" or "1f970") or Unicode emoji */
  quickEmoji?: string;
  vanishing?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onSendAudioMessage,
  onSendGif,
  conversationId,
  disabled = false,
  placeholder = "Type a message...",
  replyTo,
  onCancelReply,
  quickEmoji,
  vanishing = false
}) => {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const stickerPickerRef = useRef<HTMLDivElement>(null);
  const emojiAnchorRef = useRef<HTMLDivElement>(null);
  const stickerAnchorRef = useRef<HTMLDivElement>(null);
  const { uploadFile, uploading } = useFileUpload();
  const { upload: autoUpload } = useAutoUpload();
  const { disableAutoUploads } = useStatusVisibility();

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (stickerPickerRef.current && !stickerPickerRef.current.contains(event.target as Node)) {
        setShowStickerPicker(false);
      }
    };

    if (showEmojiPicker || showStickerPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker, showStickerPicker]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }
  }, [message]);

  const handleEmojiSelect = (emoji: { url: string; name: string; emoji?: string }) => {
    const input = inputRef.current;
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const token = emoji.emoji || '🙂';
    const newMessage = message.slice(0, start) + token + message.slice(end);

    setMessage(newMessage);
    setShowEmojiPicker(false);

    // Set cursor position after the inserted emoji
    setTimeout(() => {
      const newPosition = start + token.length;
      input.setSelectionRange(newPosition, newPosition);
      input.focus();
    }, 0);
  };

  const toggleEmojiPicker = () => {
    setShowEmojiPicker(!showEmojiPicker);
    setShowStickerPicker(false);
    setShowGifPicker(false);
  };

  const handleStickerSent = () => {
    setShowStickerPicker(false);
  };

  const handleGifSelect = (gif: GifItem) => {
    if (onSendGif) {
      onSendGif(gif);
    }
    setShowGifPicker(false);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      // Create preview URL
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }

      if (!disableAutoUploads) {
        autoUpload([file]);
      }
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!message.trim() && !selectedFile) return;

    let mediaUrl: string | null = null;

    // Upload file if selected
    if (selectedFile) {
      mediaUrl = await uploadFile(selectedFile, 'chat_media');
      if (!mediaUrl) {
        // Upload failed, don't send message
        return;
      }
    }

    // Send message with optional reply reference
    onSendMessage(message.trim() || undefined, mediaUrl || undefined, replyTo?.id);

    // Clear form and reply
    setMessage('');
    clearSelectedFile();
    onCancelReply?.();
  };

  const handleQuickEmojiSend = () => {
    const unicode = normalizeEmojiToUnicode(quickEmoji || '👌');
    if (!unicode) return;
    onSendMessage(unicode, undefined, replyTo?.id);
    onCancelReply?.();
  };

  const handleSendAudio = async (recording: AudioRecording) => {
    if (!onSendAudioMessage || !conversationId) {
      console.error('Missing audio message handler or conversation ID');
      return;
    }

    setUploadingAudio(true);
    try {
      // Generate unique file path
      const fileExtension = recording.blob.type.includes('webm') ? 'webm' : 
                           recording.blob.type.includes('ogg') ? 'ogg' : 'mp3';
      const fileName = `${uuidv4()}.${fileExtension}`;
      const filePath = `message_audios/${conversationId}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await gateway.storage
        .from('message_audios')
        .upload(filePath, recording.blob, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Send audio message
      await onSendAudioMessage(
        filePath,
        recording.duration,
        recording.blob.type,
        recording.blob.size
      );

      // Clean up
      URL.revokeObjectURL(recording.url);
      setShowVoiceRecorder(false);
    } catch (error) {
      console.error('Error sending audio message:', error);
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const isImage = selectedFile?.type.startsWith('image/');
  const isVideo = selectedFile?.type.startsWith('video/');

  // Position a portal-rendered picker relative to its anchor, clamped to the viewport
  const getPortalStyle = (
    anchor: HTMLElement | null,
    width: number,
    height: number
  ): React.CSSProperties | undefined => {
    if (!anchor) return undefined;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const style: React.CSSProperties = { position: 'fixed', zIndex: 50 };
    // Horizontal: align the right edge to the anchor, but keep it fully on-screen
    if (rect.right - width < 8) {
      style.left = 8;
    } else {
      style.right = vw - rect.right;
    }
    // Vertical: open above the anchor when there's room, otherwise below
    if (rect.top > height + 60) {
      style.bottom = vh - rect.top + 8;
    } else {
      style.top = rect.bottom + 8;
    }
    return style;
  };

  // Show voice recorder if active
  if (showVoiceRecorder) {
    return (
      <div className={cn(
        "border-t p-4 transition-colors duration-500",
        vanishing ? "border-zinc-700/50 bg-zinc-900/50" : "border-border bg-card"
      )}>
        <MessageRecorder
          onSendAudio={handleSendAudio}
          onCancel={() => setShowVoiceRecorder(false)}
          disabled={disabled || uploadingAudio}
        />
      </div>
    );
  }

  return (
    <div className={cn(
      "border-t p-4 space-y-3 relative transition-colors duration-500",
      vanishing ? "border-zinc-700/50 bg-zinc-900/50" : "border-border bg-card"
    )}>
      {/* Reply Preview */}
      {replyTo && (
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border-l-4 border-primary">
          <Reply className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary">
              Replying to {replyTo.sender_profile?.display_name || 'message'}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {replyTo.content || 'Media message'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelReply}
            className="h-6 w-6 p-0 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {selectedFile && previewUrl && (
        <Card className="p-3 bg-muted">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {isImage && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-12 h-12 object-cover rounded"
                />
              )}
              {isVideo && (
                <video
                  src={previewUrl}
                  className="w-12 h-12 object-cover rounded"
                  muted
                />
              )}
              {!isImage && !isVideo && (
                <div className="w-12 h-12 bg-accent rounded flex items-center justify-center">
                  <Paperclip className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelectedFile}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Message Input */}
      <div className="flex flex-wrap items-end gap-2">
        {/* Action Buttons Group - Messenger Style */}
        {!isFocused && (
        <div ref={stickerAnchorRef} className="relative flex items-center gap-1 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVoiceRecorder(true)}
            disabled={disabled || uploading}
            className={cn(
              "h-7 w-7 p-0 rounded-full transition-colors",
              vanishing
                ? "text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-100"
                : "text-primary hover:bg-primary/10"
            )}
            title="Record voice message"
          >
            <Mic className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className={cn(
              "h-7 w-7 p-0 rounded-full transition-colors",
              vanishing
                ? "text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-100"
                : "text-primary hover:bg-primary/10"
            )}
            title="Send photo"
          >
            <Image className="h-3.5 w-3.5" />
          </Button>
        </div>
        )}

        {/* Text Input + Send (kept together so the send button never wraps) */}
        <div className={cn(
          "flex flex-1 items-end gap-2",
          isFocused ? "min-w-[200px] md:min-w-[260px]" : "min-w-[160px]"
        )}>
        <div ref={emojiAnchorRef} className="flex-1 min-w-0 relative flex items-center">
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled || uploading}
            className={cn(
              "min-h-[32px] max-h-[100px] resize-none py-1.5 pr-10 overflow-y-auto scrollbar-none transition-colors",
              vanishing
                ? "bg-zinc-800 border-zinc-600 text-zinc-100 placeholder:text-zinc-500"
                : ""
            )}
            rows={1}
          />

          {/* Emoji Picker Button inside text input */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleEmojiPicker}
            disabled={disabled || uploading}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 transition-colors",
              vanishing ? "hover:bg-zinc-700 text-zinc-400" : "hover:bg-muted"
            )}
            title="Emoji"
          >
            <Emoji url="/emoji/1f600.png" alt="Emoji" size={20} />
          </Button>

          {/* Emoji Picker Panel (no internal trigger button) */}
          {showEmojiPicker && createPortal(
            <div
              ref={emojiPickerRef}
              className="fixed"
              style={getPortalStyle(emojiAnchorRef.current, 320, 380)}
            >
              <EmojiPickerPanel
                onEmojiSelect={handleEmojiSelect}
                onOpenStickers={() => {
                  setShowEmojiPicker(false);
                  setShowStickerPicker(true);
                }}
                onOpenGifs={() => {
                  setShowEmojiPicker(false);
                  setShowGifPicker(true);
                }}
              />
            </div>,
            document.body
          )}
        </div>

        {/* Send / Quick Emoji Button (Messenger-style) */}
        {(() => {
          const hasContent = !!message.trim() || !!selectedFile;
          return (
            <Button
              onClick={hasContent ? handleSend : handleQuickEmojiSend}
              disabled={disabled || uploading || (hasContent && !message.trim() && !selectedFile)}
              size="sm"
              className={cn(
                "h-8 w-8 p-0 shrink-0 transition-colors",
                vanishing && "bg-orange-600 hover:bg-orange-500"
              )}
              title={hasContent ? 'Send' : 'Send quick emoji'}
            >
              {hasContent ? (
                <Send className={cn("h-3.5 w-3.5", vanishing && "text-white")} />
              ) : (
                <EmojiAsset emoji={quickEmoji || '👌'} alt="Quick emoji" size={16} />
              )}
            </Button>
          );
        })()}
        </div>
      </div>

      {/* Sticker Picker */}
      {showStickerPicker && conversationId && createPortal(
        <div
          ref={stickerPickerRef}
          className="fixed"
          style={getPortalStyle(stickerAnchorRef.current, 320, 384)}
        >
          <StickerPicker
            conversationId={conversationId}
            onClose={() => setShowStickerPicker(false)}
            onStickerSent={handleStickerSent}
          />
        </div>,
        document.body
      )}

      {/* GIF Picker */}
      <GifPicker
        open={showGifPicker}
        onOpenChange={setShowGifPicker}
        onSelectGif={handleGifSelect}
      />

      {/* Status */}
      {vanishing && (
        <div className="flex items-center justify-center gap-1.5">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
          <Flame className="h-3 w-3 text-orange-400 animate-pulse" />
          <span className="text-[10px] text-zinc-500 tracking-wide uppercase">Vanish Mode</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
        </div>
      )}
      {uploading && (
        <p className={cn("text-xs transition-colors", vanishing ? "text-zinc-400" : "text-muted-foreground")}>Uploading file...</p>
      )}
      {uploadingAudio && (
        <p className={cn("text-xs transition-colors", vanishing ? "text-zinc-400" : "text-muted-foreground")}>Uploading voice message...</p>
      )}
    </div>
  );
};