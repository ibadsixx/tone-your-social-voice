import { dataClient } from '@/lib/supabase/dataClient';
import { createNotification } from '@/hooks/useNotifications';

export type MessageRequestCategory = 'you_may_know' | 'spam';

// True when `userId` and `otherUserId` are ACCEPTED friends (either direction
// of the friendship row). This is the single data-layer friendship check used
// by the send paths so "existing friends -> normal chat, NO message request"
// (messages.md Test 5) is decided identically everywhere. Never throws.
export const hasAcceptedFriendship = async (
  userId?: string,
  otherUserId?: string
): Promise<boolean> => {
  if (!userId || !otherUserId || userId === otherUserId) return false;
  try {
    const { data, error } = await dataClient
      .from('friends')
      .select('id')
      .or(`and(requester_id.eq.${userId},receiver_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},receiver_id.eq.${userId})`)
      .eq('status', 'accepted')
      .maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error('[messageRequests] Error checking friendship:', error);
    return false;
  }
};

// Client-side fallback for the Maybe-you-know / Spam classification. The
// AUTHORITATIVE source is now the Gateway: `POST /api/message_requests` is
// intercepted by the dataClient and the category is computed on the friends host
// (friends and conversations live in separate projects, so client-side / DB
// cross-project joins are not reliable — see `dataClient/src/features/
// messageRequestCategory.ts`). The client supplies a best guess so behavior is
// correct even while a dataClient without the feature is still deployed, but the
// dataClient always overrides.
//
// Exact messages.md semantics — the stored value is the DB enum 'you_may_know',
// displayed as "Maybe you know":
//   'you_may_know' — >= 1 MUTUAL ACCEPTED friend: friends(S) ∩ friends(R)
//   'spam'         — restricted/blocked sender, or zero mutual accepted friends
// Followers, following, profile visits, likes and a PENDING friend request are
// NOT substitutes for mutual friendship (messages.md). Never throws.
export const determineMessageRequestCategory = async (
  currentUserId?: string,
  otherUserId?: string
): Promise<MessageRequestCategory> => {
  if (!currentUserId || !otherUserId || currentUserId === otherUserId) {
    return 'spam';
  }

  const acceptedFriends = async (userId: string): Promise<Set<string>> => {
    const { data, error } = await dataClient
      .from('friends')
      .select('requester_id, receiver_id')
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'accepted');
    if (error) throw error;
    const ids = new Set<string>();
    for (const f of (data || []) as Array<{ requester_id?: string; receiver_id?: string }>) {
      if (!f) continue;
      const other = f.requester_id === userId ? f.receiver_id : f.requester_id;
      if (typeof other === 'string') ids.add(other);
    }
    return ids;
  };

  try {
    // Restricted users are always spam.
    const { data: restricted } = await dataClient
      .from('restricted_users')
      .select('id')
      .eq('user_id', otherUserId)
      .eq('restricted_user_id', currentUserId)
      .maybeSingle();
    if (restricted) return 'spam';

    // Mutual friends: intersection of the two users' actual accepted friendships.
    const [myFriends, theirFriends] = await Promise.all([
      acceptedFriends(currentUserId),
      acceptedFriends(otherUserId),
    ]);
    for (const id of myFriends) {
      if (theirFriends.has(id)) return 'you_may_know';
    }
    return 'spam';
  } catch (error) {
    console.error('[messageRequests] Error determining category:', error);
    return 'spam';
  }
};

