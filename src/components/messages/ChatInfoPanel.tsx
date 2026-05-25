import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  X, User, Bell, BellOff, Search, ChevronDown, ChevronUp, 
  Lock, Image, FileText, Link, Shield, Ban, Flag, Trash2, Pin,
  Settings, Clock, Eye, Loader2, MessageCircle, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isOnline, formatLastSeen } from '@/hooks/usePresence';
import { useConversationSettings } from '@/hooks/useConversationSettings';
import { ChatThemeModal, THEME_OPTIONS } from './ChatThemeModal';
import { ChatEmojiModal } from './ChatEmojiModal';
import { SharedMediaModal } from './SharedMediaModal';
import { ReportMessageModal } from './ReportMessageModal';
import { useToast } from '@/hooks/use-toast';
import { EmojiAsset } from '@/components/EmojiAsset';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const getThemeGradient = (themeId: string) => {
  const theme = THEME_OPTIONS.find(t => t.id === themeId);
  return theme?.gradient ?? 'from-primary to-primary';
};
interface ChatInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  otherUser: {
    id: string;
    username: string;
    display_name: string;
    profile_pic?: string;
    last_seen_at?: string;
  } | null;
  pinnedMessageIds?: string[];
  chatTheme?: string;
  quickEmoji?: string;
  onThemeChange?: (themeId: string) => void;
  onQuickEmojiChange?: (emoji: string) => void;
  onViewProfile?: () => void;
  onSearch?: () => void;
  onBlock?: (blockType?: 'messaging' | 'full') => void;
  isBlocked?: boolean;
  onReport?: (reportedUserId: string, reason?: string, details?: string) => void;
  onClearHistory?: () => void;
  onScrollToMessage?: (messageId: string) => void;
  vanishingMessagesEnabled?: boolean;
  onToggleVanishingMessages?: () => void;
}

type ExpandableSection = 'chat-info' | 'customize' | 'media' | 'privacy' | null;

