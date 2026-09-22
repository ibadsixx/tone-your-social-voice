// Regression tests for the voice-message send error fix (do.md):
//
//   relation "convesation_participants" does not exist
//
// Root cause: voice-message creation routed through the legacy
// `create_message_with_audio` RPC, whose deployed body references the
// misspelled relation and fails with 42P01 — the same class of monolith-era
// chat RPC that can no longer run against the split conversation/message
// database. The fix routes voice creation through the SAME gateway table-based
// `messages` insert the working text path uses (insertVoiceMessageRow), so RLS
// (participants_can_insert_messages) enforces participant membership against
// the real `conversation_participants` relation server-side.
//
// These tests pin the regression: the row must be inserted via
// `gateway.from('messages').insert(...)` with the full voice payload, the
// `create_message_with_audio` RPC must never be invoked, and the created row
// (audio fields + sender profile) must come back in the same round trip.

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { insertVoiceMessageRow, VOICE_MESSAGE_SELECT } from '@/hooks/useConversations';

const hoisted = vi.hoisted(() => ({
  calls: {
    from: [] as string[],
    inserts: [] as Record<string, unknown>[],
    selects: [] as string[],
    rpc: [] as string[],
  },
  row: {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: 'me-1',
    content: null,
    message_type: 'audio',
    audio_path: 'message_audios/conv-1/audio.webm',
    audio_duration: 45,
    audio_mime: 'audio/webm',
    audio_size: 12345,
    created_at: '2026-09-22T00:00:00Z',
  } as Record<string, unknown> | null,
  error: null as { message?: string } | null,
}));

vi.mock('@/lib/gateway', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  const reset = () => {
    builder.insert = (payload: Record<string, unknown>) => {
      hoisted.calls.inserts.push(payload);
      return builder;
    };
    builder.select = (cols: string) => {
      hoisted.calls.selects.push(cols);
      return builder;
    };
    builder.eq = () => builder;
    builder.neq = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.single = async () => ({
      data: hoisted.error ? null : hoisted.row,
      error: hoisted.error,
    });
    builder.maybeSingle = async () => ({
      data: hoisted.error ? null : hoisted.row,
      error: hoisted.error,
    });
  };
  reset();
  return {
    gateway: {
      from: (table: string) => {
        hoisted.calls.from.push(table);
        return builder;
      },
      rpc: (name: string) => {
        hoisted.calls.rpc.push(name);
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});

describe('insertVoiceMessageRow (voice-message creation, gateway table path)', () => {
  beforeEach(() => {
    hoisted.calls.from = [];
    hoisted.calls.inserts = [];
    hoisted.calls.selects = [];
    hoisted.calls.rpc = [];
    hoisted.row = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender_id: 'me-1',
      content: null,
      message_type: 'audio',
      audio_path: 'message_audios/conv-1/audio.webm',
      audio_duration: 45,
      audio_mime: 'audio/webm',
      audio_size: 12345,
      created_at: '2026-09-22T00:00:00Z',
    };
    hoisted.error = null;
  });

  const baseParams = {
    conversationId: 'conv-1',
    senderId: 'me-1',
    receiverId: 'alice-1',
    audioPath: 'message_audios/conv-1/audio.webm',
    duration: 45,
    mimeType: 'audio/webm',
    fileSize: 12345,
  };

  it('inserts the voice row into the messages table with the full audio payload', async () => {
    const result = await insertVoiceMessageRow(baseParams);

    expect(hoisted.calls.from).toEqual(['messages']);
    expect(hoisted.calls.inserts).toHaveLength(1);
    expect(hoisted.calls.inserts[0]).toMatchObject({
      conversation_id: 'conv-1',
      sender_id: 'me-1',
      receiver_id: 'alice-1',
      content: null,
      attachment_url: null,
      audio_path: 'message_audios/conv-1/audio.webm',
      audio_duration: 45,
      audio_mime: 'audio/webm',
      audio_size: 12345,
      reply_to_id: null,
    });
    expect(result.data?.id).toBe('msg-1');
    expect(result.error).toBeNull();
  });

  it('NEVER invokes the broken create_message_with_audio RPC', async () => {
    await insertVoiceMessageRow(baseParams);
    // Regression: the legacy RPC whose body references the misspelled
    // `convesation_participants` relation must not be called at all.
    expect(hoisted.calls.rpc).toEqual([]);
  });

  it('selects the shared voice row shape (audio fields + sender profile) in the same round trip', async () => {
    await insertVoiceMessageRow(baseParams);
    expect(hoisted.calls.selects).toHaveLength(1);
    expect(hoisted.calls.selects[0]).toBe(VOICE_MESSAGE_SELECT);
    // Insert + select in one call: no post-insert reload query.
    expect(hoisted.calls.from).toEqual(['messages']);
  });

  it('propagates insert errors instead of claiming success', async () => {
    hoisted.error = { message: 'You cannot send messages to this user' };
    const result = await insertVoiceMessageRow(baseParams);
    expect(result.data).toBeNull();
    expect(result.error).toEqual({ message: 'You cannot send messages to this user' });
  });

  it('keeps receiver_id null for group sends (caller passes null)', async () => {
    await insertVoiceMessageRow({
      ...baseParams,
      receiverId: null,
      conversationId: 'group-conv-1',
    });
    expect(hoisted.calls.inserts[0].receiver_id).toBeNull();
  });
});