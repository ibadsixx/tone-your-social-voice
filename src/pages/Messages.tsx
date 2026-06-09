import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ConversationList } from '@/components/messages/ConversationList';
import { ChatWindow } from '@/components/messages/ChatWindow';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { useConversations } from '@/hooks/useConversations';
import { usePresence } from '@/hooks/usePresence';
import { useProfile } from '@/hooks/useProfile';
import { useStatusVisibility } from '@/hooks/useStatusVisibility';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { PenSquare, MessageCircle, MoreHorizontal, Settings, Inbox, Archive, Ban, Shield, HelpCircle, CircleDot, Bell, BellOff, Moon, Pencil, Check, Search, Loader2, X } from 'lucide-react';
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
  const [showAccountPreferences, setShowAccountPreferences] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showDndDialog, setShowDndDialog] = useState(false);
  const [statusMode, setStatusMode] = useState<'all' | 'on_for_some' | 'off_for_some'>('all');
  const [showPeopleSelector, setShowPeopleSelector] = useState(false);
  const [peopleSelectorMode, setPeopleSelectorMode] = useState<'on_for_some' | 'off_for_some'>('on_for_some');
  const [selectedPeople, setSelectedPeople] = useState<{ id: string; display_name: string; username: string; profile_pic?: string | null }[]>([]);
  const [activePage, setActivePage] = useState(0);
  const navigate = useNavigate();
  const params = useParams();
  const urlConversationId = params['*'] || '';
  const { user, loading: authLoading } = useAuth();
  const currentUserId = user?.id || null;

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
    setNotificationSounds,
    setDoNotDisturbDuration,
    setDarkMode,
    addVisibilityOverride,
    removeVisibilityOverride,
    loading: statusLoading,
    refetch: refetchStatus,
  } = useStatusVisibility();

  const isOnline = manualStatus === null || manualStatus === 'online';
  const setIsOnline = (online: boolean) => {
    setManualStatus(online ? null : 'offline');
  };
  
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
              <DropdownMenu>
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
                  <DropdownMenuItem onSelect={() => setShowAccountPreferences(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Account Preferences</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Inbox className="mr-2 h-4 w-4" />
                    <span>Pending Messages</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Archive className="mr-2 h-4 w-4" />
                    <span>Archive</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Ban className="mr-2 h-4 w-4" />
                    <span>Restricted Users</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Shield className="mr-2 h-4 w-4" />
                    <span>Privacy & Security</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>Support Center</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Conversation List */}
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          loading={loading}
          currentUserId={currentUserId}
        />
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
