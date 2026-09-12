import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { usePageSwitch } from '@/contexts/PageSwitchContext';
import {
  getOrCreateDM as apiGetOrCreateDM,
  markConversationMessagesRead,
  getConversationReadStatus,
  getMyReadMessageIds,
  markMessageDelivered,
  publishChannelPost,
} from '@/api/conversations';
import { initConversationEncryption, decryptContent, isEncryptionReady } from '@/lib/conversationEncryption';
import { loadEcdhPrivateKey } from '@/hooks/useEncryptionKeys';
import { playMessageNotification } from '@/lib/notificationSounds';
import { parseCallLog, callLogLabel, formatCallDuration } from '@/lib/callLog';
import { subscribeToMessages, getMessageRealtime } from '@/lib/messageRealtime';
import { ensureMessageRequest, hasAcceptedFriendship } from '@/lib/messageRequests';
import { isOnline } from '@/hooks/usePresence';

// Call-log messages store a JSON envelope in `content`; show a readable label
// ("Malak missed your voice call") in conversation-list previews, phrased from
// the viewing user's side where participant names are known.
function previewContent(content: string | null | undefined, viewerId?: string): string {
  const call = parseCallLog(content);
  if (!call) return content || '';
  const base = callLogLabel(call, viewerId);
  return call.duration > 0 && call.status === 'ended'
    ? `${base} · ${formatCallDuration(call.duration)}`
    : base;
}

async function tryDecryptMessage(msg: Message, convId: string): Promise<Message> {
  if (msg.encrypted_content && msg.encryption_iv) {
    const decrypted = await decryptContent(convId, msg.encrypted_content, msg.encryption_iv);
    if (decrypted !== null) {
      return { ...msg, content: decrypted, encrypted_content: undefined, encryption_iv: undefined };
    }
  }
  return msg;
}

// Returns the set of user IDs whose DM is a normal Chats conversation for
// `userId` — i.e. the other participant is an accepted friend OR has an
// accepted message request with `userId`. Everyone else (a first DM from a
// non-friend) is treated as a pending Message Request and held out of Chats,
// mirroring Facebook.
//
// Computed client-side from the `friends` and `message_requests` tables so it
// stays correct even when a `message_requests` row is missing (the server
// trigger that creates it can abort on the conversations host because it
// references `friends`/`restricted_users` in the users host). This is what
// keeps a non-friend's conversation from leaking into the normal Chats tab.
//
// `message_requests` is the source of truth for sender-initiated DMs: the
// conversation_id written on each request I *sent* is surfaced directly in MY
// Chats regardless of acceptance status. The recipient sees the same request in
// Pending until they accept.
export async function fetchVisibleDmUserIds(userId: string): Promise<{
  visibleUserIds: Set<string>;
  visitedConversationIds: Set<string>;
}> {
  const visibleUserIds = new Set<string>();
  // Conversations the current user initiated a message request on. Because the
  // row carries conversation_id, the sender Chats filter can match C directly
  // instead of re-deriving the peer, so `message_requests` drives the inbox.
  const visitedConversationIds = new Set<string>();
  try {
    // Accepted friends (both directions).
    const { data: friends } = await gateway
      .from('friends')
      .select('requester_id, receiver_id')
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'accepted');
    (friends || []).forEach(f => {
      if (f.requester_id === userId) visibleUserIds.add(f.receiver_id);
      if (f.receiver_id === userId) visibleUserIds.add(f.requester_id);
    });

    // Accepted message requests also surface in Chats: a request I accepted
    // makes its sender a normal inbox peer.
    const { data: inRequests } = await gateway
      .from('message_requests')
      .select('sender_id, status')
      .eq('receiver_id', userId);
    (inRequests || []).forEach(req => {
      if (req.status === 'accepted') visibleUserIds.add(req.sender_id);
    });

    // Requests where I am the SENDER: I initiated the DM, so that conversation
    // shows in MY Chats regardless of acceptance status — the recipient sees it
    // in Pending (Maybe-you-know / Spam) until they accept. Visibility is driven
    // by the peer (receiver_id) here; the definitive author-visible guard is
    // the `messages` the user sent (fetchSentConversationIds). Selecting only
    // columns that exist on `message_requests` keeps this working on schemas
    // that don't carry a conversation_id column.
    const { data: outRequests } = await gateway
      .from('message_requests')
      .select('receiver_id')
      .eq('sender_id', userId);
    (outRequests || []).forEach(req => {
      if (req.receiver_id) visibleUserIds.add(req.receiver_id);
    });

    // TRACE: sender Chats visibility read (point 5)
    console.debug('[trace:sender-chats]', {
      viewer_user_id: userId,
      outbound_request_rows: outRequests ?? [],
      visited_conversation_ids: [...visitedConversationIds],
      visible_ids_after_outbound: [...visibleUserIds],
    });
  } catch (error) {
    console.error('Error fetching friendship for inbox filtering:', error);
  }
  return { visibleUserIds, visitedConversationIds };
}

// Returns the set of conversation_ids in which `userId` has sent at least one
// message. A DM the user authored is always visible in their own Chats —
// regardless of friendship or whether the `message_requests` row was written
// (that row can be absent when its cross-host trigger aborts). This mirrors the
// DB's `get_conversations_with_info` fallback (`EXISTS messages WHERE
// sender_id = p_user_id`) and is what guarantees the conversation shows once the
// message insert succeeds, on the same tables the creation path already wrote.
async function fetchSentConversationIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const { data } = await gateway
      .from('messages')
      .select('conversation_id')
      .eq('sender_id', userId);
    (data || []).forEach(m => {
      if (m.conversation_id) ids.add(m.conversation_id);
    });
  } catch (error) {
    console.error('Error fetching sent conversations for inbox filtering:', error);
  }
  return ids;
}

