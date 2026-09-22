// Regression tests for the voice-message time readout (do.md):
//  1. Renders exactly ONE readout (no duplicate/adjacent display) in the
//     required format `current / duration`, e.g. `0:00 / 0:05`.
//  2. Duration falls back to the recorded message.audio_duration while the
//     <audio> metadata is still loading (00:00 / 0:05-style initial state).
//  3. timeupdate advances the current-time half (`0:01 / 0:05` while playing).
//  4. The readout never contains Infinity/NaN regardless of element state.
//
// The gateway client is mocked so loadAudioUrl resolves to a gateway fallback
// URL (the legacy-row path exercises the same readout); jsdom's media element
// never loads metadata, which is exactly the "duration not available yet"
// scenario the spec asks to cover.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { MessageBubble, type Message } from '@/components/messages/MessageBubble';

vi.mock('@/lib/gateway', () => ({
  gateway: {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `http://mock.test/api/storage/message_audios/${path}` },
          error: null,
        }),
      }),
    },
  },
}));

const LEGACY_VOICE: Message = {
  id: 'm1',
  created_at: '2026-09-22T00:00:00Z',
  sender_id: 'u1',
  message_type: 'audio',
  audio_path: 'message_audios/conv-1/msg-1.webm',
  audio_duration: 5,
  audio_mime: 'audio/webm;codecs=opus',
};

const READOUT_RE = /^\d+:\d{2} \/ \d+:\d{2}$/;

describe('MessageBubble voice time readout', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a single `current / duration` readout (0:00 / 0:05 before playback)', async () => {
    render(<MessageBubble message={LEGACY_VOICE} currentUserId="u2" />);

    // loadAudioUrl resolves via the mocked gateway; the recorded duration is
    // shown while jsdom's element has no metadata yet.
    await waitFor(() => {
      expect(screen.getByText('0:00 / 0:05')).toBeTruthy();
    });

    // Exactly one readout exists — never two adjacent time values.
    expect(screen.getAllByText(READOUT_RE)).toHaveLength(1);

    // And no invalid numeric artifact anywhere.
    const bubbleText = document.body.textContent || '';
    expect(bubbleText).not.toMatch(/Infinity|NaN/);
  });

  it('advances the current-time half on timeupdate (0:01 / 0:05 while playing)', async () => {
    render(<MessageBubble message={LEGACY_VOICE} currentUserId="u2" />);

    await waitFor(() => {
      expect(screen.getByText('0:00 / 0:05')).toBeTruthy();
    });

    const audio = document.querySelector('audio');
    expect(audio).not.toBeNull();
    audio!.currentTime = 1;
    fireEvent(audio!, new Event('timeupdate'));

    await waitFor(() => {
      expect(screen.getByText('0:01 / 0:05')).toBeTruthy();
    });
    expect(screen.getAllByText(READOUT_RE)).toHaveLength(1);
  });

  it('renders `0:00 / 0:00` when no recorded duration exists on the row', async () => {
    render(
      <MessageBubble
        message={{ ...LEGACY_VOICE, audio_duration: undefined }}
        currentUserId="u2"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('0:00 / 0:00')).toBeTruthy();
    });
  });
});