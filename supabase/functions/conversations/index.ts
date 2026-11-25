// Server-authoritative conversation membership/channel publishing.
//
// Only three narrow operations are exposed; the rest of messaging stays as
// direct frontend-to-Supabase access under project RLS. The verified central
// Auth JWT is the only source of caller identity. Conversations, participants
// and messages may live in different projects, so each write targets its own
// project with a service-role client read only from Function secrets.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// CONVERSATIONS_PROJECT_URL, CONVERSATIONS_SERVICE_ROLE_KEY,
// CONVERSATION_PARTICIPANTS_PROJECT_URL, CONVERSATION_PARTICIPANTS_SERVICE_ROLE_KEY,
// MESSAGES_PROJECT_URL, MESSAGES_SERVICE_ROLE_KEY.

import { operationId, serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  badRequest,
  forbidden,
  handleRequest,
  ok,
  optionalText,
  requireUuid,
  type VerifiedContext,
} from '../_shared/operation.ts';

type Client = ReturnType<typeof serviceClient>;
const OPERATIONS = ['leave', 'publish', 'removeMember'] as const;

function conversations(): Client {
  return serviceClient('CONVERSATIONS_PROJECT_URL', 'CONVERSATIONS_SERVICE_ROLE_KEY');
}
function participants(): Client {
  return serviceClient('CONVERSATION_PARTICIPANTS_PROJECT_URL', 'CONVERSATION_PARTICIPANTS_SERVICE_ROLE_KEY');
}
function messages(): Client {
  return serviceClient('MESSAGES_PROJECT_URL', 'MESSAGES_SERVICE_ROLE_KEY');
}

interface ConversationRow {
  id: string;
  type: string | null;
  created_by: string | null;
}

async function loadConversation(conversationId: string): Promise<ConversationRow> {
  const { data, error } = await conversations()
    .from('conversations')
    .select('id, type, created_by')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) badRequest('Conversation not found');
  return data as ConversationRow;
}

async function membership(conversationId: string, userId: string): Promise<string | null> {
  const { data, error } = await participants()
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

function inputOf(ctx: VerifiedContext): { operation: string; input: Record<string, unknown> } {
  assertFields(ctx.body, ['operation', 'input']);
  const operation = ctx.body.operation;
  if (typeof operation !== 'string' || !(OPERATIONS as readonly string[]).includes(operation)) {
    badRequest('Unknown conversation operation');
  }
  const input = ctx.body.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) badRequest('Invalid input');
  return { operation, input: input as Record<string, unknown> };
}

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx) => {
  const { operation, input } = inputOf(ctx);
  const conversationId = requireUuid(input.conversationId, 'conversationId');
  const conversation = await loadConversation(conversationId);

  if (operation === 'leave') {
    assertFields(input, ['conversationId']);
    if (conversation.type === 'dm') forbidden('Direct conversations cannot be left');
    const role = await membership(conversationId, ctx.callerId);
    if (!role) forbidden('Not a conversation member');
    const { error } = await participants()
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', ctx.callerId);
    if (error) throw error;
    return ok(null);
  }

  if (operation === 'removeMember') {
    assertFields(input, ['conversationId', 'memberId']);
    const memberId = requireUuid(input.memberId, 'memberId');
    const callerRole = await membership(conversationId, ctx.callerId);
    if (callerRole !== 'admin' && callerRole !== 'moderator' && conversation.created_by !== ctx.callerId) {
      forbidden('Channel moderation permission required');
    }
    if (memberId === conversation.created_by) forbidden('The channel owner cannot be removed');
    const targetRole = await membership(conversationId, memberId);
    if (!targetRole) return ok(null); // already removed: retry-safe
    if (targetRole === 'admin' && conversation.created_by !== ctx.callerId) {
      forbidden('Only the owner can remove an admin');
    }
    const { error } = await participants()
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', memberId);
    if (error) throw error;
    return ok(null);
  }

  // publish: a channel post is a message row in the messages project.
  assertFields(input, ['conversationId', 'content', 'imageUrl', 'mediaUrl', 'attachmentUrl']);
  if (conversation.type !== 'channel' && conversation.type !== 'group') {
    forbidden('Publishing is only available in channels');
  }
  const role = await membership(conversationId, ctx.callerId);
  if (!role) forbidden('Not a conversation member');
  const content = optionalText(input.content, 'content', 4_000);
  const imageUrl = optionalText(input.imageUrl, 'imageUrl', 2_000);
  const mediaUrl = optionalText(input.mediaUrl, 'mediaUrl', 2_000);
  const attachmentUrl = optionalText(input.attachmentUrl, 'attachmentUrl', 2_000);
  if (!content && !imageUrl && !mediaUrl && !attachmentUrl) badRequest('Empty channel post');

  // An Idempotency-Key makes a retried send safe. Without one, each call is a
  // distinct message (crypto.randomUUID is generated server-side, never trusted
  // from the client) so two identical messages are not silently merged.
  const idem = ctx.req.headers.get('idempotency-key') ?? crypto.randomUUID();
  const logical = { conversationId, content, imageUrl, mediaUrl, attachmentUrl, idem };
  const id = await operationId(ctx.callerId, 'conversation:publish', logical);
  const now = new Date().toISOString();
  const { error } = await messages().from('messages').upsert({
    id,
    conversation_id: conversationId,
    sender_id: ctx.callerId,
    content,
    image_url: imageUrl,
    media_url: mediaUrl,
    attachment_url: attachmentUrl,
    is_image: imageUrl != null,
    message_type: 'text',
    created_at: now,
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;

  const { data, error: readError } = await messages()
    .from('messages')
    .select('id, conversation_id, sender_id, content, image_url, media_url, attachment_url, is_image, message_type, created_at')
    .eq('id', id)
    .single();
  if (readError) throw readError;
  return ok(data);
}));
