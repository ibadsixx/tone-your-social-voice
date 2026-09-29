// Local read-notification bus (do.md "Fix the Messages unread notification
// badge").
//
// The global Messages-nav badge lives in `useUnreadConversationCount.tsx`,
// which cannot see the `useConversations` instance that runs the Messages
// page. Marking a conversation read is a local action — the caller's own
// `message_reads` write — so it produces NO realtime event the badge process
// can hear (SSE `message.read` events flow the other way, to the sender of the
// messages that were read). This tiny module lets the one funnel every read
// already goes through (`markMessagesAsRead`) tell the badge `conversationId`
// is no longer unread, so the nav badge decrements immediately (do.md §7)
// instead of waiting for the next server reconcile.
//
// Module-level rather than React context on purpose: `markMessagesAsRead` is a
// plain function inside a hook, is mounted in several places (Messages page,
// mini chat windows, page detail), and must not be coupled to the badge
// provider's render tree. A Set of listeners survives all of that.
//
// No system is created here that did not already exist — this is the same
// module-scope signalling pattern as `getMessageRealtime()`:
// `notifyConversationRead` is the publish, `onConversationRead` the subscribe.

type ReadListener = (conversationId: string) => void;

const listeners = new Set<ReadListener>();

/** Subscribe to "a conversation was just marked read locally". Returns an unsubscribe. */
export function onConversationRead(listener: ReadListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Emit "a conversation was just marked read locally" (best-effort, never throws). */
export function notifyConversationRead(conversationId: string): void {
  if (!conversationId) return;
  for (const listener of [...listeners]) {
    try {
      listener(conversationId);
    } catch {
      // The badge must never break the mark-as-read path it is notified from.
    }
  }
}