import { describe, it, expect, afterEach, vi } from 'vitest';
import { audioCanPlay, voicePlaybackUrl } from '@/lib/audioPlayback';

const CLOUD_URL =
  'https://res.cloudinary.com/tone/video/upload/v1/tone/message_audios/conv-1/msg-1.webm';

describe('audioCanPlay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('treats a missing mime as playable (legacy rows are never rewritten)', () => {
    expect(audioCanPlay(null)).toBe(true);
    expect(audioCanPlay(undefined)).toBe(true);
    expect(audioCanPlay('')).toBe(true);
  });

  it('returns false when the media element reports the mime is unsupported', () => {
    // jsdom's canPlayType returns '' for every codec, mirroring a browser
    // (e.g. Safari/iOS) that cannot decode WebM/Opus.
    expect(audioCanPlay('audio/webm;codecs=opus')).toBe(false);
  });

  it('returns true when the browser reports the mime is playable', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably'
    );
    expect(audioCanPlay('audio/webm;codecs=opus')).toBe(true);
    expect(audioCanPlay('audio/mpeg')).toBe(true);
  });
});

describe('voicePlaybackUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the direct Cloudinary URL when the browser can play the recorded container', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably'
    );
    expect(voicePlaybackUrl(CLOUD_URL, 'audio/webm;codecs=opus')).toBe(
      CLOUD_URL
    );
  });

  it('requests an MP3 conversion for an unsupported container on a Cloudinary URL', () => {
    // jsdom canPlayType returns '' -> treated as unsupported (Safari + WebM).
    expect(voicePlaybackUrl(CLOUD_URL, 'audio/webm;codecs=opus')).toBe(
      'https://res.cloudinary.com/tone/video/upload/f_mp3/v1/tone/message_audios/conv-1/msg-1.webm'
    );
  });

  it('supports version-less Cloudinary URLs', () => {
    const noVersion =
      'https://res.cloudinary.com/tone/video/upload/tone/message_audios/a.webm';
    expect(voicePlaybackUrl(noVersion, 'audio/webm')).toBe(
      'https://res.cloudinary.com/tone/video/upload/f_mp3/tone/message_audios/a.webm'
    );
  });

  it('does not touch gateway fallback URLs', () => {
    const gateway =
      'http://mock.test/api/storage/message_audios/message_audios/conv-1/msg-1.webm';
    expect(voicePlaybackUrl(gateway, 'audio/webm;codecs=opus')).toBe(gateway);
  });

  it('does not double-apply the conversion to an already-converted URL', () => {
    const converted =
      'https://res.cloudinary.com/tone/video/upload/f_mp3/v1/tone/message_audios/msg.webm';
    expect(voicePlaybackUrl(converted, 'audio/webm;codecs=opus')).toBe(
      converted
    );
  });
});