import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Loader2, MessageCircle, Search } from 'lucide-react';
import { MiniChatWindow } from './MiniChatWindow';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChatContact {
  id: string;
  username: string;
  display_name: string;
  profile_pic?: string | null;
}

interface OpenChat {
  contact: ChatContact;
  minimized: boolean;
}

type SetChatsFn = React.Dispatch<React.SetStateAction<OpenChat[]>>;
let globalSetOpenChats: SetChatsFn = () => {};

export const openChatWindow = (contact: ChatContact) => {
  globalSetOpenChats((prev) => {
    const existing = prev.find((c) => c.contact.id === contact.id);
    if (existing) {
      return prev.map((c) =>
        c.contact.id === contact.id ? { ...c, minimized: false } : c
      );
    }
    const updated = [...prev, { contact, minimized: false }];
    if (updated.length > 3) updated.shift();
    return updated;
  });
};

const STORAGE_KEY = 'opencode_chat_windows';

function loadSavedChats(): OpenChat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveChats(chats: OpenChat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {}
}

export const ChatWindowManager: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [openChats, setOpenChats] = useState<OpenChat[]>(loadSavedChats);
  globalSetOpenChats = setOpenChats;

  // Persist to localStorage on change
  useEffect(() => {
    saveChats(openChats);
  }, [openChats]);

  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsQuery, setContactsQuery] = useState('');
  const contactsRef = useRef<HTMLDivElement>(null);

  const isMessagesPage = location.pathname.startsWith('/messages');
  const minimizedSide = 'left-4';

  const currentUserId = user?.id;

  const closeChat = useCallback((id: string) => {
    setOpenChats((prev) => prev.filter((c) => c.contact.id !== id));
  }, []);

  const toggleMinimize = useCallback((id: string) => {
    setOpenChats((prev) =>
      prev.map((c) =>
        c.contact.id === id ? { ...c, minimized: !c.minimized } : c
      )
    );
  }, []);

  // Fetch contacts when popover opens
  useEffect(() => {
    if (!contactsOpen || !currentUserId) return;
    setContactsLoading(true);
    const fetchContacts = async () => {
      try {
        const [friendsRes, convsRes] = await Promise.all([
          supabase
            .from('friends')
            .select('requester_id, receiver_id')
            .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
            .eq('status', 'accepted'),
          supabase
            .from('conversation_participants')
            .select('conversation_id, user_id')
            .neq('user_id', currentUserId)
        ]);

        const userIdSet = new Set<string>();

        friendsRes.data?.forEach((f) => {
          userIdSet.add(f.requester_id === currentUserId ? f.receiver_id : f.requester_id);
        });

        if (convsRes.data?.length) {
          const { data: myConvs } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', currentUserId);

          const myConvIds = new Set(myConvs?.map(c => c.conversation_id) || []);
          convsRes.data.forEach((cp) => {
            if (myConvIds.has(cp.conversation_id)) {
              userIdSet.add(cp.user_id);
            }
          });
        }

        const allIds = Array.from(userIdSet);
        if (!allIds.length) {
          setContacts([]);
          setContactsLoading(false);
          return;
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, profile_pic')
          .in('id', allIds);

        setContacts(profiles || []);
      } catch {
        setContacts([]);
      } finally {
        setContactsLoading(false);
      }
    };
    fetchContacts();
  }, [contactsOpen, currentUserId]);

  // Close popover on outside click
  useEffect(() => {
    if (!contactsOpen) return;
    const handler = (e: MouseEvent) => {
      if (contactsRef.current && !contactsRef.current.contains(e.target as Node)) {
        setContactsOpen(false);
        setContactsQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contactsOpen]);

  if (!currentUserId || isMessagesPage) return null;

  const expanded = openChats.filter((c) => !c.minimized);
  const minimized = openChats.filter((c) => c.minimized);

  return (
    <>
      {/* Expanded chat windows */}
      <div className="fixed bottom-0 right-[280px] z-50 flex items-end gap-2">
        {expanded.map(({ contact }) => (
          <div key={contact.id}>
            <MiniChatWindow
              user={contact}
              currentUserId={currentUserId}
              onClose={() => closeChat(contact.id)}
              onMinimize={() => toggleMinimize(contact.id)}
              isMinimized={false}
            />
          </div>
        ))}
      </div>
      {/* Persistent chat bubble - shows contacts list */}
      <div className="fixed bottom-0 right-4 z-50">
        <div className="relative" ref={contactsRef}>
          <button
            onClick={() => setContactsOpen(!contactsOpen)}
            className="relative group shrink-0"
            title="Contacts"
          >
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-lg cursor-pointer hover:bg-primary/90 transition-colors relative">
              <MessageCircle className="h-6 w-6 text-primary-foreground" />
              <span className="absolute text-[10px] font-bold text-primary-foreground leading-none -mt-0.5">...</span>
            </div>
          </button>
          {contactsOpen && (
            <div className="absolute bottom-16 right-0 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={contactsQuery}
                    onChange={(e) => setContactsQuery(e.target.value)}
                    placeholder="Search contacts..."
                    className="h-9 text-sm pl-8"
                    autoFocus
                  />
                </div>
              </div>
              <div className="h-[260px]">
                <ScrollArea className="h-full">
                  {contactsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="py-1">
                      {contacts
                        .filter((c) =>
                          !contactsQuery || c.display_name.toLowerCase().includes(contactsQuery.toLowerCase()) ||
                          c.username.toLowerCase().includes(contactsQuery.toLowerCase())
                        )
                        .map((contact) => (
                          <button
                            key={contact.id}
                            onClick={() => {
                              openChatWindow(contact);
                              setContactsOpen(false);
                              setContactsQuery('');
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                          >
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarImage src={contact.profile_pic || ''} />
                              <AvatarFallback className="text-xs">{contact.display_name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{contact.display_name}</p>
                              <p className="text-xs text-muted-foreground truncate">@{contact.username}</p>
                            </div>
                          </button>
                        ))}
                      {contacts.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-6">No contacts yet</p>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Minimized chat bubbles - on the right */}
      <div className={`fixed bottom-0 ${minimizedSide} z-50 flex items-end gap-2 flex-row-reverse`}>
        {minimized.map(({ contact }) => (
          <button
            key={contact.id}
            onClick={() => toggleMinimize(contact.id)}
            className="relative group"
            title={contact.display_name}
          >
            <Avatar className="h-12 w-12 border-2 border-primary/30 ring-2 ring-transparent group-hover:ring-primary/40 transition-all shadow-lg cursor-pointer">
              <AvatarImage src={contact.profile_pic || ''} className="object-cover" />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                {contact.display_name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full" />
            <button
              onClick={(e) => { e.stopPropagation(); closeChat(contact.id); }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-muted rounded-full items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden group-hover:flex"
            >
              <X className="h-3 w-3" />
            </button>
          </button>
        ))}
      </div>
    </>
  );
};
