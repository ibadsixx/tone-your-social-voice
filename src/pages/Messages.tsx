import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ConversationList } from '@/components/messages/ConversationList';
import { ChatWindow } from '@/components/messages/ChatWindow';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { AddPeopleDialog } from '@/components/messages/AddPeopleDialog';
import { useConversations } from '@/hooks/useConversations';
import { usePresence } from '@/hooks/usePresence';
import { useProfile } from '@/hooks/useProfile';
import { useStatusVisibility } from '@/hooks/useStatusVisibility';
import { useMessageRequests } from '@/hooks/useMessageRequests';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { PenSquare, MessageCircle, MoreHorizontal, Settings, Inbox, Archive, Ban, Shield, HelpCircle, CircleDot, Bell, BellOff, Moon, Pencil, Check, Search, Loader2, X, ArrowLeft, Users, UserPlus, Lock, Eye, Flag, Key, Download, Smartphone, Clock, CreditCard } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

const Messages = () => {
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [showAccountPreferences, setShowAccountPreferences] = useState(false);
  const [showVaultDialog, setShowVaultDialog] = useState(false);
  const [vaultPinInput, setVaultPinInput] = useState('');
  const [isCreatingPin, setIsCreatingPin] = useState(false);
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [showSecurityMethods, setShowSecurityMethods] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showDndDialog, setShowDndDialog] = useState(false);
  const [statusMode, setStatusMode] = useState<'all' | 'on_for_some' | 'off_for_some'>('all');
  const [viewMode, setViewMode] = useState<'chats' | 'pending' | 'archive' | 'restricted'>('chats');
  const [archivedConversations, setArchivedConversations] = useState<any[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [restrictedUsers, setRestrictedUsers] = useState<any[]>([]);
  const [restrictedLoading, setRestrictedLoading] = useState(false);
  const [restrictedSearch, setRestrictedSearch] = useState('');
  const [restrictedSearchResults, setRestrictedSearchResults] = useState<any[]>([]);
  const [restrictedAdding, setRestrictedAdding] = useState(false);
  const [showPeopleSelector, setShowPeopleSelector] = useState(false);
  const [peopleSelectorMode, setPeopleSelectorMode] = useState<'on_for_some' | 'off_for_some'>('on_for_some');
  const [selectedPeople, setSelectedPeople] = useState<{ id: string; display_name: string; username: string; profile_pic?: string | null }[]>([]);
  const [privacyView, setPrivacyView] = useState<'main' | 'encryption_chats' | null>(null);
  const [activePage, setActivePage] = useState(0);
  const navigate = useNavigate();
  const params = useParams();
  const urlConversationId = params['*'] || '';
  const { user, loading: authLoading } = useAuth();
  const currentUserId = user?.id || null;
  const { toast } = useToast();

  usePresence(currentUserId || undefined);
  const { profile } = useProfile(currentUserId || undefined);
  const {
    visibleTo,
    hiddenFrom,
    manualStatus,
    setManualStatus,
    notificationSounds,
    doNotDisturb,
    doNotDisturbLabel,
    darkMode,
    showReadIndicator,
    checkKeysInConversations,
    rememberBrowser,
    disableAutoUploads,
    setNotificationSounds,
    setDoNotDisturbDuration,
    setDarkMode,
    setShowReadIndicator,
    setCheckKeysInConversations,
    setRememberBrowser,
    setDisableAutoUploads,
    vaultPin,
    vaultRecoveryCode,
    setVaultPin,
    setVaultRecoveryCode,
    addVisibilityOverride,
    removeVisibilityOverride,
    loading: statusLoading,
    refetch: refetchStatus,
  } = useStatusVisibility();

  const {
    requests: pendingRequests,
    loading: pendingLoading,
    acceptRequest,
    declineRequest,
  } = useMessageRequests(currentUserId || undefined);

  const isOnline = manualStatus === null || manualStatus === 'online';
  const setIsOnline = (online: boolean) => {
    setManualStatus(online ? null : 'offline');
  };
  
  const fetchArchived = async () => {
    if (!currentUserId) return;
    setArchivedLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_archived_conversations', {
        p_user_id: currentUserId
      });
      if (!error) setArchivedConversations(data || []);
    } catch {
      // silent
    } finally {
      setArchivedLoading(false);
    }
  };

  const archiveConversation = async (convId: string) => {
    await supabase.rpc('archive_conversation', { p_conversation_id: convId });
    refetchConversations();
    fetchArchived();
  };

  const unarchiveConversation = async (convId: string) => {
    await supabase.rpc('unarchive_conversation', { p_conversation_id: convId });
    refetchConversations();
    fetchArchived();
  };

  const handleAddPerson = async (userId: string) => {
    if (viewMode === 'restricted') {
      await supabase
        .from('restricted_users')
        .insert({ user_id: currentUserId, restricted_user_id: userId });
      setShowAddPeople(false);
      toast({ title: 'User restricted', description: 'They won\'t be notified.' });
      fetchRestricted();
    } else {
      const conversationId = await getOrCreateDM(userId);
      if (conversationId) {
        await supabase.rpc('archive_conversation', { p_conversation_id: conversationId });
        setShowAddPeople(false);
        fetchArchived();
      }
    }
  };

  const fetchRestricted = async () => {
    if (!currentUserId) return;
    setRestrictedLoading(true);
    try {
      const { data, error } = await supabase
        .from('restricted_users')
        .select('id, restricted_user_id, created_at')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        setRestrictedUsers([]);
        return;
      }

      const ids = data.map(r => r.restricted_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', ids);

      setRestrictedUsers(data.map(r => {
        const p = profiles?.find(pr => pr.id === r.restricted_user_id);
        return {
          id: r.id,
          target_id: r.restricted_user_id,
          display_name: p?.display_name || 'Unknown User',
          username: p?.username || 'unknown',
          profile_pic: p?.profile_pic || null,
          created_at: r.created_at,
        };
      }));
    } catch {
      // silent
    } finally {
      setRestrictedLoading(false);
    }
  };

  const addRestricted = async (targetId: string) => {
    setRestrictedAdding(true);
    try {
      await supabase
        .from('restricted_users')
        .insert({ user_id: currentUserId, restricted_user_id: targetId });
      setRestrictedSearch('');
      setRestrictedSearchResults([]);
      toast({ title: 'User restricted', description: 'They won\'t be notified.' });
      fetchRestricted();
    } catch {
      toast({ title: 'Error', description: 'Failed to restrict user.', variant: 'destructive' });
    } finally {
      setRestrictedAdding(false);
    }
  };

  const removeRestriction = async (id: string) => {
    await supabase.from('restricted_users').delete().eq('id', id);
    setRestrictedUsers(prev => prev.filter(r => r.id !== id));
    toast({ title: 'Restriction removed' });
  };

  // Search users to restrict
  useEffect(() => {
    if (!restrictedSearch.trim() || restrictedSearch.length < 2) {
      setRestrictedSearchResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .neq('id', currentUserId)
        .or(`username.ilike.%${restrictedSearch}%,display_name.ilike.%${restrictedSearch}%`)
        .limit(10);
      setRestrictedSearchResults(data || []);
    }, 300);
    return () => clearTimeout(delay);
  }, [restrictedSearch, currentUserId]);

  const {
    conversations,
    messages,
    firstUnreadIndex,
    hasMoreMessages,
    loading,
    activeConversationId,
    setActiveConversationId,
    fetchMessages,
    sendMessage,
    getOrCreateDM,
    refetchConversations
  } = useConversations(currentUserId || undefined);

  // Sync URL -> state (refresh, direct navigation, manual URL change)
  useEffect(() => {
    if (urlConversationId && currentUserId && !loading && urlConversationId !== activeConversationId) {
      setActiveConversationId(urlConversationId);
      setActivePage(0);
      fetchMessages(urlConversationId, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, urlConversationId, activeConversationId, loading]);

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setActivePage(0);
    fetchMessages(conversationId, 0);
    navigate(`/messages/${conversationId}`);
  };

  const handleSendMessage = async (content?: string, mediaUrl?: string, replyToId?: string) => {
    if (!activeConversationId || !currentUserId) return;

    const success = await sendMessage(activeConversationId, content, mediaUrl, replyToId);
    if (success) {
      // Message will be added via real-time subscription
    }
  };

  const handleStartConversation = async (userId: string) => {
    if (!currentUserId) return;
    
    const conversationId = await getOrCreateDM(userId);
    if (conversationId) {
      setShowNewConversation(false);
      setActiveConversationId(conversationId);
      setActivePage(0);
      fetchMessages(conversationId, 0);
      navigate(`/messages/${conversationId}`);
    }
  };

  const handleGroupCreated = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setActivePage(0);
    fetchMessages(conversationId, 0);
    refetchConversations();
    navigate(`/messages/${conversationId}`);
  };

  const handleChannelCreated = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setActivePage(0);
    fetchMessages(conversationId, 0);
    refetchConversations();
    navigate(`/messages/${conversationId}`);
  };

  const activeConversation = conversations.find(
    conv => conv.conversation_id === activeConversationId
  );

  if (authLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="text-lg font-medium text-foreground">Loading…</div>
          <div className="text-sm text-muted-foreground">Checking your session</div>
        </div>
      </div>
    );
  }

  if (!currentUserId) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">
            Authentication Required
          </h2>
          <p className="text-muted-foreground max-w-sm">
            Please sign in to access your messages and connect with friends
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-background overflow-hidden">
      {/* Conversations Sidebar */}
      <div className="w-80 lg:w-96 border-r border-border flex flex-col bg-card shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center mb-4">
            {viewMode === 'pending' || viewMode === 'archive' || viewMode === 'restricted' ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMode('chats')}
                  className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80 shrink-0 mr-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold text-foreground">
                  {viewMode === 'pending' ? 'Pending' : viewMode === 'restricted' ? 'Restricted Users' : 'Archive'}
                </h1>
                {viewMode === 'archive' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddPeople(true)}
                    className="ml-auto h-9 gap-1.5 rounded-full bg-muted hover:bg-muted/80"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span className="text-sm">Add people</span>
                  </Button>
                )}
                {viewMode === 'restricted' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddPeople(true)}
                    className="ml-auto h-9 gap-1.5 rounded-full bg-muted hover:bg-muted/80"
                  >
                    <Ban className="h-4 w-4" />
                    <span className="text-sm">Add people</span>
                  </Button>
                )}
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-foreground">Chats</h1>
                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowNewConversation(true)}
                    className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80 shrink-0"
                  >
                    <PenSquare className="h-4 w-4" />
                  </Button>
                  <DropdownMenu onOpenChange={(open) => { if (!open) setPrivacyView(null); }}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80 shrink-0"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {privacyView === 'encryption_chats' ? (
                        <>
                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setPrivacyView('main'); }}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            <span className="font-medium">Encryption chats</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setShowVaultDialog(true)}>
                            <Lock className="mr-2 h-4 w-4" />
                            <span>Message Vault</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            <span>Preview Mode</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Shield className="mr-2 h-4 w-4" />
                            <span>Security Warnings</span>
                          </DropdownMenuItem>
                        </>
                      ) : privacyView === 'main' ? (
                        <>
                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setPrivacyView(null); }}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            <span className="font-medium">Privacy & security</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setPrivacyView('encryption_chats'); }}>
                            <Lock className="mr-2 h-4 w-4" />
                            <span>Encryption chats</span>
                          </DropdownMenuItem>
                          <div
                            className="flex items-center justify-between px-2 py-1.5 text-sm cursor-default hover:bg-accent"
                            onSelect={(e: any) => e.preventDefault()}
                          >
                            <div className="flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              <span>Show reading indicator</span>
                            </div>
                            <Switch
                              checked={showReadIndicator}
                              onCheckedChange={setShowReadIndicator}
                            />
                          </div>
                          <DropdownMenuItem>
                            <Flag className="mr-2 h-4 w-4" />
                            <span>Reported conversations</span>
                          </DropdownMenuItem>
                          <div
                            className="flex items-center justify-between px-2 py-1.5 text-sm cursor-default hover:bg-accent"
                            onSelect={(e: any) => e.preventDefault()}
                          >
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4" />
                              <span>Checking the keys in conversations</span>
                            </div>
                            <Switch
                              checked={checkKeysInConversations}
                              onCheckedChange={setCheckKeysInConversations}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <DropdownMenuItem onSelect={() => setShowAccountPreferences(true)}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Account Preferences</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setViewMode('pending')}>
                            <Inbox className="mr-2 h-4 w-4" />
                            <span>Pending Messages</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { setViewMode('archive'); fetchArchived(); }}>
                            <Archive className="mr-2 h-4 w-4" />
                            <span>Archive</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { setViewMode('restricted'); fetchRestricted(); }}>
                            <Ban className="mr-2 h-4 w-4" />
                            <span>Restricted Users</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setPrivacyView('main'); }}>
                            <Shield className="mr-2 h-4 w-4" />
                            <span>Privacy & Security</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <HelpCircle className="mr-2 h-4 w-4" />
                            <span>Support Center</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </div>

          {/* List */}
        {viewMode === 'pending' ? (
          <ScrollArea className="flex-1">
            {pendingLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Tabs defaultValue="you_may_know" className="w-full">
                <div className="px-4 pt-2">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="you_may_know" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>Maybe you know</span>
                    </TabsTrigger>
                    <TabsTrigger value="spam" className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>Spam</span>
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="you_may_know" className="mt-0">
                  {pendingRequests.filter(r => r.category === 'you_may_know').length === 0 ? (
                    <p className="text-sm text-muted-foreground px-4 py-2">No requests</p>
                  ) : (
                    pendingRequests.filter(r => r.category === 'you_may_know').map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors"
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={req.sender_profile?.profile_pic || ''} className="object-cover" />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {req.sender_profile?.display_name?.charAt(0)?.toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {req.sender_profile?.display_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            @{req.sender_profile?.username || 'unknown'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => acceptRequest(req.id, req.sender_id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => declineRequest(req.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
                <TabsContent value="spam" className="mt-0">
                  {pendingRequests.filter(r => r.category === 'spam').length === 0 ? (
                    <p className="text-sm text-muted-foreground px-4 py-2">No spam requests</p>
                  ) : (
                    pendingRequests.filter(r => r.category === 'spam').map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors"
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={req.sender_profile?.profile_pic || ''} className="object-cover" />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {req.sender_profile?.display_name?.charAt(0)?.toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {req.sender_profile?.display_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            @{req.sender_profile?.username || 'unknown'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => acceptRequest(req.id, req.sender_id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => declineRequest(req.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            )}
          </ScrollArea>
        ) : viewMode === 'archive' ? (
          <ScrollArea className="flex-1">
            {archivedLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : archivedConversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Archive className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No archived conversations</p>
              </div>
            ) : (
              archivedConversations.map((conv: any) => (
                <button
                  key={conv.conversation_id}
                  onClick={() => {
                    handleSelectConversation(conv.conversation_id);
                    setViewMode('chats');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={conv.other_user_profile_pic || ''} className="object-cover" />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {(conv.other_user_display_name || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.other_user_display_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">{conv.last_message_content || 'No messages'}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={(e) => { e.stopPropagation(); unarchiveConversation(conv.conversation_id); }}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </button>
              ))
            )}
            </ScrollArea>
          ) : viewMode === 'restricted' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 pt-3 pb-1">
                <div className="bg-muted/50 rounded-lg p-3 mb-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground text-sm mb-1">What happens when you restrict someone?</p>
                  <p>• They remain your friend — they won't know they've been restricted</p>
                  <p>• They only see your public posts or posts they're tagged in</p>
                  <p>• They won't see your private stories</p>
                  <p>• Their comments on your posts will only be visible to them</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users to restrict..."
                    value={restrictedSearch}
                    onChange={(e) => setRestrictedSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                {restrictedSearchResults.length > 0 && (
                  <div className="mt-1 border border-border rounded-lg bg-card shadow-sm overflow-hidden">
                    {restrictedSearchResults.map((r) => {
                      const already = restrictedUsers.some(u => u.target_id === r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => !already && addRestricted(r.id)}
                          disabled={already || restrictedAdding}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left disabled:opacity-50"
                        >
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={r.profile_pic || ''} />
                            <AvatarFallback className="text-xs">{(r.display_name || '?')[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{r.display_name}</p>
                            <p className="text-xs text-muted-foreground truncate">@{r.username}</p>
                          </div>
                          {already ? (
                            <span className="text-xs text-muted-foreground shrink-0">Already restricted</span>
                          ) : (
                            <Ban className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <ScrollArea className="flex-1 px-4">
                {restrictedLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : restrictedUsers.length === 0 && !restrictedSearch.trim() ? (
                  <div className="text-center py-12">
                    <Ban className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No restricted users</p>
                    <p className="text-xs text-muted-foreground mt-1">Search for someone above to restrict them</p>
                  </div>
                ) : (
                  <div className="space-y-1 pb-2">
                    {restrictedUsers.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors rounded-lg"
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={u.profile_pic || ''} />
                          <AvatarFallback className="text-xs">{(u.display_name || '?')[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.display_name}</p>
                          <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRestriction(u.id)}
                          className="h-8 text-xs text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            loading={loading}
            currentUserId={currentUserId}
            onArchiveConversation={archiveConversation}
          />
        )}
      </div>

      {/* Chat Window */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        <ChatWindow
          key={activeConversationId || 'no-conversation'}
          otherUser={activeConversation?.other_user || null}
          conversationType={activeConversation?.type}
          conversationName={activeConversation?.name}
          conversationDescription={activeConversation?.description}
          messages={messages}
          firstUnreadIndex={firstUnreadIndex}
          currentUserId={currentUserId}
          conversationId={activeConversationId || undefined}
          onSendMessage={handleSendMessage}
          onLoadMore={() => {
            if (!activeConversationId) return;
            setActivePage((prev) => {
              const next = prev + 1;
              fetchMessages(activeConversationId, next);
              return next;
            });
          }}
          onClearHistory={() => {
            refetchConversations();
            navigate('/messages');
          }}
          hasMoreMessages={hasMoreMessages}
          loading={loading}
        />
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        onSelectUser={handleStartConversation}
        onGroupCreated={handleGroupCreated}
        onChannelCreated={handleChannelCreated}
        currentUserId={currentUserId}
      />

      {/* Add People Dialog (Archive) */}
      <AddPeopleDialog
        open={showAddPeople}
        onOpenChange={setShowAddPeople}
        currentUserId={currentUserId}
        onAddPerson={handleAddPerson}
      />

      {/* Account Preferences Dialog */}
      <Dialog open={showAccountPreferences} onOpenChange={setShowAccountPreferences}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle>Account Preferences</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">Account</h3>
              <Link
                to={`/profile/${profile?.username || currentUserId}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors -mx-1"
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={profile?.profile_pic || ''} className="object-cover" />
                  <AvatarFallback className="bg-primary/10 text-primary text-base">
                    {profile?.display_name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{profile?.display_name || 'User'}</p>
                  <p className="text-sm text-muted-foreground truncate">@{profile?.username || 'username'}</p>
                </div>
              </Link>
              <div className="flex items-center justify-between mt-3 px-1">
                <button
                  onClick={() => setShowStatusDialog(true)}
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <CircleDot className="h-4 w-4 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-xs text-muted-foreground">{isOnline ? 'Online' : 'Offline'}</p>
                  </div>
                </button>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">Notifications</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Notification sounds</p>
                  </div>
                  <Switch checked={notificationSounds} onCheckedChange={setNotificationSounds} />
                </div>
                <button
                  onClick={() => setShowDndDialog(true)}
                  className="flex items-center justify-between w-full px-1 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-2">
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                    <div className="text-left">
                      <p className="text-sm font-medium">Do Not Disturb</p>
                      <p className="text-xs text-muted-foreground">{doNotDisturbLabel}</p>
                    </div>
                  </div>
                </button>
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Dark Mode</p>
                  </div>
                  <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Do Not Disturb Dialog */}
      <Dialog open={showDndDialog} onOpenChange={setShowDndDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle>Do Not Disturb</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {[
              { value: '1h' as const, label: '1 hour' },
              { value: '2h' as const, label: '2 hours' },
              { value: '4h' as const, label: '4 hours' },
              { value: 'tomorrow' as const, label: 'Until tomorrow' },
              { value: 'forever' as const, label: 'Until I turn it off' },
              { value: 'off' as const, label: 'Turn off' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setDoNotDisturbDuration(option.value);
                  setShowDndDialog(false);
                }}
                className="w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-accent transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle>Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Online Status</p>
                <p className="text-xs text-muted-foreground">{isOnline ? 'Active' : 'Inactive'}</p>
              </div>
              <Switch checked={isOnline} onCheckedChange={setIsOnline} />
            </div>
            <div className="space-y-3">
              <button
                onClick={() => setStatusMode('on_for_some')}
                role="option"
                aria-checked={statusMode === 'on_for_some'}
                className="flex items-center justify-between w-full py-2 px-3 rounded-lg border border-border aria-checked:border-primary aria-checked:bg-primary/5"
              >
                <div className="flex items-center gap-2">
                  {statusMode === 'on_for_some' && <Check className="h-4 w-4 text-primary" />}
                  <div className="text-left">
                    <p className="text-sm font-medium">ON for some</p>
                    <p className="text-xs text-muted-foreground">{visibleTo.length > 0 ? `${visibleTo.length} people` : 'Custom'}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPeople(visibleTo);
                    setPeopleSelectorMode('on_for_some');
                    setShowPeopleSelector(true);
                  }}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </button>
              <button
                onClick={() => setStatusMode('off_for_some')}
                role="option"
                aria-checked={statusMode === 'off_for_some'}
                className="flex items-center justify-between w-full py-2 px-3 rounded-lg border border-border aria-checked:border-primary aria-checked:bg-primary/5"
              >
                <div className="flex items-center gap-2">
                  {statusMode === 'off_for_some' && <Check className="h-4 w-4 text-primary" />}
                  <div className="text-left">
                    <p className="text-sm font-medium">Off for some</p>
                    <p className="text-xs text-muted-foreground">{hiddenFrom.length > 0 ? `${hiddenFrom.length} people` : 'Custom'}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPeople(hiddenFrom);
                    setPeopleSelectorMode('off_for_some');
                    setShowPeopleSelector(true);
                  }}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </button>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsOnline(true);
                  setShowStatusDialog(false);
                }}
              >
                Reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowStatusDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowStatusDialog(false)}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Message Vault Dialog */}
      <Dialog open={showVaultDialog} onOpenChange={setShowVaultDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowVaultDialog(false)}
                className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 flex-1 justify-center mr-8">
                <Lock className="h-5 w-5 text-primary" />
                <DialogTitle>Message Vault</DialogTitle>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              Your encrypted messages are securely stored in your backup.{' '}
              <button className="text-primary hover:underline cursor-pointer">Learn more</button>
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Last backup</span>
                </div>
                <span className="text-sm text-muted-foreground">Today at 3:42 PM</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Date created</span>
                </div>
                <span className="text-sm text-muted-foreground">Jan 15, 2026</span>
              </div>
            </div>

            <button
              onClick={() => { setIsCreatingPin(true); setVaultPinInput(''); }}
              className="flex items-center gap-2 text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity"
            >
              <Key className="h-4 w-4 text-muted-foreground" />
              PIN
            </button>

            <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-9" onClick={() => setShowSecurityMethods(true)}>
              <Shield className="h-4 w-4" />
              Manage security methods
            </Button>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Remember this browser</span>
              </div>
              <Switch checked={rememberBrowser} onCheckedChange={async (value) => {
                setRememberBrowser(value);
                let deviceId = localStorage.getItem('tone_device_id');
                if (!deviceId) {
                  deviceId = crypto.randomUUID();
                  localStorage.setItem('tone_device_id', deviceId);
                }
                if (value) {
                  await supabase.from('trusted_devices').upsert({
                    user_id: currentUserId,
                    device_id: deviceId,
                    user_agent: navigator.userAgent,
                    last_used_at: new Date().toISOString(),
                  }, { onConflict: 'user_id,device_id' });
                } else {
                  await supabase.from('trusted_devices').delete()
                    .eq('user_id', currentUserId)
                    .eq('device_id', deviceId);
                }
              }} />
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Automatic uploads</span>
              </div>
              <Switch checked={disableAutoUploads} onCheckedChange={setDisableAutoUploads} />
            </div>

            <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-9">
              <Download className="h-4 w-4" />
              Download message storage data
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Security Methods Dialog */}
      <Dialog open={showSecurityMethods} onOpenChange={setShowSecurityMethods}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="text-center sm:text-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSecurityMethods(false)}
                className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 flex-1 justify-center mr-8">
                <Shield className="h-5 w-5 text-primary" />
                <DialogTitle>Manage security methods</DialogTitle>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-2">
            <button
              onClick={() => { setShowSecurityMethods(false); setIsCreatingPin(true); setVaultPinInput(''); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent transition-colors text-left border border-border"
            >
              <Key className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">PIN</p>
                <p className="text-xs text-muted-foreground">Use a numeric PIN to unlock your vault</p>
              </div>
            </button>
            <button
              onClick={() => { setShowSecurityMethods(false); setShowRecoveryCode(true); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent transition-colors text-left border border-border"
            >
              <Key className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">40-character code</p>
                <p className="text-xs text-muted-foreground">Use a recovery code to access your vault</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create PIN Dialog */}
      <Dialog open={isCreatingPin} onOpenChange={setIsCreatingPin}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="text-center sm:text-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCreatingPin(false)}
                className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 flex-1 justify-center mr-8">
                <Key className="h-5 w-5 text-primary" />
                <DialogTitle>Create a new PIN</DialogTitle>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Set a PIN to protect your encrypted message vault.
            </p>
              <Input
                type="password"
                maxLength={6}
                placeholder="Enter new PIN"
                value={vaultPinInput}
                onChange={(e) => setVaultPinInput(e.target.value)}
                className="h-9 text-center"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setIsCreatingPin(false); setVaultPinInput(''); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={async () => {
                  await setVaultPin(vaultPinInput || null);
                  setIsCreatingPin(false);
                }}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recovery Code Dialog */}
      <Dialog open={showRecoveryCode} onOpenChange={setShowRecoveryCode}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="text-center sm:text-center">
            <div className="flex items-center justify-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <DialogTitle>Recovery Code</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Use this 40-character code to recover access to your vault.
            </p>
            {vaultRecoveryCode ? (
              <div className="bg-muted rounded-lg p-3 text-center">
                <code className="text-xs font-mono break-all">{vaultRecoveryCode}</code>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center">No recovery code set.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowRecoveryCode(false)}>
                Close
              </Button>
              <Button size="sm" onClick={async () => {
                const code = Array.from({ length: 40 }, () =>
                  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
                ).join('');
                await setVaultRecoveryCode(code);
              }}>
                Generate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* People Selector Dialog */}
      <Dialog open={showPeopleSelector} onOpenChange={setShowPeopleSelector}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle>{peopleSelectorMode === 'on_for_some' ? 'ON for some' : 'Off for some'}</DialogTitle>
          </DialogHeader>
          <PeopleSelectorContent
            mode={peopleSelectorMode}
            selectedPeople={selectedPeople}
            onSelectionChange={setSelectedPeople}
            onSave={async (people) => {
              const visibility = peopleSelectorMode === 'on_for_some' ? 'visible' : 'hidden';
              const currentIds = new Set(people.map((p) => p.id));
              const previousIds = new Set(
                peopleSelectorMode === 'on_for_some' ? visibleTo.map((p) => p.id) : hiddenFrom.map((p) => p.id)
              );
              const toAdd = people.filter((p) => !previousIds.has(p.id));
              const toRemove = (peopleSelectorMode === 'on_for_some' ? visibleTo : hiddenFrom).filter(
                (p) => !currentIds.has(p.id)
              );
              await Promise.all([
                ...toAdd.map((p) => addVisibilityOverride(p.id, visibility)),
                ...toRemove.map((p) => removeVisibilityOverride(p.id)),
              ]);
              await refetchStatus();
              setShowPeopleSelector(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface PeopleSelectorContentProps {
  mode: 'on_for_some' | 'off_for_some';
  selectedPeople: { id: string; display_name: string; username: string; profile_pic?: string | null }[];
  onSelectionChange: (people: { id: string; display_name: string; username: string; profile_pic?: string | null }[]) => void;
  onSave: (people: { id: string; display_name: string; username: string; profile_pic?: string | null }[]) => Promise<void>;
}

const PeopleSelectorContent: React.FC<PeopleSelectorContentProps> = ({ selectedPeople, onSelectionChange, onSave }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<{ id: string; display_name: string; username: string; profile_pic?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, username, profile_pic')
          .ilike('display_name', `%${searchQuery}%`)
          .neq('id', user?.id || '')
          .limit(20);
        setResults(data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [searchQuery, user?.id]);

  const togglePerson = (person: typeof selectedPeople[number]) => {
    const exists = selectedPeople.find((p) => p.id === person.id);
    if (exists) {
      onSelectionChange(selectedPeople.filter((p) => p.id !== person.id));
    } else {
      onSelectionChange([...selectedPeople, person]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search people..."
          className="h-9 text-sm pl-8"
          autoFocus
        />
      </div>
      <ScrollArea className="h-64">
        <div className="space-y-1">
          {selectedPeople.map((person) => (
            <button
              key={person.id}
              onClick={() => togglePerson(person)}
              className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-accent text-left"
            >
              <div className="h-5 w-5 rounded border border-primary flex items-center justify-center bg-primary">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={person.profile_pic || ''} />
                <AvatarFallback className="text-xs">{person.display_name[0]}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{person.display_name}</p>
                <p className="text-xs text-muted-foreground truncate">@{person.username}</p>
              </div>
            </button>
          ))}
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            results
              .filter((r) => !selectedPeople.find((s) => s.id === r.id))
              .map((person) => (
                <button
                  key={person.id}
                  onClick={() => togglePerson(person)}
                  className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-accent text-left"
                >
                  <div className="h-5 w-5 rounded border border-border" />
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={person.profile_pic || ''} />
                    <AvatarFallback className="text-xs">{person.display_name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{person.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">@{person.username}</p>
                  </div>
                </button>
              ))
          )}
          {!loading && searchQuery && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No people found</p>
          )}
          {!searchQuery && selectedPeople.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Search for people to add</p>
          )}
        </div>
      </ScrollArea>
      <div className="flex justify-end gap-2 pt-2">
        <Button
          size="sm"
          onClick={async () => {
            setSaving(true);
            await onSave(selectedPeople);
            setSaving(false);
          }}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
};

export default Messages;