// Best-effort registration of a single pending message request tied to a Send
// event and to the existing conversation it was launched from.
//
// Exactly one pending request exists per conversation:
//   ONE conversation -> ONE pending request -> MANY messages
//
// The request's CATEGORY (maybe_you_know | spam) is decided ONCE — when this
// FIRST request row is created (messages.md: "the category is created only when
// the first Message Request is made"). The Gateway computes it on insert
// (authoritative); the optional `category` param is a client best-guess
// fallback. Because later sends find the existing row in step (2) and stop, the
// category can never be re-classified by a per-message send.
//
// ensureMessageRequest (NOT createMessageRequest): every send fuses through
// this single well-known function, which checks-before-creates and so reuses
// the existing pending request rather than minting one per message.
//
//   1. Check BEFORE creating — query for an existing request row for this
//      sender/receiver pair in ANY state and reuse/respect it. The
//      sender/receiver pair is schema-stable (it is the original UNIQUE key),
//      so this check works whether or not the conversation_id migration has
//      been applied to the live host yet.
//   2. A row that already exists is left untouched regardless of its state:
//      still-pending requests are reused (no duplicate insert), and an
//      ACCEPTED request is never turned back into a pending one — so once the
//      recipient accepts, continuing to chat can never mint a second Message
//      Request (the acceptance invariant in messages.md).
//   3. Only if no row exists at all, insert a single pending request carrying
//      the conversation_id it arose from (conversation_id is never a uniqueness
//      check on its own here; message_id is never used as a key at all).
//   4. The DB enforces this authoritatively for concurrency: a partial UNIQUE
//      index on conversation_id WHERE status = 'pending' rejects any concurrent
//      second pending insert, and the pre-existing UNIQUE(sender_id,
//      receiver_id) still stops a second request for the same pair — so two
//      near-simultaneous sends can never create two requests.
//
// An already-accepted/declined/blocked request is left untouched. Never throws.
export const ensureMessageRequest = async (params: {
  senderId: string;
  receiverId: string;
  conversationId?: string;
  category?: MessageRequestCategory;
}): Promise<void> => {
  const { senderId, receiverId, conversationId, category } = params;
  const resolvedCategory =
    category ?? (await determineMessageRequestCategory(senderId, receiverId));

  // (1) Check-before-create. Look for an existing request row for this
  // sender/receiver pair in ANY state (the schema-stable UNIQUE key). The pair
  // filter alone is enough to dedup and works whether or not a conversation_id
  // column exists on the live host. The check deliberately does NOT filter by
  // status: an ACCEPTED request must short-circuit here so the pair is never
  // re-inserted (a second Message Request) after the recipient accepts.
  const { data: existing } = await dataClient
    .from('message_requests')
    .select('id, status')
    .eq('sender_id', senderId)
    .eq('receiver_id', receiverId)
    .maybeSingle();

  // TRACE: existing-request lookup (point 3)
  console.debug('[trace:request]', {
    step: 'existing_check',
    sender_id: senderId,
    receiver_id: receiverId,
    conversation_id: conversationId ?? null,
    existing_request_id: (existing as { id?: string } | null)?.id ?? null,
    existing_status: (existing as { status?: string } | null)?.status ?? null,
  });

  // (2) A row already exists for this pair — reuse it while pending, and never
  // resurrect an accepted/declined/blocked request. This is what keeps
  // "1 Message Request" true across the acceptance transition: after Accept
  // (status -> accepted), subsequent messages find `existing` and stop here
  // instead of attempting a second insert.
  if (existing) {
    return;
  }

//   (3) Insert one pending request carrying the conversation_id it arose from
  //       (messages.md: conversation_id is the identity of the request
  //       relationship — NEVER message_id, NEVER "one request per message").
  //   (4) The DB enforces this authoritatively for concurrency: a partial UNIQUE
  //       index on conversation_id WHERE status = 'pending' rejects any concurrent
  //       second pending insert for the same conversation
  //       (20260902000000_add_conversation_id_to_message_requests.sql), and the
  //       pre-existing UNIQUE(sender_id, receiver_id) still stops a second
  //       request for the same pair — so two near-simultaneous sends can never
  //       create two requests.
  //
  // An already-accepted/declined/blocked request is left untouched. Never throws.
  const insertRequest = (withConversationId: boolean) =>
    dataClient
      .from('message_requests')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'pending',
        category: resolvedCategory,
        ...(withConversationId && conversationId ? { conversation_id: conversationId } : {}),
      })
      .select('id, sender_id, receiver_id, status');

  // Write the request. If the live host does not yet have the conversation_id
  // column (the migration has not been applied there), fall back to the
  // schema-stable insert so messaging is never broken during a migration window.
  let insertResult = await insertRequest(Boolean(conversationId));

  // The dataClient historically masks insert failures with a generic `500
  // {"error":"Internal server error"}` and never surfaces the underlying
  // Postgres 42703, so parsing the error text to detect the missing
  // `conversation_id` column is unreliable. Instead, whenever the first insert
  // failed for any NON-duplicate reason and a conversation_id was supplied,
  // retry ONCE with the schema-stable payload (no conversation_id). A
  // duplicate (409/23505) already means the request exists — desired. Any other
  // real failure (RLS, network) fails again on the retry and is surfaced below.
  const isDuplicateRequest = (err: { code?: string }) =>
    err.code === '23505' || err.code === '409';

  if (insertResult.error && conversationId && !isDuplicateRequest(insertResult.error)) {
    console.warn(
      '[messageRequests] insert with conversation_id failed — retrying schema-stable:',
      insertResult.error.message || insertResult.error.code
    );
    insertResult = await insertRequest(false);
  }
  const reqError = insertResult.error;

  if (reqError) {
    // The dataClient client reports error.code as an HTTP status, so a duplicate
    // (Postgres 23505 unique violation on sender_id/receiver_id or the pending
    // conversation_id index) surfaces as 409. A duplicate means another request
    // already exists — exactly what we want — so it is not an error.
    if (!isDuplicateRequest(reqError)) {
      console.error('[messageRequests] Message request insert error:', reqError);
    }
    return;
  }

  createNotification({
    userId: receiverId,
    actorId: senderId,
    type: 'message_request',
    message: 'sent you a message'
  });
};