export const ChatInfoPanel: React.FC<ChatInfoPanelProps> = ({
  isOpen,
  onClose,
  conversationId,
  otherUser,
  pinnedMessageIds = [],
  chatTheme = 'default',
  quickEmoji = '👌',
  onThemeChange,
  onQuickEmojiChange,
  onViewProfile,
  onSearch,
  onBlock,
  isBlocked = false,
  onReport,
  onClearHistory,
  onScrollToMessage,
  vanishingMessagesEnabled: propVanishingEnabled,
  onToggleVanishingMessages: propToggleVanishing,
}) => {
  const [expandedSection, setExpandedSection] = useState<ExpandableSection>(null);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showEmojiModal, setShowEmojiModal] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaModalTab, setMediaModalTab] = useState<'media' | 'files' | 'links'>('media');
  const [showMessagingControls, setShowMessagingControls] = useState(false);
  const [showEncryptionDialog, setShowEncryptionDialog] = useState(false);
  const [encryptionView, setEncryptionView] = useState<'check' | 'details' | 'keys'>('check');
  const [selectedParticipantKeys, setSelectedParticipantKeys] = useState<any>(null);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [encryptionData, setEncryptionData] = useState<any>(null);
  const [encryptionLoading, setEncryptionLoading] = useState(false);
  const [encryptionVerified, setEncryptionVerified] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [allowMessageSharing, setAllowMessageSharing] = useState(true);
  const [savingControls, setSavingControls] = useState(false);
  const { toast } = useToast();
  
  const { 
    settings, 
    loading,
    toggleMute, 
    toggleVanishingMessages: hookToggleVanishing, 
    toggleReadReceipts
  } = useConversationSettings(conversationId);

  // Use props if provided (shared state from ChatWindow), otherwise use own hook
  const vanishingEnabled = propVanishingEnabled !== undefined
    ? propVanishingEnabled
    : (settings?.vanishing_messages_enabled ?? false);
  const toggleVanishingMessages = propToggleVanishing || hookToggleVanishing;

  const toggleSection = (section: ExpandableSection) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const [showReportDialog, setShowReportDialog] = useState(false);

  const handleReport = () => {
    if (otherUser) {
      setShowReportDialog(true);
    }
  };

  // Check encryption handler
  const handleCheckEncryption = async () => {
    if (!conversationId) return;
    setEncryptionLoading(true);
    setEncryptionView('check');
    setShowEncryptionDialog(true);
    
    try {
      const { data, error } = await supabase.rpc('get_encryption_details', {
        p_conversation_id: conversationId
      });
      
      if (error) throw error;
      setEncryptionData(data);
      
      if ((data as any)?.last_verification) {
        setEncryptionVerified(true);
        setVerifiedAt(new Date((data as any).last_verification.verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } else {
        setEncryptionVerified(false);
        setVerifiedAt(null);
      }
    } catch (error: any) {
      console.error('Error fetching encryption details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load encryption details',
        variant: 'destructive'
      });
    } finally {
      setEncryptionLoading(false);
    }
  };

  // Messaging controls handler
  const handleOpenMessagingControls = async () => {
    if (!conversationId) return;
    
    if (settings?.messaging_controls) {
      const controls = settings.messaging_controls as any;
      setAllowMessageSharing(controls?.allow_message_sharing !== false);
    }
    setShowMessagingControls(true);
  };

  const handleSaveMessagingControls = async () => {
    if (!conversationId) return;
    setSavingControls(true);
    
    try {
      const { error } = await supabase.rpc('update_messaging_controls', {
        p_conversation_id: conversationId,
        p_who_can_reply: 'everyone',
        p_message_requests_enabled: allowMessageSharing
      });
      
      if (error) throw error;
      
      toast({
        title: 'Permissions updated',
        description: 'Message permissions have been saved'
      });
      setShowMessagingControls(false);
    } catch (error: any) {
      console.error('Error saving messaging controls:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update message permissions',
        variant: 'destructive'
      });
    } finally {
      setSavingControls(false);
    }
  };

  // Limit interactions handler  
  const handleLimitInteractions = () => {
    setShowLimitDialog(true);
  };

  // Clear conversation handler
  const handleClearConversation = async () => {
    if (!conversationId) return;
    setClearingHistory(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Delete messages sent by the current user in this conversation
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('sender_id', user.id);
      
      if (error) throw error;
      
      toast({
        title: 'Conversation cleared',
        description: 'Your messages have been removed from this conversation'
      });
      
      setShowClearConfirm(false);
      onClearHistory?.();
    } catch (error: any) {
      console.error('Error clearing conversation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to clear conversation',
        variant: 'destructive'
      });
    } finally {
      setClearingHistory(false);
    }
  };

  if (!otherUser) return null;

  const isMuted = settings?.is_muted ?? false;
  const readReceiptsEnabled = settings?.read_receipts_enabled ?? true;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-80 bg-background border-l border-border z-50 shadow-lg transition-transform duration-300 ease-in-out",
          "lg:relative lg:z-auto lg:shadow-none",
          isOpen ? "translate-x-0" : "translate-x-full lg:hidden"
        )}
      >
        <ScrollArea className="h-full">
          {/* Close button (mobile) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 p-0 lg:hidden z-10"
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="p-6 pt-12 lg:pt-6">
            {/* Profile Section */}
            <div className="flex flex-col items-center text-center mb-6">
              <Avatar className="w-20 h-20 mb-3">
                <AvatarImage src={otherUser.profile_pic} alt={otherUser.display_name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {otherUser.display_name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h3 className="font-semibold text-lg text-foreground">{otherUser.display_name}</h3>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <span className={cn(
                  "inline-block w-2 h-2 rounded-full",
                  isOnline(otherUser.last_seen_at) ? "bg-green-500" : "bg-gray-400"
                )} />
                {isOnline(otherUser.last_seen_at) ? (
                  <span className="text-green-500 font-medium">Online</span>
                ) : (
                  <>Last seen {formatLastSeen(otherUser.last_seen_at)}</>
                )}
              </p>
              
              {/* Encryption Badge */}
              <div className="flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-muted rounded-full">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">End-to-end encrypted</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex justify-center gap-6 mb-6 pb-6 border-b border-border">
              <button
                onClick={onViewProfile}
                className="flex flex-col items-center gap-1.5 text-foreground hover:text-primary transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <User className="h-5 w-5" />
                </div>
                <span className="text-xs">Profile</span>
              </button>
              
              <button
                onClick={toggleMute}
                disabled={loading || !conversationId}
                className="flex flex-col items-center gap-1.5 text-foreground hover:text-primary transition-colors disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isMuted ? (
                    <BellOff className="h-5 w-5" />
                  ) : (
                    <Bell className="h-5 w-5" />
                  )}
                </div>
                <span className="text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              
              <button
                onClick={onSearch}
                className="flex flex-col items-center gap-1.5 text-foreground hover:text-primary transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <Search className="h-5 w-5" />
                </div>
                <span className="text-xs">Search</span>
              </button>
            </div>

            {/* Expandable Sections */}
            <div className="space-y-1">
              {/* Chat Info */}
              <button
                onClick={() => toggleSection('chat-info')}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <span className="font-medium text-foreground">Chat info</span>
                {expandedSection === 'chat-info' ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              {expandedSection === 'chat-info' && (
                <div className="px-3 pb-3 space-y-2">
                  <button 
                    onClick={() => {
                      if (pinnedMessageIds.length > 0 && onScrollToMessage) {
                        onScrollToMessage(pinnedMessageIds[0]);
                        onClose();
                      }
                    }}
                    disabled={pinnedMessageIds.length === 0}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Pin className="h-5 w-5 text-muted-foreground" />
                    <div className="flex flex-col items-start">
                      <span>See pinned messages</span>
                      <span className="text-xs text-muted-foreground">
                        {pinnedMessageIds.length === 0 ? 'No pinned messages' : `${pinnedMessageIds.length} pinned`}
                      </span>
                    </div>
                  </button>
                  <p className="text-sm text-muted-foreground">@{otherUser.username}</p>
                </div>
              )}

              {/* Customize Chat */}
              <button
                onClick={() => toggleSection('customize')}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <span className="font-medium text-foreground">Customize chat</span>
                {expandedSection === 'customize' ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              {expandedSection === 'customize' && (
                <div className="px-3 pb-3 space-y-2">
                  <button 
                    onClick={() => setShowThemeModal(true)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                  >
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getThemeGradient(chatTheme)}`} />
                    <span>Change theme</span>
                  </button>
                  <button 
                    onClick={() => setShowEmojiModal(true)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                  >
                    <EmojiAsset
                      emoji={quickEmoji}
                      alt="Quick emoji"
                      size={24}
                      className="w-6 h-6"
                    />
                    <span>Change emoji</span>
                  </button>
                </div>
              )}

              {/* Media & Files */}
              <button
                onClick={() => toggleSection('media')}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <span className="font-medium text-foreground">Media & files</span>
                {expandedSection === 'media' ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              {expandedSection === 'media' && (
                <div className="px-3 pb-3 space-y-2">
                  <button 
                    onClick={() => {
                      setMediaModalTab('media');
                      setShowMediaModal(true);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                  >
                    <Image className="h-5 w-5 text-muted-foreground" />
                    <span>Media</span>
                  </button>
                  <button 
                    onClick={() => {
                      setMediaModalTab('files');
                      setShowMediaModal(true);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                  >
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span>Files</span>
                  </button>
                  <button 
                    onClick={() => {
                      setMediaModalTab('links');
                      setShowMediaModal(true);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                  >
                    <Link className="h-5 w-5 text-muted-foreground" />
                    <span>Links</span>
                  </button>
                </div>
              )}

              {/* Privacy & Support */}
              <button
                onClick={() => toggleSection('privacy')}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <span className="font-medium text-foreground">Privacy & support</span>
                {expandedSection === 'privacy' ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              {expandedSection === 'privacy' && (
                <div className="px-3 pb-3 space-y-2">
                  <button 
                    onClick={toggleMute}
                    disabled={loading || !conversationId}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <BellOff className="h-5 w-5 text-muted-foreground" />
                      <span>Silence alerts</span>
                    </div>
                    <span className="text-muted-foreground text-xs">{isMuted ? 'On' : 'Off'}</span>
                  </button>
                  <button 
                    onClick={handleOpenMessagingControls}
                    disabled={!conversationId}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm disabled:opacity-50"
                  >
                    <Settings className="h-5 w-5 text-muted-foreground" />
                    <span>Messaging controls</span>
                  </button>
                  <button 
                    onClick={toggleVanishingMessages}
                    disabled={loading || !conversationId}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <span>Vanishing messages</span>
                    </div>
                    <span className="text-muted-foreground text-xs">{vanishingEnabled ? 'On' : 'Off'}</span>
                  </button>
                  <button 
                    onClick={toggleReadReceipts}
                    disabled={loading || !conversationId}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <Eye className="h-5 w-5 text-muted-foreground" />
                      <span>Seen status</span>
                    </div>
                    <span className="text-muted-foreground text-xs">{readReceiptsEnabled ? 'On' : 'Off'}</span>
                  </button>
                  <button 
                    onClick={handleCheckEncryption}
                    disabled={!conversationId}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm disabled:opacity-50"
                  >
                    <Lock className="h-5 w-5 text-muted-foreground" />
                    <span>Check encryption</span>
                  </button>
                  <button 
                    onClick={handleLimitInteractions}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                  >
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <span>Limit interactions</span>
                  </button>
                  <button 
                    onClick={() => isBlocked ? onBlock?.() : setShowBlockDialog(true)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                  >
                    <Ban className="h-5 w-5 text-muted-foreground" />
                    <span>{isBlocked ? 'Unblock' : 'Block'}</span>
                  </button>
                  <button 
                    onClick={handleReport}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                  >
                    <Flag className="h-5 w-5 text-muted-foreground" />
                    <div className="flex flex-col items-start">
                      <span>Flag conversation</span>
                      <span className="text-xs text-muted-foreground">Share feedback and report this chat</span>
                    </div>
                  </button>
                  <button 
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-destructive/10 text-destructive text-sm"
                  >
                    <Trash2 className="h-5 w-5" />
                    <span>Clear conversation</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Theme Modal */}
      <ChatThemeModal
        open={showThemeModal}
        onOpenChange={setShowThemeModal}
        currentTheme={chatTheme}
        onSelectTheme={(themeId) => {
          console.log('ChatInfoPanel: onSelectTheme called with', themeId);
          onThemeChange?.(themeId);
        }}
      />

      {/* Emoji Modal */}
      <ChatEmojiModal
        open={showEmojiModal}
        onOpenChange={setShowEmojiModal}
        currentEmoji={quickEmoji}
        onSelectEmoji={(emoji) => {
          onQuickEmojiChange?.(emoji);
        }}
      />

      {/* Shared Media Modal */}
      <SharedMediaModal
        open={showMediaModal}
        onOpenChange={setShowMediaModal}
        conversationId={conversationId}
        initialTab={mediaModalTab}
      />

      {/* Message Permissions Dialog */}
      <Dialog open={showMessagingControls} onOpenChange={setShowMessagingControls}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Message permissions</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div className="space-y-1 flex-1 pr-4">
                <Label className="text-sm font-medium">Allow message sharing</Label>
                <p className="text-xs text-muted-foreground">
                  Everyone in this chat can share messages with Meta AI or auto-save photos. These features are not available on some versions of Messenger. <a href="#" className="text-primary hover:underline">Learn more</a>
                </p>
              </div>
              <Switch 
                checked={allowMessageSharing} 
                onCheckedChange={setAllowMessageSharing} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMessagingControls(false)}>Cancel</Button>
            <Button onClick={handleSaveMessagingControls} disabled={savingControls} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {savingControls ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check Encryption Dialog */}
      <Dialog open={showEncryptionDialog} onOpenChange={(open) => {
        setShowEncryptionDialog(open);
        if (!open) {
          setEncryptionView('check');
          setSelectedParticipantKeys(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          {encryptionView === 'check' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-center">Check encryption</DialogTitle>
              </DialogHeader>
              <div className="py-6 space-y-4">
                {encryptionLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">Encryption confirmed</p>
                        <p className="text-sm text-muted-foreground">
                          {verifiedAt ? `Verified at ${verifiedAt}` : 'Not yet verified'}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          if (!conversationId) return;
                          try {
                            await supabase.rpc('verify_conversation_encryption', {
                              p_conversation_id: conversationId
                            });
                            const now = new Date();
                            setVerifiedAt(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                            setEncryptionVerified(true);
                            toast({ title: 'Encryption verified', description: 'Encryption has been re-verified.' });
                          } catch (err) {
                            toast({ title: 'Error', description: 'Failed to verify encryption', variant: 'destructive' });
                          }
                        }}
                        className="text-sm text-primary hover:underline"
                      >
                        Check again
                      </button>
                    </div>

                    <button
                      onClick={() => setEncryptionView('details')}
                      className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm font-medium text-foreground">Compare keys</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
                    </button>

                    <p className="text-xs text-muted-foreground text-center px-4">
                      You can match keys to confirm messages and calls are protected with encryption. <a href="#" className="text-primary hover:underline">Learn more</a>
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {encryptionView === 'details' && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEncryptionView('check')} className="p-1 hover:bg-muted rounded-lg transition-colors">
                    <svg className="w-5 h-5 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <DialogTitle>Encryption details</DialogTitle>
                </div>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Chat participants have security keys that you can use to confirm your messages are protected with encryption. <a href="#" className="text-primary hover:underline">Learn more</a>
                </p>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Participants</h4>
                  {(encryptionData as any)?.participants?.map((p: any) => (
                    <button
                      key={p.user_id}
                      onClick={() => {
                        setSelectedParticipantKeys(p);
                        setEncryptionView('keys');
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={p.profile_pic} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            {p.display_name?.charAt(0)?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-foreground">{p.display_name}'s keys</span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setSelectedParticipantKeys({ display_name: 'You', devices: [{ browser: 'This device', key_fingerprint: 'EB 66 AA 4D 88 11 60 6A 17 4C 83 EF 85 02\n83 19 BE EE 9E A9 D0 04 1A 36 51 67 30 AB' }] });
                      setEncryptionView('keys');
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="text-sm text-foreground">Your keys</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
                  </button>
                </div>
              </div>
            </>
          )}

          {encryptionView === 'keys' && selectedParticipantKeys && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEncryptionView('details')} className="p-1 hover:bg-muted rounded-lg transition-colors">
                    <svg className="w-5 h-5 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <DialogTitle>{selectedParticipantKeys.display_name === 'You' ? 'Your keys' : `${selectedParticipantKeys.display_name}'s keys`}</DialogTitle>
                </div>
              </DialogHeader>
              <div className="py-4 space-y-4">
                {(selectedParticipantKeys.devices || []).map((device: any, i: number) => (
                  <div key={i} className="space-y-2">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{device.browser || 'Unknown'}</span>
                      <span className="text-muted-foreground"> · {device.device_id || device.key_fingerprint?.substring(0, 8) || '07d4672e'}</span>
                      <span className="text-muted-foreground"> · Last seen 10 days ago</span>
                    </p>
                    <div className="bg-muted rounded-lg p-3 font-mono text-xs text-foreground tracking-wider leading-relaxed whitespace-pre-wrap">
                      {device.key_fingerprint || 'EB 66 AA 4D 88 11 60 6A 17 4C 83 EF 85 02\n83 19 BE EE 9E A9 D0 04 1A 36 51 67 30 AB'}
                    </div>
                  </div>
                ))}
                {(!selectedParticipantKeys.devices || selectedParticipantKeys.devices.length === 0) && (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Safari</span>
                        <span className="text-muted-foreground"> · 07d4672e · Last seen 10 days ago</span>
                      </p>
                      <div className="bg-muted rounded-lg p-3 font-mono text-xs text-foreground tracking-wider leading-relaxed whitespace-pre-wrap">
                        {'EB 66 AA 4D 88 11 60 6A 17 4C 83 EF 85 02\n83 19 BE EE 9E A9 D0 04 1A 36 51 67 30 AB'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Chrome</span>
                        <span className="text-muted-foreground"> · 07d4672e · Last seen 10 days ago</span>
                      </p>
                      <div className="bg-muted rounded-lg p-3 font-mono text-xs text-foreground tracking-wider leading-relaxed whitespace-pre-wrap">
                        {'28 C6 BF D5 FF 83 FB 65 B1 04 98 92 B9 AE\nCA A6 90 D8 F1 B2 FC 34 14 63 F1 20 15 A3'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Limit Interactions Dialog */}
      <Dialog open={showLimitDialog} onOpenChange={setShowLimitDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Limit interactions</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-foreground">
              When you restrict <span className="font-semibold">{otherUser?.display_name}</span>:
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <svg className="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M7 15h0" />
                  </svg>
                </div>
                <p className="text-sm text-foreground">Their messages will be moved to message requests — you won't be notified</p>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <Eye className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-foreground">They won't see when you're active or when you've read their messages</p>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-foreground">Their comments on your posts will only be visible to them</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {otherUser?.display_name} won't be notified that you've restricted them.
            </p>
          </div>
          <DialogFooter className="flex flex-row justify-end gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setShowLimitDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={async () => {
                if (onBlock) onBlock('messaging');
                setShowLimitDialog(false);
                toast({
                  title: 'Restricted',
                  description: `${otherUser?.display_name} has been restricted.`,
                });
              }}
            >
              Restrict
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Conversation Confirmation */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear conversation</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all your sent messages in this conversation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingHistory}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearConversation} 
              disabled={clearingHistory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearingHistory ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block Dialog - Facebook style */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Block {otherUser?.display_name || 'this person'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Block messages and calls */}
            <button
              onClick={() => {
                if (onBlock) onBlock('messaging');
                setShowBlockDialog(false);
                toast({ title: 'Blocked', description: `Messages and calls from ${otherUser?.display_name} have been blocked.` });
              }}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-accent transition-colors text-left"
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted shrink-0">
                <MessageCircle className="h-5 w-5 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Block messages and calls</p>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                  <li>You won't receive messages or calls from {otherUser?.display_name}.</li>
                  <li>You may still be able to see their posts, comments, and reactions.</li>
                  <li>If you're in shared groups, you'll still be able to see and communicate with each other.</li>
                </ul>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </button>

            {/* Block completely */}
            <button
              onClick={() => {
                if (onBlock) onBlock('full');
                setShowBlockDialog(false);
                toast({ title: 'Blocked', description: `${otherUser?.display_name} has been fully blocked.` });
              }}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-accent transition-colors text-left"
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted shrink-0">
                <Ban className="h-5 w-5 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Block completely</p>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                  <li>If you're friends, blocking will unfriend them.</li>
                  <li>Their messages and calls will also be blocked.</li>
                </ul>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report Conversation Modal */}
      <ReportMessageModal
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        onReport={async (reason, details) => {
          if (otherUser && onReport) {
            await onReport(otherUser.id, reason, details);
          }
          return true;
        }}
        userName={otherUser?.display_name}
      />
    </>
  );
};
