// Regression tests for voice-message playback after the Phase 3C private
// Storage fix. The dataClient mock asserts that message audio is loaded through
// a signed URL, never through a public URL builder. jsdom's media element never
// loads metadata, which also covers the "duration not available yet" case.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { MessageBubble, type Message } from '@/components/messages/MessageBubble';

const { createSignedUrlAsync } = vi.hoisted(() => ({
  createSignedUrlAsync: vi.fn(),
}));

vi.mock('@/lib/supabase/dataClient', () => ({
  dataClient: {
    storage: {
      from: () => ({ createSignedUrlAsync }),
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

function signedResult(suffix = 'one') {
  return {
    data: {
      signedUrl: `http://mock.test/storage/v1/object/sign/message_audios/conv-1/msg-1.webm?token=${suffix}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      expiresIn: 600,
    },
    error: null,
  };
}

describe('MessageBubble voice time readout', () => {
  beforeEach(() => {
    createSignedUrlAsync.mockReset();
    createSignedUrlAsync.mockResolvedValue(signedResult());
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a single `current / duration` readout (0:00 / 0:05 before playback)', async () => {
    render(<MessageBubble message={LEGACY_VOICE} currentUserId="u2" />);

    await waitFor(() => {
      expect(screen.getByText('0:00 / 0:05')).toBeTruthy();
    });

    expect(createSignedUrlAsync).toHaveBeenCalledWith('message_audios/conv-1/msg-1.webm', {
      expiresIn: 600,
    });
    expect(screen.getAllByText(READOUT_RE)).toHaveLength(1);
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

  it('re-signs once when a playback URL fails instead of falling back to a public URL', async () => {
    createSignedUrlAsync
      .mockResolvedValueOnce(signedResult('expired'))
      .mockResolvedValueOnce(signedResult('fresh'));

    render(<MessageBubble message={LEGACY_VOICE} currentUserId="u2" />);

    // Wait for the signed URL to be rendered into the <audio> element; firing
    // the error before the element's effect has attached its listener would
    // race the re-sign path under test.
    await waitFor(() => {
      expect(document.querySelector('audio')?.getAttribute('src')).toContain('token=expired');
    });
    const audio = document.querySelector('audio');
    expect(audio).not.toBeNull();
    fireEvent(audio!, new Event('error'));

    await waitFor(() => expect(createSignedUrlAsync).toHaveBeenCalledTimes(2));
  });

  it('surfaces signed URL authorization failures', async () => {
    createSignedUrlAsync.mockResolvedValueOnce({
      data: null,
      error: { message: 'storage: RLS denied' },
    });

    render(<MessageBubble message={LEGACY_VOICE} currentUserId="u2" />);

    await waitFor(() => {
      expect(screen.getByText(/RLS denied/)).toBeTruthy();
    });
  });
});