// Resolves the conversation_id backing a message_request notification so a
// click can open the SAME conversation the sender is in (Chats) and the
// recipient has in Pending — never a different one. The notification row itself
// carries no conversation reference, so we derive it from the authoritative
// message_requests row for this sender/receiver pair (whose conversation_id was
// set when the request was created from the send's conversation). Best-effort:
// returns undefined when there is no request row (so the caller can fall back
// to the generic Messages page) rather than creating anything.
export const resolveMessageRequestConversation = async (
  senderId: string,
  receiverId: string
): Promise<string | undefined> => {
  if (!senderId || !receiverId || senderId === receiverId) return undefined;

  // The live `message_requests` table has no `conversation_id` column, so the
  // notification -> conversation link is derived from the SAME conversation the
  // request arose from: the shared DM between the sender and receiver, found via
  // conversation_participants. This preserves "open the same conversation" on
  // the schema that actually exists.
  try {
    const { data: myParts } = await dataClient
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', senderId);

    const myIds = (myParts || []).map(p => p.conversation_id);
    if (myIds.length === 0) return undefined;

    const { data: shared } = await dataClient
      .from('conversation_participants')
      .select('conversation_id')
      .in('conversation_id', myIds)
      .eq('user_id', receiverId);

    const sharedIds = [...new Set((shared || []).map(p => p.conversation_id))];
    if (sharedIds.length === 0) return undefined;

    const { data: convs } = await dataClient
      .from('conversations')
      .select('id, type')
      .in('id', sharedIds);
    const dm = (convs || []).find(c => c.type === 'dm');

    // TRACE: notification -> conversation resolution read (point 7)
    console.debug('[trace:notification-conversation]', {
      sender_id: senderId,
      receiver_id: receiverId,
      resolved_conversation_id: dm?.id ?? null,
    });

    return dm?.id as string | undefined;
  } catch (error) {
    console.warn('[messageRequests] Resolve request conversation failed:', error);
    return undefined;
  }
};
