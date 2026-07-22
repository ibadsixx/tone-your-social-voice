import { gateway } from './client';
import type { ApiResult } from './client';
import type { Conversation, Message } from './types';

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
