// Global Messages-nav unread badge (do.md "Fix the Messages unread
// notification badge").
//
// The badge on the Messages icon in global navigation is defined as:
//
//   the number of conversations that currently contain unread messages
//
// (NOT the total number of unread messages, and NOT the in-page unread state).
// The read-state architecture is `message_reads` (a row per message per
// reader): a message sent by someone else that the current user has no
// `message_reads` row for is unread. This is the same predicate the per-chat
// badges inside Messages derive from — this provider just counts conversations
// rather than messages, and it does it from EVERY authenticated page, which is
// exactly what the existing per-page `useConversations` instances cannot do
// (they only exist while Messages / a mini chat / a page detail is mounted).
//
// WHY A SET, NOT A NUMBER: "number of conversations with unread" only changes
// when a conversation ENTERS (0 -> unread) or LEAVES (unread -> 0) the unread
// set. A payload telling the client about a message cannot distinguish those
// two without knowing which conversations are already unread, and "already
// unread" is membership — a Set, fed by the server, mutated by events.
//
// CORRECTNESS MODEL — the server is the source of truth, events are wake-ups:
//
//   - Initial fetch / focus / SSE (re)connect: the full set is re-read from
//     the gateway aggregate (`get_unread_conversation_ids`), which applies the
//     authoritative sender/read/cleared/participant rules in SQL.
//   - An incoming `message.created` optimistically ADDS its conversation (an
//     incoming message can only make a conversation unread), then schedules a
//     debounced server reconcile that confirms the set.
//   - A local mark-as-read (the user opened and read a conversation) removes
//     the conversation immediately via the `unreadBadgeBus` module (the SSE
//     `message.read` events this user receives flow the opposite way — the
//     sender of the read messages is told, not the reader), also followed by a
//     debounced reconcile.
//   - Own messages never add: clients publish `message.created` only to the
//     OTHER participants, never to the sender's own channel, and the server
//     aggregate additionally asserts `sender_id <> user`.
//   - Logout tears the subscription down and clears the set; login starts a
//     clean fetch, so a switch between accounts can never leak a badge.
//
// REALTIME: this provider holds ONE `subscribeToMessages(userId, ...)`
// subscription for the lifetime of the authenticated session, which keeps the
// shared ref-counted SSE channel alive on every page — the same channel the
// Messages page relies on, now no longer dropped when no chat UI is mounted.
// No polling loop is added; resync happens on reconnect (`init` frame) and tab
// focus, and every event coalesces into a short debounce.
//
// The server side of this is gateway/src/features/unreadConversations.ts, and
// the SQL aggregate it calls is `get_unread_conversation_ids` (supabase
// migrations). This file only ever talks to the Gateway.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { gateway } from '@/lib/gateway';
import { getMessageRealtime, subscribeToMessages } from '@/lib/messageRealtime';
import { onConversationRead } from '@/lib/unreadBadgeBus';

/** Coalesce the avalanche of events that arrive together into one reconcile. */
const REFRESH_DEBOUNCE_MS = 300;

interface UnreadBadgeValue {
  /** Number of the current user's conversations that contain unread messages. */
  count: number;
}

const UnreadBadgeContext = createContext<UnreadBadgeValue>({ count: 0 });

/**
 * Fetches the server's authoritative unread-conversation set. On any kind of
 * failure the PREVIOUS set is kept: a transient gateway/network blip must not
 * wipe a badge the user can already see.
 */
async function fetchServerUnreadSet(
  userId: string,
  current: Set<string> | null
): Promise<Set<string>> {
  try {
    const { data, error } = await gateway.rpc('get_unread_conversation_ids');
    if (error) return current ?? new Set<string>();
    if (!Array.isArray(data)) return current ?? new Set<string>();
    const next = new Set<string>();
    for (const id of data) {
      if (typeof id === 'string' && id.length > 0) next.add(id);
    }
    return next;
  } catch {
    return current ?? new Set<string>();
  }
}

export function UnreadBadgeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const idsRef = useRef<Set<string>>(new Set());
  /**
   * Bumped on every effect run (i.e. every sign-in / sign-out) so an in-flight
   * read for a previous account can never land on the current one. Without it,
   * a slow response for user A could resolve after user B signs in and paint
   * A's conversations onto B's badge.
   */
  const generationRef = useRef(0);

  const applyIds = useCallback((next: Set<string>) => {
    idsRef.current = next;
    setUnreadIds(next);
  }, []);

  const mutateIds = useCallback(
    (mutate: (current: Set<string>) => Set<string> | null) => {
      const current = idsRef.current;
      const next = mutate(current);
      if (!next || next === current) return;
      applyIds(next);
    },
    [applyIds]
  );

  const refresh = useCallback(async () => {
    if (!userId) {
      applyIds(new Set());
      return;
    }
    const generation = generationRef.current;
    const next = await fetchServerUnreadSet(userId, idsRef.current);
    // A newer session (or a newer read for the same one) has superseded this
    // response; applying it now would resurrect a stale set.
    if (generation !== generationRef.current) return;
    applyIds(next);
  }, [userId, applyIds]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    // Every effect run is a new session generation: any read still in flight
    // for a previous one is now stale and its result will be discarded.
    generationRef.current += 1;

    if (!userId) {
      applyIds(new Set());
      return;
    }

    // Start clean, then read the server truth.
    applyIds(new Set());
    void refresh();

    // Incoming message: the conversation is unread until proven otherwise.
    const handleMessageCreated = (payload: unknown) => {
      const conversationId = (payload as { conversationId?: string })?.conversationId;
      if (!conversationId) return;
      mutateIds((current) => {
        if (current.has(conversationId)) return null;
        const next = new Set(current);
        next.add(conversationId);
        return next;
      });
      scheduleRefresh();
    };
    const unsubCreated = subscribeToMessages(userId, 'message.created', handleMessageCreated);

    // Local read (user opened the conversation): leave the set, then reconcile.
    const unsubRead = onConversationRead((conversationId) => {
      mutateIds((current) => {
        if (!current.has(conversationId)) return null;
        const next = new Set(current);
        next.delete(conversationId);
        return next;
      });
      scheduleRefresh();
    });

    // SSE (re)connect: events lost while the stream was down are re-read.
    const channel = getMessageRealtime(userId);
    const unsubReconnect = channel?.onReconnect(() => {
      void refresh();
    });

    // Tab refocus: reconcile anything missed while the page was hidden.
    const handleVisibility = () => {
      if (!document.hidden) void refresh();
    };
    const handleFocus = () => {
      void refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      unsubCreated();
      unsubRead();
      unsubReconnect?.();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      applyIds(new Set());
    };
  }, [userId, applyIds, mutateIds, refresh, scheduleRefresh]);

  const value = useMemo(() => ({ count: unreadIds.size }), [unreadIds]);

  return <UnreadBadgeContext.Provider value={value}>{children}</UnreadBadgeContext.Provider>;
}

export function useUnreadConversationCount(): UnreadBadgeValue {
  return useContext(UnreadBadgeContext);
}