// Drops DM conversations whose other participant is NOT an accepted friend and
// does NOT have an accepted message request for `userId` — those live only in
// the Message Request UI, not the normal Chats inbox.
//
// A conversation is kept if ANY of:
//   - its other participant is a visible peer (accepted friend, or accepted
//     request sender), OR
//   - `userId` is the SENDER of a message_request referencing this conversation
//     (`visitedConversationIds`; the sender-initiated non-friend DM case), OR
//   - the user has SENT a message in it (`sentInConversationIds`; a robust
//     fallback that survives a missing `message_requests` row, mirroring the
//     DB's `get_conversations_with_info` fallback).
export function filterRequestConversations(
  convs: { id: string; type: string }[],
  firstOtherPerConv: Map<string, string>,
  visibleUserIds: Set<string>,
  visitedConversationIds: Set<string> = new Set(),
  sentInConversationIds: Set<string> = new Set()
): { id: string; type: string }[] {
  return convs.filter(conv => {
    if (conv.type !== 'dm') return true;
    if (visitedConversationIds.has(conv.id)) return true;
    if (sentInConversationIds.has(conv.id)) return true;
    const otherId = firstOtherPerConv.get(conv.id);
    return !(otherId && !visibleUserIds.has(otherId));
  });
}

// Resolves the single "other" participant of a DM conversation — the inbox
// entry's `other_user.id`, falling back to querying `conversation_participants`
// (a DM always has exactly one other participant, so this is reliable even for
// a brand-new conversation that hasn't been refetched into the sidebar yet).
// Used by sendMessage for both the live SSE announce and the non-friend
// message-request registration.
export async function resolveDmReceiver(params: {
  conversationId: string;
  currentUserId: string;
  conversationsDataRef?: RefObject<Conversation[] | null>;
}): Promise<string | undefined> {
  const { conversationId, currentUserId, conversationsDataRef } = params;

  const fromInbox = conversationsDataRef?.current?.find(
    c => c.conversation_id === conversationId
  )?.other_user?.id;
  if (fromInbox) return fromInbox;

  const { data: participants } = await gateway
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .neq('user_id', currentUserId);
  return participants?.[0]?.user_id as string | undefined;
}

// True when `viewerId` is the RECIPIENT of a still-pending message request from
// this conversation's other participant. Such a conversation is opened READ-ONLY
// (previewable, not accepted), and until the recipient presses Accept the sender
// must not learn the messages were read — so read receipts are suppressed.
export async function isReadOnlyPendingConversation(
  conversationId: string,
  currentUserId: string
): Promise<boolean> {
  if (!conversationId || !currentUserId) return false;
  try {
    const otherId = await resolveDmReceiver({ conversationId, currentUserId });
    if (!otherId || otherId === currentUserId) return false;
    const { data: request } = await gateway
      .from('message_requests')
      .select('id')
      .eq('sender_id', otherId)
      .eq('receiver_id', currentUserId)
      .eq('status', 'pending')
      .maybeSingle();
    return !!request?.id;
  } catch (error) {
    return false;
  }
}

// True when the user may send a message in this conversation. Sends are refused
// while the conversation is a still-pending INCOMING message request: the
// recipient may only preview until they explicitly press Accept. Refusing at
// this data layer (not the UI hide-the-composer trick) is what guarantees a
// stray send can never implicitly accept the request nor pull the conversation
// into the recipient's Chats via "sent a message".
export async function assertCanSendMessage(
  conversationId: string,
  currentUserId: string
): Promise<boolean> {
  if (!conversationId || !currentUserId) return true;
  return !(await isReadOnlyPendingConversation(conversationId, currentUserId));
}

// Group Chat presence: returns a map of group conversation_id → number of
// OTHER members currently online. Only group members (from
// `conversation_participants`) count, the current user is excluded, and a
// member is online only when their `profiles.last_seen_at` is fresh (the same
// `isOnline` source DMs use).
async function fetchGroupOnlineCounts(
  groupConvIds: string[],
  userId: string
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (groupConvIds.length === 0) return counts;

  const { data: groupParts } = await gateway
    .from('conversation_participants')
    .select('conversation_id, user_id')
    .in('conversation_id', groupConvIds)
    .neq('user_id', userId);

  const groupMemberIds = [...new Set((groupParts || []).map(p => p.user_id))];
  let profileMap = new Map<string, string | undefined>();
  if (groupMemberIds.length > 0) {
    const { data: groupProfiles } = await gateway
      .from('profiles')
      .select('id, last_seen_at')
      .in('id', groupMemberIds);
    profileMap = new Map((groupProfiles || []).map(p => [p.id, p.last_seen_at]));
  }

  (groupParts || []).forEach(p => {
    const lastSeen = profileMap.get(p.user_id);
    if (lastSeen && isOnline(lastSeen)) {
      counts.set(p.conversation_id, (counts.get(p.conversation_id) || 0) + 1);
    }
  });
  return counts;
}

