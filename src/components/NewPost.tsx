import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ImageIcon, 
  VideoIcon, 
  PlayCircle, 
  MoreHorizontal,
  MapPin,
  Smile,
  Tag,
  Clock,
  Users,
  Send,
  X,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useStatusVisibility } from '@/hooks/useStatusVisibility';
import { useAutoUpload } from '@/hooks/useAutoUpload';
import { useHasActiveStories } from '@/hooks/useHasActiveStories';
import { usePageSwitch } from '@/contexts/PageSwitchContext';
import { cn } from '@/lib/utils';
import TagPeopleModal from './TagPeopleModal';
import TaggedUserChip from './TaggedUserChip';
import MentionAutocomplete from './MentionAutocomplete';
import { AudienceSelector, AudienceSummary, type AudienceSelection } from './AudienceSelector';
import { useAudience } from '@/hooks/useAudience';
import { FeelingPicker, FeelingData } from './FeelingPicker';
import { FeelingChip } from './FeelingChip';
import SchedulePostModal from './SchedulePostModal';
import { LocationSelector } from './LocationSelector';
import { LocationChip } from './LocationChip';
import { LocationData } from '@/hooks/useLocation';
import { EmojiPicker } from './EmojiPicker';
import { useMentions } from '@/hooks/useMentions';
import CreateReelDialog from './CreateReelDialog';

interface TaggedUser {
  id: string;
  display_name: string;
  username: string;
  profile_pic: string | null;
}

interface MediaUpload {
  url: string;
  mediaType: 'image' | 'video';
}

interface NewPostProps {
  onCreatePost?: (content: string, media?: File[], taggedUsers?: TaggedUser[], audience?: AudienceSelection, feeling?: FeelingData, scheduledAt?: Date, location?: LocationData, preUploadedMedia?: MediaUpload[]) => Promise<string | undefined>;
  className?: string;
  autoExpand?: boolean;
  audience?: AudienceSelection;
  onAudienceChange?: (audience: AudienceSelection) => void;
  stickyFooter?: boolean;
}

