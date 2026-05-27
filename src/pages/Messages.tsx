import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConversationList } from '@/components/messages/ConversationList';
import { ChatWindow } from '@/components/messages/ChatWindow';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { useConversations } from '@/hooks/useConversations';
import { usePresence } from '@/hooks/usePresence';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Edit, MessageCircle } from 'lucide-react';

const Messages = () => {
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const navigate = useNavigate();
  const params = useParams();
  const urlConversationId = params['*'] || '';
  const { user, loading: authLoading } = useAuth();
  const currentUserId = user?.id || null;

  usePresence(currentUserId || undefined);
  
  const {
    conversations,
    messages,
    firstUnreadIndex,
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
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-foreground">Chats</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowNewConversation(true)}
              className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80"
            >
              <Edit className="h-4 w-4" />
            </Button>
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
          loading={loading}
        />
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        onSelectUser={handleStartConversation}
        currentUserId={currentUserId}
      />
    </div>
  );
};

export default Messages;