export async function fetchConversationsDirectly(userId: string): Promise<Conversation[]> {
  const { data: participants } = await gateway
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId);

  console.debug('[trace:fetch-convs]', {
    viewer_user_id: userId,
    participant_conversation_ids: (participants || []).map(p => p.conversation_id),
  });

  if (!participants || participants.length === 0) return [];

  const convIds = participants.map(p => p.conversation_id);

  const { data: convs } = await gateway
    .from('conversations')
    .select('id, type, name, description, group_image, created_at, updated_at')
    .in('id', convIds);

  if (!convs) return [];

  const { data: otherParts } = await gateway
    .from('conversation_participants')
    .select('conversation_id, user_id')
    .in('conversation_id', convIds)
    .neq('user_id', userId);

  const firstOtherPerConv = new Map<string, string>();
  (otherParts || []).forEach(p => {
    if (!firstOtherPerConv.has(p.conversation_id)) {
      firstOtherPerConv.set(p.conversation_id, p.user_id);
    }
  });

  const { visibleUserIds, visitedConversationIds } = await fetchVisibleDmUserIds(userId);
  const sentInConversationIds = await fetchSentConversationIds(userId);
  const visibleConvs = filterRequestConversations(
    convs,
    firstOtherPerConv,
    visibleUserIds,
    visitedConversationIds,
    sentInConversationIds
  );
  const convIds2 = visibleConvs.map(c => c.id);
  if (convIds2.length === 0) return [];

  const otherUserIds = [...new Set(firstOtherPerConv.values())];
  const { data: profilesData } = await gateway
    .from('profiles')
    .select('id, username, display_name, profile_pic, last_seen_at')
    .in('id', otherUserIds);

  const profileMap = new Map((profilesData || []).map(p => [p.id, p]));

  const { data: allMessages } = await gateway
    .from('messages')
    .select('conversation_id, content, created_at')
    .in('conversation_id', convIds2)
    .order('created_at', { ascending: false })
    .limit(200);

  const lastMsgMap = new Map<string, { content: string; created_at: string }>();
  (allMessages || []).forEach(msg => {
    if (!lastMsgMap.has(msg.conversation_id)) {
      lastMsgMap.set(msg.conversation_id, msg);
    }
  });

  // Group Chat presence: count OTHER online group members (current user
  // excluded) using the same `profiles.last_seen_at` online source as DMs.
  const groupConvIds = visibleConvs.filter(c => c.type === 'group').map(c => c.id);
  const groupOnlineCounts = await fetchGroupOnlineCounts(groupConvIds, userId);

  // Channel unread counts. Channels reuse the existing read-state architecture
  // (`message_reads`): UNREAD = recent channel messages sent by others that the
  // current user has no `message_reads` row for. DM/group unread stays 0 as
  // before — this must never collide with the messaging read-receipt system.
  const unreadMap = new Map<string, number>();
  const channelIds = visibleConvs.filter(c => c.type === 'channel').map(c => c.id);
  if (channelIds.length > 0) {
    const { data: chanMsgs } = await gateway
      .from('messages')
      .select('id, conversation_id, sender_id')
      .in('conversation_id', channelIds)
      .limit(500);
    if (chanMsgs && chanMsgs.length > 0) {
      const chanMsgIds = chanMsgs.map(m => m.id);
      const { data: myChannelReads } = await getMyReadMessageIds(chanMsgIds, userId);
      const readSet = new Set(myChannelReads || []);
      for (const convId of channelIds) {
        const unread = (chanMsgs || []).filter(
          m => m.conversation_id === convId && m.sender_id !== userId && !readSet.has(m.id)
        ).length;
        unreadMap.set(convId, unread);
      }
    }
  }

  return visibleConvs.map(conv => {
    const otherUserId = firstOtherPerConv.get(conv.id);
    const otherProfile = otherUserId ? profileMap.get(otherUserId) : null;
    const lastMsg = lastMsgMap.get(conv.id);

    return {
      conversation_id: conv.id,
      type: conv.type,
      name: conv.name ?? undefined,
      description: conv.description,
      group_image: conv.group_image ?? undefined,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      other_user: conv.type !== 'dm' ? undefined : otherProfile ? {
        id: otherProfile.id,
        username: otherProfile.username,
        display_name: otherProfile.display_name,
        profile_pic: otherProfile.profile_pic,
        last_seen_at: otherProfile.last_seen_at,
      } : undefined,
      online_count: conv.type === 'group' ? (groupOnlineCounts.get(conv.id) || 0) : undefined,
      last_message: lastMsg ? {
        content: previewContent(lastMsg.content, userId),
        created_at: lastMsg.created_at,
      } : undefined,
      unread_count: conv.type === 'channel' ? (unreadMap.get(conv.id) || 0) : 0,
    };
  });
}

async function fetchPageConversationsDirectly(pageId: string, userId: string): Promise<Conversation[]> {
  const { data: convs } = await gateway
    .from('conversations')
    .select('id, type, name, description, created_at, updated_at')
    .eq('page_id', pageId)
    .order('updated_at', { ascending: false });

  if (!convs || convs.length === 0) return [];

  const convIds = convs.map(c => c.id);

  const { data: otherParts } = await gateway
    .from('conversation_participants')
    .select('conversation_id, user_id')
    .in('conversation_id', convIds)
    .neq('user_id', userId);

  const firstOtherPerConv = new Map<string, string>();
  (otherParts || []).forEach(p => {
    if (!firstOtherPerConv.has(p.conversation_id)) {
      firstOtherPerConv.set(p.conversation_id, p.user_id);
    }
  });

  const otherUserIds = [...new Set(firstOtherPerConv.values())];
  const { data: profilesData } = await gateway
    .from('profiles')
    .select('id, username, display_name, profile_pic, last_seen_at')
    .in('id', otherUserIds);

  const profileMap = new Map((profilesData || []).map(p => [p.id, p]));

  const { visibleUserIds, visitedConversationIds } = await fetchVisibleDmUserIds(userId);
  const pageSentIds = await fetchSentConversationIds(userId);
  const visibleConvs = filterRequestConversations(convs, firstOtherPerConv, visibleUserIds, visitedConversationIds, pageSentIds);
  const convIds2 = visibleConvs.map(c => c.id);
  if (convIds2.length === 0) return [];

  const { data: allMessages } = await gateway
    .from('messages')
    .select('conversation_id, content, created_at')
    .in('conversation_id', convIds2)
    .order('created_at', { ascending: false })
    .limit(200);

  const lastMsgMap = new Map<string, { content: string; created_at: string }>();
  (allMessages || []).forEach(msg => {
    if (!lastMsgMap.has(msg.conversation_id)) {
      lastMsgMap.set(msg.conversation_id, msg);
    }
  });

  return visibleConvs.map(conv => {
    const otherUserId = firstOtherPerConv.get(conv.id);
    const otherProfile = otherUserId ? profileMap.get(otherUserId) : null;
    const lastMsg = lastMsgMap.get(conv.id);

    return {
      conversation_id: conv.id,
      type: conv.type,
      name: conv.name ?? undefined,
      description: conv.description,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      other_user: otherProfile ? {
        id: otherProfile.id,
        username: otherProfile.username,
        display_name: otherProfile.display_name,
        profile_pic: otherProfile.profile_pic,
        last_seen_at: otherProfile.last_seen_at,
      } : undefined,
      last_message: lastMsg ? {
        content: previewContent(lastMsg.content, userId),
        created_at: lastMsg.created_at,
      } : undefined,
      unread_count: 0,
    };
  });
}