const NewPost = ({ onCreatePost, className, autoExpand, audience: externalAudience, onAudienceChange, stickyFooter }: NewPostProps) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { actingPage } = usePageSwitch();
  const { audienceToDbFormat } = useAudience();
  const { saveMentionsAndHashtags } = useMentions();
  const [content, setContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [mediaItems, setMediaItems] = useState<{ file: File; localUrl: string; url?: string; mediaType: 'image' | 'video'; status: 'uploading' | 'done' | 'error' }[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const [internalAudience, setInternalAudience] = useState<AudienceSelection>({ type: 'friends' });
  const audience = externalAudience ?? internalAudience;
  const setAudience = onAudienceChange ?? setInternalAudience;
  const [showAudienceSelector, setShowAudienceSelector] = useState(false);
  const [feeling, setFeeling] = useState<FeelingData | null>(null);
  const [showFeelingPicker, setShowFeelingPicker] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [showReelDialog, setShowReelDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { disableAutoUploads } = useStatusVisibility();
  const { upload: autoUpload } = useAutoUpload();
  const hasActiveStories = useHasActiveStories(user?.id);

  useEffect(() => {
    if (autoExpand) {
      setIsExpanded(true);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [autoExpand]);

  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cardRef.current && !cardRef.current.contains(target)) {
        if ((target as Element)?.closest?.('[role="dialog"], [role="presentation"], [data-radix-popper-content-wrapper]')) return;
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isExpanded]);

  const handleFileSelect = (files: FileList | null, _type: 'image' | 'video') => {
    if (!files) return;
    
    const newFiles = Array.from(files);
    if (newFiles.length === 0) return;

    const items: typeof mediaItems = [];

    for (const file of newFiles) {
      const isVideo = file.type.startsWith('video/');
      const mediaType = isVideo ? 'video' : 'image';
      const localUrl = URL.createObjectURL(file);
      items.push({ file, localUrl, mediaType, status: 'uploading' });
    }

    setMediaItems(prev => [...prev, ...items]);
    setSelectedFiles(prev => [...prev, ...newFiles]);

    if (!disableAutoUploads) {
      autoUpload(newFiles);
    }

    for (const item of items) {
      const isVideo = item.mediaType === 'video';
      const bucket = isVideo ? 'stories' : 'avatars';
      const fileExt = item.file.name.split('.').pop()?.toLowerCase() || 'bin';
      const fileName = `${user?.id || 'unknown'}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

      supabase.storage
        .from(bucket)
        .upload(fileName, item.file, { contentType: item.file.type })
        .then(({ error }) => {
          if (error) {
            console.error('Upload failed:', error);
            setMediaItems(prev => prev.map(m => m.localUrl === item.localUrl ? { ...m, status: 'error' } : m));
            return;
          }

          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
          if (urlData?.publicUrl) {
            setMediaItems(prev => prev.map(m => m.localUrl === item.localUrl ? { ...m, url: urlData.publicUrl, status: 'done' } : m));
          }
        });
    }
  };

  const removeFile = (index: number) => {
    setMediaItems(prev => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.localUrl);
      return prev.filter((_, i) => i !== index);
    });
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    setContent(value);
    setCursorPosition(cursorPos);
    
    // Check for @ mentions
    const beforeCursor = value.slice(0, cursorPos);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      const query = mentionMatch[1];
      setMentionQuery(query);
      
      // Calculate position for autocomplete
      if (textareaRef.current) {
        const textarea = textareaRef.current;
        const rect = textarea.getBoundingClientRect();
        const textBeforeCursor = beforeCursor;
        const lines = textBeforeCursor.split('\n');
        const lastLine = lines[lines.length - 1];
        
        // Rough calculation for position
        const lineHeight = 24;
        const charWidth = 8;
        const top = rect.top + (lines.length - 1) * lineHeight + lineHeight + 5;
        const left = rect.left + (lastLine.length - query.length - 1) * charWidth;
        
        setMentionPosition({ top, left });
        setShowMentionAutocomplete(true);
      }
    } else {
      setShowMentionAutocomplete(false);
      setMentionQuery('');
    }
  }, []);

  const handleMentionSelect = (friend: TaggedUser) => {
    if (!textareaRef.current) return;
    
    const beforeCursor = content.slice(0, cursorPosition);
    const afterCursor = content.slice(cursorPosition);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      const beforeMention = beforeCursor.slice(0, -mentionMatch[0].length);
      const newContent = `${beforeMention}@${friend.display_name} ${afterCursor}`;
      
      setContent(newContent);
      
      // Add to tagged users if not already tagged
      if (!taggedUsers.some(user => user.id === friend.id)) {
        setTaggedUsers(prev => [...prev, friend]);
      }
    }
    
    setShowMentionAutocomplete(false);
    setMentionQuery('');
    textareaRef.current?.focus();
  };

  const handleEmojiSelect = (emoji: { url: string; name: string; emoji?: string }) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    const emojiChar = emoji.emoji || '🙂';
    const beforeCursor = content.slice(0, start);
    const afterCursor = content.slice(end);
    const newContent = beforeCursor + emojiChar + afterCursor;
    
    setContent(newContent);
    
    // Set cursor position after the inserted emoji
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        const newPos = start + emojiChar.length;
        textarea.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const removeTaggedUser = (userId: string) => {
    setTaggedUsers(prev => prev.filter(user => user.id !== userId));
    
    // Also remove mentions from content
    const userToRemove = taggedUsers.find(user => user.id === userId);
    if (userToRemove) {
      const mentionPattern = new RegExp(`@${userToRemove.display_name}`, 'g');
      setContent(prev => prev.replace(mentionPattern, ''));
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && mediaItems.length === 0) return;
    
    setIsCreating(true);
    try {
      const postId = await onCreatePost?.(content, selectedFiles, taggedUsers, audience, feeling || undefined, scheduledAt || undefined, location || undefined, mediaItems.filter(m => m.url).map(m => ({ url: m.url!, mediaType: m.mediaType })));
      
      // Save mentions and hashtags if post was created successfully
      if (postId && typeof postId === 'string') {
        await saveMentionsAndHashtags('post', postId, content);
      }
      
      setContent('');
      setSelectedFiles([]);
      setMediaItems([]);
      setTaggedUsers([]);
      setAudience({ type: 'friends' });
      setFeeling(null);
      setScheduledAt(null);
      setLocation(null);
      setIsExpanded(false);
      setShowMoreOptions(false);
    } catch (error) {
      console.error('Error creating post:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSchedule = (scheduledDate: Date) => {
    setScheduledAt(scheduledDate);
    setShowScheduleModal(false);
  };

  const clearSchedule = () => {
    setScheduledAt(null);
  };

  const moreOptions = [
    { icon: MapPin, label: 'Add location', color: 'text-red-500', onClick: () => setShowLocationSelector(true) },
    { icon: Smile, label: 'Feeling/Activity', color: 'text-yellow-500', onClick: () => setShowFeelingPicker(true) },
    { icon: Tag, label: 'Tag people', color: 'text-blue-500', onClick: () => setShowTagModal(true) },
    { icon: Clock, label: 'Schedule post', color: 'text-green-500', onClick: () => setShowScheduleModal(true) },
    { icon: Users, label: 'Audience', color: 'text-purple-500', onClick: () => setShowAudienceSelector(true) },
  ];

  return (
    <motion.div
      layout
      ref={cardRef}
      className={cn("w-full max-w-2xl mx-auto", className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-border/50 shadow-lg backdrop-blur-sm bg-card/95">
        <CardContent className="p-4 md:p-6">
          {/* Header with Avatar */}
          <div className="flex items-start space-x-3 md:space-x-4 mb-3 md:mb-4">
            {hasActiveStories ? (
              <div className="p-[3px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
                <Avatar className="w-10 h-10 md:w-12 md:h-12 border-4 border-background ring-0">
                  <AvatarImage src={actingPage?.profile_pic || profile?.profile_pic || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {actingPage ? actingPage.name.charAt(0).toUpperCase() : profile?.display_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            ) : (
              <Avatar className="w-10 h-10 md:w-12 md:h-12 border-2 border-primary/20">
                <AvatarImage src={actingPage?.profile_pic || profile?.profile_pic || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {actingPage ? actingPage.name.charAt(0).toUpperCase() : profile?.display_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            )}
            
            <div className="flex-1">
              <motion.div layout className="relative">
                <Textarea
                  ref={textareaRef}
                  placeholder="What's on your mind?"
                  value={content}
                  onChange={handleContentChange}
                  onFocus={() => setIsExpanded(true)}
                  onBlur={(e) => {
                    const relatedTarget = e.relatedTarget as Node;
                    if (cardRef.current && relatedTarget && !cardRef.current.contains(relatedTarget)) {
                      setIsExpanded(false);
                    }
                  }}
                  className={cn(
                    "min-h-[44px] md:min-h-[60px] resize-none border-0 bg-transparent text-base pr-10",
                    "placeholder:text-muted-foreground focus-visible:ring-0 p-0",
                    isExpanded && "min-h-[100px] md:min-h-[120px]"
                  )}
                />
                {/* Emoji Picker Button */}
                <div className="absolute right-2 top-2">
                  <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                </div>
              </motion.div>
            </div>
          </div>

          {/* Tagged Users */}
          <AnimatePresence>
            {taggedUsers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4"
              >
                <div className="flex flex-wrap gap-2">
                  {taggedUsers.map((user) => (
                    <TaggedUserChip
                      key={user.id}
                      user={user}
                      onRemove={removeTaggedUser}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feeling Display */}
          <AnimatePresence>
            {feeling && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4"
              >
                <FeelingChip
                  feeling={feeling}
                  onEdit={() => setShowFeelingPicker(true)}
                  onRemove={() => setFeeling(null)}
                  showControls={true}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Location Display */}
          <AnimatePresence>
            {location && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4"
              >
                <LocationChip
                  location={location}
                  onClick={() => setShowLocationSelector(true)}
                  onRemove={() => setLocation(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Schedule Display */}
          <AnimatePresence>
            {scheduledAt && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4"
              >
                <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm text-primary">
                    Scheduled for {new Date(scheduledAt).toLocaleDateString()} at {new Date(scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    onClick={clearSchedule}
                    className="ml-auto w-5 h-5 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center justify-center transition-colors"
                  >
                    <X className="w-3 h-3 text-primary" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selected Files Preview */}
          <AnimatePresence>
            {mediaItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4"
              >
                <div className="flex flex-wrap gap-2">
                  {mediaItems.map((item, index) => (
                    <motion.div
                      key={item.localUrl}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative group"
                    >
                      <div className="w-24 h-24 bg-muted rounded-lg overflow-hidden border relative">
                        {item.mediaType === 'image' ? (
                          <img
                            src={item.url || item.localUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="relative w-full h-full">
                            <video
                              src={item.url || item.localUrl}
                              className="w-full h-full object-cover"
                              preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <PlayCircle className="w-8 h-8 text-white" />
                            </div>
                          </div>
                        )}
                        {item.status === 'uploading' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          </div>
                        )}
                        {item.status === 'error' && (
                          <div className="absolute bottom-0 left-0 right-0 bg-destructive/80 text-destructive-foreground text-[10px] text-center py-0.5">
                            Upload failed
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Buttons - always visible */}
          <div className="space-y-4 pt-3 md:pt-4 border-t mt-3 md:mt-4">
            {/* Main Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 md:gap-2">
                {/* Photo/Video Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 h-8 md:h-9 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-xs md:text-sm font-medium"
                >
                  <ImageIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-600" />
                  <span className="hidden sm:inline">Photo/Video</span>
                  <span className="sm:hidden">Photo</span>
                </motion.button>

                {/* Reel Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowReelDialog(true)}
                  className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 h-8 md:h-9 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-xs md:text-sm font-medium"
                >
                  <PlayCircle className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-600" />
                  <span>Reel</span>
                </motion.button>

                {/* More Options Button */}
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowMoreOptions(!showMoreOptions)}
                    className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 h-8 md:h-9 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-xs md:text-sm font-medium"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />
                    <span>More</span>
                  </motion.button>

                  {/* More Options Dropdown */}
                  <AnimatePresence>
                    {showMoreOptions && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-0 mt-2 w-56 bg-popover border border-border rounded-lg shadow-lg z-50 p-2"
                      >
                        {moreOptions.map((option, index) => (
                          <motion.button
                            key={option.label}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.05 }}
                            onClick={() => {
                              option.onClick();
                              setShowMoreOptions(false);
                            }}
                            className="w-full flex items-center space-x-3 px-3 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
                          >
                            <option.icon className={cn("w-4 h-4", option.color)} />
                            <span className="text-sm">{option.label}</span>
                          </motion.button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Audience Summary & Post Button */}
              <div className="flex items-center gap-2 md:gap-3">
                {!externalAudience && (
                  <AudienceSummary 
                    audience={audience} 
                    className="cursor-pointer hover:bg-accent/50 px-1.5 md:px-2 py-1 rounded-md transition-colors text-xs md:text-sm"
                    onClick={() => setShowAudienceSelector(true)}
                  />
                )}
                {!stickyFooter && (
                  <Button
                    onClick={handleSubmit}
                    disabled={(!content.trim() && mediaItems.length === 0) || isCreating}
                    className="bg-primary hover:bg-primary/90 h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm"
                    size="sm"
                  >
                    {isCreating ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                      />
                    ) : (
                      <>
                        <Send className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                        {scheduledAt ? 'Schedule' : 'Post'}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Hidden File Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files, 'image')}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files, 'video')}
          />
        </CardContent>
      </Card>

      {stickyFooter && (
        <div className="sticky bottom-0 left-0 right-0 bg-background border-t px-4 py-3 z-10">
          <Button
            onClick={handleSubmit}
            disabled={(!content.trim() && mediaItems.length === 0) || isCreating}
            className="w-full bg-primary hover:bg-primary/90 h-11 text-sm font-semibold"
          >
            {isCreating ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {scheduledAt ? 'Schedule' : 'Post'}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Tag People Modal */}
      <TagPeopleModal
        open={showTagModal}
        onOpenChange={setShowTagModal}
        selectedUsers={taggedUsers}
        onUsersChange={setTaggedUsers}
      />

      {/* Mention Autocomplete */}
      <MentionAutocomplete
        show={showMentionAutocomplete}
        searchQuery={mentionQuery}
        position={mentionPosition}
        onSelect={handleMentionSelect}
        onClose={() => setShowMentionAutocomplete(false)}
      />

      {/* Audience Selector */}
      <AudienceSelector
        open={showAudienceSelector}
        onOpenChange={setShowAudienceSelector}
        onSelect={setAudience}
        currentSelection={audience}
      />

      {/* Feeling Picker */}
      <FeelingPicker
        open={showFeelingPicker}
        onOpenChange={setShowFeelingPicker}
        onSave={setFeeling}
        initialFeeling={feeling}
      />

      {/* Schedule Post Modal */}
      <SchedulePostModal
        open={showScheduleModal}
        onOpenChange={setShowScheduleModal}
        onSchedule={handleSchedule}
      />

      {/* Location Selector */}
      <LocationSelector
        open={showLocationSelector}
        onClose={() => setShowLocationSelector(false)}
        onSelect={(selectedLocation) => {
          // Check if this location is already selected (deduplication)
          if (location && (
            (location.provider_place_id && location.provider_place_id === selectedLocation.provider_place_id) ||
            (location.lat === selectedLocation.lat && location.lng === selectedLocation.lng)
          )) {
            // Location already selected, just close the dialog
            setShowLocationSelector(false);
            return;
          }

          // Ensure proper format with display_name using enhanced fallback logic
          const locationWithDisplayName = {
            ...selectedLocation,
            display_name: selectedLocation.display_name || selectedLocation.name || 
          (selectedLocation.city ? `${selectedLocation.city}${selectedLocation.region ? `, ${selectedLocation.region}` : ''}${selectedLocation.country ? `, ${selectedLocation.country}` : ''}` : 
                           selectedLocation.address || `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`)
          };
          setLocation(locationWithDisplayName);
          setShowLocationSelector(false);
        }}
        selectedLocation={location || undefined}
      />

      <CreateReelDialog
        open={showReelDialog}
        onOpenChange={setShowReelDialog}
        onSuccess={() => {
          // Refresh feed after reel is created
          window.location.reload();
        }}
      />
    </motion.div>
  );
};

export default NewPost;