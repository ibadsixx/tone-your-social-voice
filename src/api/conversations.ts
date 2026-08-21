import { gateway } from './client';
import type { ApiResult } from './client';
import type { Conversation, Message } from './types';
import { encodeCallLogContent } from '@/lib/callLog';

export async function getConversationsByIds(ids: string[]): Promise<ApiResult<Conversation[]>> {
  return gateway.from('conversations').select('id, type, description, created_at, updated_at').in('id', ids) as Promise<ApiResult<Conversation[]>>;
}

export async function getConversationsByPage(pageId: string): Promise<ApiResult<Conversation[]>> {
  return gateway.from('conversations').select('id, type, description, created_at, updated_at').eq('page_id', pageId).order('updated_at', { ascending: false }) as Promise<ApiResult<Conversation[]>>;
}

export async function createConversation(data: Partial<Conversation>): Promise<ApiResult<Conversation>> {
  return gateway.from('conversations').insert(data).select().single() as Promise<ApiResult<Conversation>>;
}

export async function updateConversation(id: string, data: Partial<Conversation>): Promise<ApiResult<null>> {
  return gateway.from('conversations').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function getMessages(conversationId: string, page: number = 0, limit: number = 50): Promise<ApiResult<Message[]>> {
  return gateway.from('messages').select(`
    id, conversation_id, sender_id, content, encrypted_content, encryption_iv,
    attachment_url, image_url, media_url, is_image, is_gif, gif_url,
    is_sticker, sticker_url, sticker_id, sticker_set,
    audio_url, audio_duration, audio_mime, audio_size, audio_path,
    reply_to_id, created_at, message_type, is_system,
    sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
  `).eq('conversation_id', conversationId).order('created_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1) as Promise<ApiResult<Message[]>>;
}

export async function sendMessage(data: Partial<Message>): Promise<ApiResult<Message>> {
  return gateway.from('messages').insert(data).select(`
    id, conversation_id, sender_id, content, encrypted_content, encryption_iv,
    attachment_url, image_url, media_url, is_image, message_type, reply_to_id, created_at,
    sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
  `).single() as Promise<ApiResult<Message>>;
}

export async function deleteMessage(messageId: string, senderId: string): Promise<ApiResult<null>> {
  return gateway.from('messages').delete().eq('id', messageId).eq('sender_id', senderId) as Promise<ApiResult<null>>;
}

// Facebook-style call-log entry: one system message per call, written by the
// caller only (mirrors the call_history RLS ownership pattern), visible to both
// DM participants. Content is a JSON envelope parsed by src/lib/callLog.ts.
export async function sendCallLogMessage(
  senderId: string,
  otherUserId: string,
  callType: 'voice' | 'video',
  status: 'ended' | 'missed' | 'declined' | 'failed',
  duration = 0,
): Promise<ApiResult<Message | null>> {
  if (!senderId || !otherUserId) {
    return { data: null, error: { message: 'Missing user id' } };
  }

  try {
    const { data: conversationId, error: dmError } = await getOrCreateDM(senderId, otherUserId);
    if (dmError || !conversationId) {
      return { data: null, error: dmError || { message: 'Failed to resolve DM conversation' } };
    }

    const result = await gateway.from('messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      receiver_id: otherUserId,
      content: encodeCallLogContent({ status, callType, duration }),
      is_system: true,
      message_type: 'text',
    }).select(`
      id, conversation_id, sender_id, content, created_at, message_type, is_system
    `).single() as Promise<ApiResult<Message>>;

    // The gateway client's postgres_changes listeners never fire (no server
    // push), so announce the insert ourselves — open chats/lists listen for
    // this event to show the entry without a reload.
    if (!result.error && result.data) {
      window.dispatchEvent(new CustomEvent('tone:call-log', {
        detail: { conversationId },
      }));
    }

    return result;
  } catch (err) {
    return { data: null, error: { message: String(err) } };
  }
}

export async function getConversationMedia(conversationId: string): Promise<ApiResult<Message[]>> {
  return gateway.from('messages').select('id, image_url, media_url, gif_url, sticker_url, attachment_url, is_image, is_gif, is_sticker, created_at, sender_id').eq('conversation_id', conversationId).or('image_url.neq.null,media_url.neq.null,gif_url.neq.null,sticker_url.neq.null,attachment_url.neq.null').order('created_at', { ascending: false }) as Promise<ApiResult<Message[]>>;
}

export async function getConversationFiles(conversationId: string): Promise<ApiResult<Message[]>> {
  return gateway.from('messages').select('id, attachment_url, created_at, sender_id').eq('conversation_id', conversationId).not('attachment_url', 'is', null).order('created_at', { ascending: false }) as Promise<ApiResult<Message[]>>;
}

export async function getConversationLinks(conversationId: string): Promise<ApiResult<Message[]>> {
  return gateway.from('messages').select('id, content, created_at, sender_id').eq('conversation_id', conversationId).not('content', 'is', null).order('created_at', { ascending: false }) as Promise<ApiResult<Message[]>>;
}

export async function getMessageById(id: string): Promise<ApiResult<Message>> {
  return gateway.from('messages').select(`
    id, conversation_id, sender_id, content, encrypted_content, encryption_iv,
    attachment_url, image_url, media_url, is_image, is_gif, gif_url,
    is_sticker, sticker_url, sticker_id, sticker_set,
    audio_url, audio_duration, audio_mime, audio_size, audio_path,
    reply_to_id, created_at, message_type, is_system,
    sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
  `).eq('id', id).single() as Promise<ApiResult<Message>>;
}

export async function getReplyPreview(id: string): Promise<ApiResult<Message>> {
  return gateway.from('messages').select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)').eq('id', id).single() as Promise<ApiResult<Message>>;
}