type Conversation = {
  conversation_id: string;
  type: string;
  name?: string;
  description?: string | null;
  group_image?: string | null;
  created_at: string;
  updated_at: string;
  other_user?: {
    id: string;
    username: string;
    display_name: string;
    profile_pic?: string;
    last_seen_at?: string;
  };
  last_message?: {
    content?: string;
    created_at: string;
  };
  unread_count: number;
  online_count?: number;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content?: string;
  attachment_url?: string;
  image_url?: string;
  media_url?: string;
  is_image?: boolean;
  is_gif?: boolean;
  gif_url?: string;
  is_sticker?: boolean;
  sticker_url?: string;
  sticker_id?: string;
  sticker_set?: string;
  audio_url?: string;
  audio_duration?: number;
  audio_mime?: string;
  audio_size?: number;
  audio_path?: string;
  message_type?: 'text' | 'image' | 'gif' | 'sticker' | 'audio' | 'video' | 'file' | 'poll';
  is_system?: boolean;
  created_at: string;
  reply_to_id?: string;
  reply_to?: {
    id: string;
    content?: string;
    image_url?: string | null;
    media_url?: string | null;
    attachment_url?: string | null;
    is_image?: boolean | null;
    sender_profile?: {
      display_name: string;
    };
  } | null;
  sender_profile?: {
    username: string;
    display_name: string;
    profile_pic?: string;
  };
  encrypted_content?: string;
  encryption_iv?: string;
  seen?: boolean;
  delivered?: boolean;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content?: string;
  attachment_url?: string;
  image_url?: string;
  media_url?: string;
  is_image?: boolean;
  is_gif?: boolean;
  gif_url?: string;
  is_sticker?: boolean;
  sticker_url?: string;
  sticker_id?: string;
  sticker_set?: string;
  audio_url?: string;
  audio_duration?: number;
  audio_mime?: string;
  audio_size?: number;
  audio_path?: string;
  reply_to_id?: string;
  delivered_at?: string;
  created_at: string;
  message_type?: string;
  is_system?: boolean;
  sender_profile: {
    username: string;
    display_name: string;
    profile_pic?: string;
  } | null;
};

