import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Plus, Loader2 } from 'lucide-react';
import { MiniChatWindow } from './MiniChatWindow';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';

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

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState('');
  const [newChatResults, setNewChatResults] = useState<ChatContact[]>([]);
  const [newChatLoading, setNewChatLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const isFloatingIMHidden = location.pathname.startsWith('/profile') || location.pathname.startsWith('/pages');
  const isMessagesPage = location.pathname.startsWith('/messages');
  const minimizedSide = isFloatingIMHidden ? 'right-4' : 'left-4';

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

  // Search users when typing in new-chat popover
  useEffect(() => {
    if (!currentUserId) return;
    if (!newChatQuery.trim() || newChatQuery.trim().length < 2) {
      setNewChatResults([]);
      return;
    }
    const q = newChatQuery.trim();
    const timer = setTimeout(async () => {
      setNewChatLoading(true);
      try {
        const pattern = `%${q}%`;
        const { data } = await supabase
          .from('profiles')
          .select('id, username, display_name, profile_pic')
          .neq('id', currentUserId)
          .or(`display_name.ilike.${pattern},username.ilike.${pattern}`)
          .limit(10);
        setNewChatResults(data || []);
      } catch {
        setNewChatResults([]);
      } finally {
        setNewChatLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [newChatQuery, currentUserId]);

  // Close popover on outside click
  useEffect(() => {
    if (!newChatOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setNewChatOpen(false);
        setNewChatQuery('');
        setNewChatResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [newChatOpen]);

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
      {/* Minimized chat bubbles */}
      <div className={`fixed bottom-0 ${minimizedSide} z-50 flex items-end gap-2 flex-row-reverse`}>
        {/* Persistent new-chat bubble */}
        <div className="relative" ref={searchRef}>
          <button
            onClick={() => setNewChatOpen(!newChatOpen)}
            className="relative group shrink-0"
            title="New message"
          >
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-lg cursor-pointer hover:bg-primary/90 transition-colors">
              <Plus className="h-6 w-6 text-primary-foreground" />
            </div>
          </button>
          {newChatOpen && (
            <div className={`absolute bottom-16 ${isFloatingIMHidden ? 'right-0' : 'left-0'} w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden`}>
              <div className="p-3 border-b border-border">
                <p className="text-sm font-semibold mb-2">New message</p>
                <Input
                  value={newChatQuery}
                  onChange={(e) => setNewChatQuery(e.target.value)}
                  placeholder="Search people..."
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {newChatLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : newChatResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {newChatQuery.trim().length >= 2 ? 'No results found' : 'Type at least 2 characters'}
                  </p>
                ) : (
                  <div className="py-1">
                    {newChatResults.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => {
                          openChatWindow(contact);
                          setNewChatOpen(false);
                          setNewChatQuery('');
                          setNewChatResults([]);
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
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