export async function getReplyPreviews(ids: string[]): Promise<ApiResult<Message[]>> {
  return gateway.from('messages').select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)').in('id', ids) as Promise<ApiResult<Message[]>>;
}

export async function getOrCreateDM(currentUserId: string, otherUserId: string): Promise<ApiResult<string | null>> {
  if (!currentUserId || !otherUserId) {
    return { data: null, error: { message: 'Missing user id' } };
  }

  try {
    const { data: myParts } = await gateway
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    let conversationId: string | null = null;

    if (myParts && myParts.length > 0) {
      const myIds = myParts.map(p => p.conversation_id);
      const { data: both } = await gateway
        .from('conversation_participants')
        .select('conversation_id')
        .in('conversation_id', myIds)
        .eq('user_id', otherUserId);

      const sharedIds = [...new Set((both || []).map(p => p.conversation_id))];
      if (sharedIds.length > 0) {
        const { data: convs } = await gateway
          .from('conversations')
          .select('id, type')
          .in('id', sharedIds);
        const dm = (convs || []).find(c => c.type === 'dm');
        if (dm) conversationId = dm.id;
      }
    }

    if (!conversationId) {
      const { data: created, error: createError } = await gateway
        .from('conversations')
        .insert({ type: 'dm', created_by: currentUserId })
        .select('id')
        .single();
      if (createError || !created) {
        return { data: null, error: createError || { message: 'Failed to create conversation' } };
      }
      conversationId = created.id;

      for (const userId of [currentUserId, otherUserId]) {
        const { error: participantError } = await gateway
          .from('conversation_participants')
          .insert({ conversation_id: conversationId, user_id: userId });
        if (participantError) {
          return { data: null, error: participantError };
        }
      }
    }

    return { data: conversationId, error: null };
  } catch (err) {
    return { data: null, error: { message: String(err) } };
  }
}

export async function markConversationMessagesRead(conversationId: string, userId: string): Promise<ApiResult<null>> {
  if (!conversationId || !userId) {
    return { data: null, error: { message: 'Missing conversation or user id' } };
  }

  try {
    const { data: settings } = await gateway
      .from('conversation_settings')
      .select('read_receipts_enabled')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (settings && settings.read_receipts_enabled === false) {
      return { data: null, error: null };
    }

    const { data: msgs } = await gateway
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId);
    const ids = (msgs || []).map(m => m.id);
    if (ids.length === 0) return { data: null, error: null };

    const { data: existing } = await gateway
      .from('message_reads')
      .select('message_id')
      .in('message_id', ids)
      .eq('user_id', userId);
    const existingSet = new Set((existing || []).map(r => r.message_id));

    for (const messageId of ids) {
      if (existingSet.has(messageId)) continue;
      const { error } = await gateway
        .from('message_reads')
        .insert({ message_id: messageId, user_id: userId });
      if (error) return { data: null, error };
    }

    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: { message: String(err) } };
  }
}

export async function getConversationReadStatus(conversationId: string, userId: string): Promise<ApiResult<{ message_id: string; user_id: string }[]>> {
  if (!conversationId || !userId) {
    return { data: null, error: { message: 'Missing conversation or user id' } };
  }

  try {
    const { data: msgs } = await gateway
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId);
    const ids = (msgs || []).map(m => m.id);
    if (ids.length === 0) return { data: [], error: null };

    const { data: reads } = await gateway
      .from('message_reads')
      .select('message_id, user_id')
      .in('message_id', ids);

    return { data: (reads || []).filter(r => r.user_id !== userId), error: null };
  } catch (err) {
    return { data: null, error: { message: String(err) } };
  }
}

export async function getMyReadMessageIds(messageIds: string[], userId: string): Promise<ApiResult<string[]>> {
  if (!messageIds || messageIds.length === 0 || !userId) {
    return { data: [], error: null };
  }

  try {
    const { data: reads } = await gateway
      .from('message_reads')
      .select('message_id')
      .in('message_id', messageIds)
      .eq('user_id', userId);
    return { data: (reads || []).map(r => r.message_id), error: null };
  } catch (err) {
    return { data: null, error: { message: String(err) } };
  }
}

export async function markMessageDelivered(messageId: string): Promise<ApiResult<null>> {
  if (!messageId) {
    return { data: null, error: { message: 'Missing message id' } };
  }

  try {
    const { error } = await gateway
      .from('messages')
      .update({ delivered_at: new Date().toISOString() } as Record<string, unknown>)
      .eq('id', messageId);
    return { data: null, error };
  } catch (err) {
    return { data: null, error: { message: String(err) } };
  }
}