export const useConversations = (currentUserId?: string) => {
  const { actingPage } = usePageSwitch();
  const actingPageId = actingPage?.id;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number>(-1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const { toast } = useToast();

  // Fetch conversations using the new RPC
  const fetchConversations = useCallback(async () => {
    if (!currentUserId) return;

    if (actingPageId) {
      try {
        const pageConvs = await fetchPageConversationsDirectly(actingPageId, currentUserId);
        setConversations(pageConvs);
      } catch (error) {
        console.error('Error fetching page conversations:', error);
        toast({
          title: "Error",
          description: "Failed to fetch page conversations",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const directConversations = await fetchConversationsDirectly(currentUserId);
      setConversations(directConversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast({
        title: "Error",
        description: "Failed to fetch conversations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [currentUserId, actingPageId, toast]);

  // Initialize E2EE for the active conversation
  const initEncryption = useCallback(async (convId: string) => {
    if (!currentUserId) return;
    try {
      const ecdhPrivKey = await loadEcdhPrivateKey();
      if (!ecdhPrivKey) return;
      await initConversationEncryption(convId, currentUserId, ecdhPrivKey);
    } catch {
      // Encryption not available — messages fall back to plaintext
    }
  }, [currentUserId]);

  useEffect(() => {
    if (activeConversationId && currentUserId) {
      initEncryption(activeConversationId);
    }
  }, [activeConversationId, currentUserId, initEncryption]);

  // Fetch messages for a specific conversation
  const fetchMessages = async (conversationId: string, page = 0, limit = 50, readOnly = false) => {
    if (!currentUserId) {
      return;
    }

    // Auto-detect read-only even when the caller didn't pass it. The read-only
    // state is a property of "current user is the recipient of a still-pending
    // request from this conversation's other participant", so every internal
    // refetch (URL sync, 5s active poll, call-log listener) respects it too —
    // otherwise refreshing or returning to a pending chat leaks read receipts
    // to the sender. Cheap single query only when the caller already decided.
    const autoReadOnly =
      !readOnly && (await isReadOnlyPendingConversation(conversationId, currentUserId));
    const effectiveReadOnly = readOnly || autoReadOnly;

    try {
      // Fetch messages with sender profile using explicit foreign key hint
      const { data, error } = await gateway
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          encrypted_content,
          encryption_iv,
          attachment_url,
          image_url,
          media_url,
          is_image,
          is_gif,
          gif_url,
          is_sticker,
          sticker_url,
          sticker_id,
          sticker_set,
          audio_url,
          audio_duration,
          audio_mime,
          audio_size,
          audio_path,
          reply_to_id,
          created_at,
          message_type,
          is_system,
          sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      if (error) {
        console.error('[useConversations] Supabase messages error:', error);
        throw error;
      }

      // Filter out messages cleared by this user (soft-delete)
      let clearedAt: string | null = null;
      if (data && data.length > 0) {
        const { data: clearRecord } = await gateway
          .from('conversation_clears')
          .select('cleared_at')
          .eq('user_id', currentUserId)
          .eq('conversation_id', conversationId)
          .maybeSingle();
        if (clearRecord) {
          clearedAt = clearRecord.cleared_at;
        }
      }

      // Format messages (reverse to show oldest first)
      const formattedMessages: Message[] = await Promise.all(
        (data?.reverse() || [])
          .filter(msg => !clearedAt || msg.created_at >= clearedAt)
          .map(async (msg: MessageRow) => {
          const base = {
            ...msg,
            reply_to: null,
            seen: false,
            delivered: !!msg.delivered_at
          };
          return tryDecryptMessage(base, conversationId);
        })
      );

      // Determine if more messages can be loaded
      const rawCount = data?.length || 0;
      setHasMoreMessages(rawCount >= limit && formattedMessages.length > 0);

      // Fetch reply_to messages separately if any messages have reply_to_id
      const replyIds = formattedMessages
        .filter(m => m.reply_to_id)
        .map(m => m.reply_to_id);

      if (replyIds.length > 0) {
        const { data: replyData, error: replyError } = await gateway
          .from('messages')
          .select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)')
          .in('id', replyIds);

        if (!replyError && replyData) {
          const replyMap = new Map(replyData.map(r => [r.id, r]));
          formattedMessages.forEach(msg => {
            if (msg.reply_to_id && replyMap.has(msg.reply_to_id)) {
              msg.reply_to = replyMap.get(msg.reply_to_id) || null;
            }
          });
        }
      }

      if (page === 0) {
        setHasMoreMessages(true);
        setMessages(formattedMessages);

        // Determine which messages have been read by other participants
        const { data: readData } = await getConversationReadStatus(conversationId, currentUserId);
        if (readData && readData.length > 0) {
          const seenIds = new Set(readData.map(r => r.message_id));
          setMessages(prev => prev.map(msg => {
            if (msg.sender_id === currentUserId && seenIds.has(msg.id)) {
              return { ...msg, seen: true };
            }
            return msg;
          }));
        }

        // Compute the boundary between already-read and new messages
        const messageIds = formattedMessages.map(m => m.id);
        if (messageIds.length > 0) {
          const { data: myReads } = await getMyReadMessageIds(messageIds, currentUserId);
          if (myReads && myReads.length > 0) {
            const readSet = new Set(myReads);
            const idx = formattedMessages.findIndex(m => !readSet.has(m.id));
            setFirstUnreadIndex(idx);
          } else {
            setFirstUnreadIndex(0);
          }
        }
      } else {
        setMessages(prev => [...formattedMessages, ...prev]);
      }

      // Mark messages as read. Skipped when the conversation is open as a
      // READ-ONLY pending message request: the sender must not learn the
      // recipient has read the message (via message_reads or the realtime
      // message.read ping) until the recipient presses Accept.
      if (!effectiveReadOnly) {
        await markMessagesAsRead(conversationId);
      }
    } catch (error) {
      console.error('[useConversations] Error fetching messages:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to fetch messages",
        variant: "destructive"
      });
    }
  };

  // Whether the current user and `receiverId` are accepted friends. Decides
  // whether a message lands as a plain DM or as a pending message request.
  const checkFriendship = (receiverId: string): Promise<boolean> =>
    hasAcceptedFriendship(currentUserId, receiverId);

  // Send a new message
  const sendMessage = async (conversationId: string, content?: string, attachmentUrl?: string, replyToId?: string, receiverId?: string) => {
    if (!currentUserId || (!content && !attachmentUrl)) return false;

    // A message request can only ever be accepted by an explicit recipient click
    // on the in-chat Accept bar (or the Pending list). As the RECIPIENT of a
    // still-pending request this conversation is read-only: a reply may not be
    // sent until the request is accepted. This guard is the single data-layer
    // choke point covering every composer (ChatWindow, MiniChatWindow,
    // SendMessageModal, MessagingTestInterface); it also prevents a stray send
    // from implicitly "accepting" the request.
    if (!(await assertCanSendMessage(conversationId, currentUserId))) {
      toast({
        title: 'Message request pending',
        description: 'Accept the message request before replying.',
        variant: 'destructive',
      });
      return false;
    }

    // Determine if the attachment is an image or video by file extension only
    const urlPath = attachmentUrl ? attachmentUrl.split('?')[0] : '';
    const isVideo = attachmentUrl && /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i.test(urlPath);
    const isImage = !isVideo && attachmentUrl && /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|svg)$/i.test(urlPath);

    let encryptedContent: string | undefined;
    let encryptionIv: string | undefined;

    const isText = !isImage && !isVideo;
    if (isText && content) {
      const encResult = isEncryptionReady(conversationId)
        ? await import('@/lib/conversationEncryption').then(m => m.encryptContent(conversationId, content))
        : null;
      if (encResult) {
        encryptedContent = encResult.encryptedContent;
        encryptionIv = encResult.iv;
      }
    }

    // Resolve the real recipient up front. An explicit receiverId (passed by
    // the caller, e.g. the profile you pressed "Message" on) always wins so a
    // freshly opened conversation preserves the intended recipient even when
    // the inbox hasn't refetched it yet. Otherwise fall back to the DM's other
    // participant. Never a placeholder like "unknown".
    const resolvedReceiverId: string | undefined =
      receiverId || (await resolveDmReceiver({ conversationId, currentUserId, conversationsDataRef }));

    try {
      // Channels are broadcast, not group chats: only owner/moderators publish,
      // and that authorization is enforced by the Gateway (POST
      // /conversations/:id/publish) — never by the client. Every other
      // conversation type uses the normal generic insert through the Gateway.
      const isChannelSend = conversationsDataRef.current.find(
        c => c.conversation_id === conversationId
      )?.type === 'channel';

      const insertPayload = {
        conversation_id: conversationId,
        sender_id: currentUserId,
        receiver_id: resolvedReceiverId || null,
        content: encryptedContent ? null : (isImage || isVideo ? (content || null) : content),
        encrypted_content: encryptedContent || null,
        encryption_iv: encryptionIv || null,
        attachment_url: attachmentUrl,
        image_url: isImage ? attachmentUrl : null,
        media_url: isVideo ? attachmentUrl : null,
        is_image: Boolean(isImage),
        message_type: isVideo ? 'video' : isImage ? 'image' : 'text',
        reply_to_id: replyToId || null
      } as Record<string, unknown>;

      const MESSAGE_SELECT = `
        id,
        conversation_id,
        sender_id,
        content,
        encrypted_content,
        encryption_iv,
        attachment_url,
        image_url,
        media_url,
        is_image,
        message_type,
        reply_to_id,
        created_at,
        sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
      `;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let error: any = null;

      if (isChannelSend) {
        const result = await publishChannelPost(conversationId, {
          content: (insertPayload.content as string | null) ?? null,
          imageUrl: (insertPayload.image_url as string | null) ?? null,
          mediaUrl: (insertPayload.media_url as string | null) ?? null,
          attachmentUrl: (insertPayload.attachment_url as string | null) ?? null,
        });
        data = result.data;
        error = result.error;
      } else {
        const result = await gateway
          .from('messages')
          .insert(insertPayload)
          .select(MESSAGE_SELECT)
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('[useConversations] Supabase message insert error:', error);
        
        const errorMessage = error.message?.includes('RLS') 
          ? 'You do not have permission to send messages to this conversation'
          : error.message?.includes('blocked')
          ? 'You cannot send messages to this user'
          : error.message || 'Failed to send message';
          
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
        return false;
      }

      // TRACE: message insertion (point 1-2)
      console.debug('[trace:send]', {
        step: 'message.insert',
        conversation_id: conversationId,
        sender_id: currentUserId,
        recipient_id_resolved: resolvedReceiverId,
        returned_message_id: data?.id ?? null,
        returned_conversation_id: data?.conversation_id ?? null,
      });

      // If reply_to_id exists, fetch the reply_to message data and add to messages state immediately
      if (data && replyToId) {
        const { data: replyData } = await gateway
          .from('messages')
          .select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)')
          .eq('id', replyToId)
          .single();

        const newMessage: Message = {
          ...data,
          reply_to: replyData || null,
          seen: false,
          delivered: false
        };

        setMessages(prev => [...prev, newMessage]);
      } else if (data) {
        // Add message without reply data
        const newMessage: Message = {
          ...data,
          reply_to: null,
          seen: false,
          delivered: false
        };
        setMessages(prev => [...prev, newMessage]);
      }

      // Announce the new message over the gateway's SSE hub so the receiver's
      // open client shows it live (gateway is the only entry point; the client
      // postgres_changes listeners never fire). Resolve the receiver from the
      // conversation participants so this works even when the partner's profile
      // row (and therefore other_user) isn't present in the in-memory list.
      // Best-effort: a publish failure never fails the send.
      if (data?.id) {
        try {
          const receiverId = resolvedReceiverId;

          if (receiverId && receiverId !== currentUserId) {
            getMessageRealtime(currentUserId)?.publish(
              'message.created',
              { type: 'message.created', conversationId, messageId: data.id },
              receiverId
            );
          }
        } catch (error) {
          console.warn('[useConversations] Realtime announce failed:', error);
        }

        // Non-friends: register a pending message request tied to the Send
        // event itself. This is what makes the recipient see the
        // Accept / Reject / Block UX ("Message Requests" / Pending). The
        // Maybe-you-know / Spam category is computed client-side from the
        // existing classification semantics (the server trigger cannot run on
        // the host that owns message_requests — it references friends /
        // restricted_users which live in another project), duplicates
        // (UNIQUE sender_id/receiver_id) are tolerated — so subsequent
        // messages to the same non-friend do not re-create the request, and
        // an already-accepted request is left untouched.
        //
        // Deliberately decoupled from the realtime announce above: a message
        // request must still be registered even if the receiver cannot be
        // resolved for live delivery (e.g. the partner isn't in the inbox and
        // the participants lookup fails) or the publish throws. It is its own
        // guarded step that resolves the receiver afresh from the DM's
        // participants (a DM always has exactly one other participant) so the
        // recipient reliably gets the pending-request UX. Best-effort: a
        // failure here still never fails the send, but it is logged rather than
        // swallowed so a regression stays visible.
        try {
          const receiverId = resolvedReceiverId;

          if (receiverId && receiverId !== currentUserId) {
            const areFriends = await checkFriendship(receiverId);
            if (!areFriends) {
              await ensureMessageRequest({
                senderId: currentUserId,
                receiverId,
                conversationId
              });
            }
          }
        } catch (error) {
          console.warn('[useConversations] Message request registration failed:', error);
        }
      }

      return true;
    } catch (error) {
      console.error('[useConversations] Error sending message:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      });
      return false;
    }
  };

  // Mark messages as read
  const markMessagesAsRead = async (conversationId: string) => {
    if (!currentUserId) return;

    // Defense-in-depth: never emit a read receipt for a conversation that is a
    // still-pending Message Request for the current user. This is the single
    // funnel for BOTH the message_reads write and the realtime message.read
    // ping, so gating it here guarantees the sender never sees ✓✓ for pending
    // requests — even if an earlier detection (e.g. during a race where
    // conversation_participants / the request row aren't queryable yet) would
    // have failed open. Suppression stays in effect until the recipient
    // presses Accept (request status -> accepted).
    if (await isReadOnlyPendingConversation(conversationId, currentUserId)) {
      return;
    }

    try {
      await markConversationMessagesRead(conversationId, currentUserId);

      // Channels keep their own unread state (independent of the messaging
      // read-receipt system): once an open channel's messages are marked read,
      // clear the Chats-list badge immediately instead of waiting for refetch.
      const readConv = conversationsDataRef.current.find(c => c.conversation_id === conversationId);
      if (readConv?.type === 'channel') {
        setConversations(prev => prev.map(c =>
          c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c
        ));
      }

      // Ping the other participant live so their client flips seen states
      // without waiting for a refetch. Best-effort.
      try {
        let receiverId = conversationsDataRef.current.find(
          c => c.conversation_id === conversationId
        )?.other_user?.id;
        if (!receiverId) {
          const { data: participants } = await gateway
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', currentUserId);
          receiverId = participants?.[0]?.user_id as string | undefined;
        }
        if (receiverId && receiverId !== currentUserId) {
          const unreadByThem = messagesRef.current.filter(
            m =>
              m.conversation_id === conversationId &&
              m.sender_id === receiverId &&
              !m.seen
          );
          if (unreadByThem.length > 0) {
            const channel = getMessageRealtime(currentUserId);
            for (const msg of unreadByThem) {
              channel?.publish(
                'message.read',
                { type: 'message.read', conversationId, messageId: msg.id, userId: receiverId },
                receiverId
              );
            }
          }
        }
      } catch {
        // non-fatal
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  // Get or create DM conversation
  const getOrCreateDM = async (otherUserId: string) => {
    if (!currentUserId) return null;

    try {
      const { data, error } = await apiGetOrCreateDM(currentUserId, otherUserId);

      if (error) throw error;

      if (actingPageId && data) {
        await gateway
          .from('conversations')
          .update({ page_id: actingPageId })
          .eq('id', data)
          .maybeSingle();
      }

      return data;
    } catch (error) {
      console.error('Error creating/getting conversation:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to create conversation",
        variant: "destructive"
      });
      return null;
    }
  };

  // Keep a ref to conversation IDs so the realtime callback isn't stale
  const conversationIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    conversationIdsRef.current = new Set(conversations.map(c => c.conversation_id));
  }, [conversations]);

  // Keep a ref to messages so the realtime callback can update seen status
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep a ref to conversations so the presence refresh interval isn't stale
  const conversationsDataRef = useRef<Conversation[]>([]);
  useEffect(() => {
    conversationsDataRef.current = conversations;
  }, [conversations]);

  // Debounced version of fetchConversations to avoid rapid refetches
  const debouncedFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetchConversations = useCallback(() => {
    if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current);
    debouncedFetchRef.current = setTimeout(() => {
      fetchConversations();
    }, 500);
  }, [fetchConversations]);

  // Set up real-time subscriptions. The gateway is the only entry point and
  // its client-side postgres_changes listeners never fire, so we subscribe to
  // the gateway's SSE hub on our own `user:<currentUserId>` channel instead.
  // A sender publishes `message.created` (etc.) to the receiver's channel after
  // a DB insert; this listener turns those events into live UI updates.
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!currentUserId) return;

    const handleMessageCreated = async (payload: unknown) => {
      const evt = payload as {
        conversationId?: string;
        messageId?: string;
      };
      const msgConvId = evt?.conversationId;
      const messageId = evt?.messageId;
      if (!msgConvId || !messageId) return;

      // Always refresh the conversation list (last-message preview + unread
      // counts), whether or not this chat is currently open on screen.
      debouncedFetchConversations();

      // Only append inline if this is the chat currently open on screen.
      if (!activeConversationIdRef.current || msgConvId !== activeConversationIdRef.current) {
        return;
      }

      const { data: msgData } = await gateway
        .from('messages')
        .select(`
          id, conversation_id, sender_id, content, encrypted_content, encryption_iv,
          attachment_url, image_url, media_url, is_image,
          is_gif, gif_url, is_sticker, sticker_url, sticker_id, sticker_set,
          audio_url, audio_duration, audio_mime, audio_size, audio_path,
          reply_to_id, created_at, message_type, is_system,
          sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
        `)
        .eq('id', messageId)
        .single();

      if (!msgData) return;

      if (msgData.sender_id === currentUserId) return;

      // Acknowledge delivery to the sender (DB write + live SSE ping).
      markMessageDelivered(msgData.id).catch(() => {});
      try {
        const senderId = msgData.sender_id;
        if (senderId && senderId !== currentUserId) {
          getMessageRealtime(currentUserId)?.publish(
            'message.delivered',
            { type: 'message.delivered', conversationId: msgConvId, messageId: msgData.id },
            senderId
          );
        }
      } catch {
        // non-fatal
      }

      let replyData = null;
      if (msgData.reply_to_id) {
        const { data: replyResult } = await gateway
          .from('messages')
          .select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)')
          .eq('id', msgData.reply_to_id)
          .single();
        replyData = replyResult;
      }

      const plainMessage = await tryDecryptMessage(msgData as Message, msgConvId);
      const fullMessage: Message = {
        ...plainMessage,
        reply_to: replyData,
        seen: false,
        delivered: !!msgData.delivered_at,
      };

      setMessages(prev => {
        if (prev.some(m => m.id === fullMessage.id)) {
          return prev;
        }
        return [...prev, fullMessage];
      });
      playMessageNotification();
    };

    const handleMessageRead = (payload: unknown) => {
      const evt = payload as { messageId?: string; userId?: string };
      if (!evt?.messageId || !evt?.userId) return;
      if (evt.userId === currentUserId) return;
      if (messagesRef.current.some(m => m.id === evt.messageId)) {
        setMessages(prev =>
          prev.map(m => (m.id === evt.messageId ? { ...m, seen: true } : m))
        );
      }
    };

    const handleMessageDelivered = (payload: unknown) => {
      const evt = payload as { messageId?: string; conversationId?: string };
      if (
        !evt?.messageId ||
        !evt?.conversationId ||
        !conversationIdsRef.current.has(evt.conversationId)
      ) {
        return;
      }
      setMessages(prev =>
        prev.map(m => (m.id === evt.messageId ? { ...m, delivered: true } : m))
      );
    };

    const unsubCreated = subscribeToMessages(currentUserId, 'message.created', handleMessageCreated);
    const unsubRead = subscribeToMessages(currentUserId, 'message.read', handleMessageRead);
    const unsubDelivered = subscribeToMessages(currentUserId, 'message.delivered', handleMessageDelivered);

    return () => {
      unsubCreated();
      unsubRead();
      unsubDelivered();
      if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current);
    };
  }, [currentUserId, debouncedFetchConversations]);

  // Initial fetch
  useEffect(() => {
    if (currentUserId) {
      fetchConversations();
    }
  }, [currentUserId, fetchConversations]);

  // Fallback polling so messages still arrive live even if the gateway SSE
  // subscription is unavailable (e.g. Vercel serverless keeps the stream
  // short-lived or the cross-instance bus is unconfigured). SSE is the fast
  // path and stays primary; this just guarantees no-refresh delivery as a
  // safety net. Polls are intentionally gentle and silent (no toasts/loading).
  useEffect(() => {
    if (!currentUserId) return;

    const refreshInbox = async () => {
      try {
        const convs = actingPageId
          ? await fetchPageConversationsDirectly(actingPageId, currentUserId)
          : await fetchConversationsDirectly(currentUserId);
        if (convs) setConversations(convs);
      } catch {
        // silent: covers only the fallback path
      }
    };

    const refreshActive = async () => {
      const id = activeConversationIdRef.current;
      if (!id) return;
      try {
        const { data: newest } = await gateway
          .from('messages')
          .select('id')
          .eq('conversation_id', id)
          .order('created_at', { ascending: false })
          .limit(1);
        const newestId = newest?.[0]?.id as string | undefined;
        if (newestId && !messagesRef.current.some(m => m.id === newestId)) {
          // A new message arrived that SSE didn't deliver — fetch it in.
          fetchMessagesRef.current(id, 0);
        }
      } catch {
        // silent
      }
    };

    const inboxTimer = setInterval(refreshInbox, 8000);
    const activeTimer = setInterval(refreshActive, 5000);
    return () => {
      clearInterval(inboxTimer);
      clearInterval(activeTimer);
    };
  }, [currentUserId, actingPageId]);


  // Keep latest fetchMessages for the call-log event listener below
  const fetchMessagesRef = useRef(fetchMessages);
  useEffect(() => {
    fetchMessagesRef.current = fetchMessages;
  }, [fetchMessages]);

  // Call-log events (dispatched by sendCallLogMessage after a successful
  // insert). The gateway client's postgres_changes listeners never fire, so
  // this is what makes an open chat show the new entry without a reload.
  useEffect(() => {
    if (!currentUserId) return;
    const onCallLog = (e: Event) => {
      const conversationId = (e as CustomEvent).detail?.conversationId as string | undefined;
      if (!conversationId) return;
      debouncedFetchConversations();
      if (conversationId === activeConversationIdRef.current) {
        fetchMessagesRef.current(conversationId, 0);
      }
    };
    window.addEventListener('tone:call-log', onCallLog);
    return () => window.removeEventListener('tone:call-log', onCallLog);
  }, [currentUserId, debouncedFetchConversations]);

  // Refresh conversations when user returns to the tab (handles stale unread counts after navigation)
  useEffect(() => {
    if (!currentUserId) return;
    const handleVisibility = () => {
      if (!document.hidden) {
        fetchConversations();
      }
    };
    const handleFocus = () => {
      fetchConversations();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUserId, fetchConversations]);

  // Periodically refresh conversation partners' online presence (matches usePresence 30s interval)
  useEffect(() => {
    if (!currentUserId) return;

    const refreshPresence = async () => {
      const allConvs = conversationsDataRef.current;
      if (allConvs.length === 0) return;

      const userIds = [...new Set(allConvs.map(c => c.other_user?.id).filter(Boolean))];
      const { data: profiles } = await gateway
        .from('profiles')
        .select('id, last_seen_at')
        .in('id', userIds);

      if (profiles) {
        const lastSeenMap = new Map(profiles.map(p => [p.id, p.last_seen_at]));
        setConversations(prev => prev.map(conv => {
          if (!conv.other_user) return conv;
          const newLastSeen = lastSeenMap.get(conv.other_user.id);
          if (!newLastSeen || newLastSeen === conv.other_user.last_seen_at) return conv;
          return {
            ...conv,
            other_user: {
              ...conv.other_user,
              last_seen_at: newLastSeen,
            }
          };
        }));
      }

      // Refresh Group Chat presence (2+ other members online = group Online).
      const groupConvIds = allConvs.filter(c => c.type === 'group').map(c => c.conversation_id);
      if (groupConvIds.length > 0) {
        const groupOnlineCounts = await fetchGroupOnlineCounts(groupConvIds, currentUserId);
        setConversations(prev => prev.map(conv => {
          if (conv.type !== 'group') return conv;
          const newCount = groupOnlineCounts.get(conv.conversation_id) || 0;
          if (newCount === conv.online_count) return conv;
          return { ...conv, online_count: newCount };
        }));
      }
    };

    const initialRefresh = setTimeout(refreshPresence, 2000);
    const interval = setInterval(refreshPresence, 30000);

    return () => {
      clearTimeout(initialRefresh);
      clearInterval(interval);
    };
  }, [currentUserId]);

  return {
    conversations,
    messages,
    firstUnreadIndex,
    hasMoreMessages,
    loading,
    activeConversationId,
    setActiveConversationId,
    fetchMessages,
    sendMessage,
    markMessagesAsRead,
    getOrCreateDM,
    refetchConversations: fetchConversations
  };
};