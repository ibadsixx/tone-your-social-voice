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

  it('keeps gateway fallback URLs when the browser can play the container', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably'
    );
    const gateway =
      'http://mock.test/api/storage/message_audios/message_audios/conv-1/msg-1.webm';
    expect(voicePlaybackUrl(gateway, 'audio/webm;codecs=opus')).toBe(gateway);
  });

  it('asks the gateway for an MP3 redirect for unsupported containers on fallback URLs', () => {
    // Legacy rows have no audio_url, so playback resolves to the gateway
    // /api/storage/* fallback. With an unplayable mime (Safari + WebM) the
    // gateway's own redirect must serve f_mp3, requested via ?format=mp3.
    const gateway =
      'http://mock.test/api/storage/message_audios/message_audios/conv-1/msg-1.webm';
    expect(voicePlaybackUrl(gateway, 'audio/webm;codecs=opus')).toBe(
      'http://mock.test/api/storage/message_audios/message_audios/conv-1/msg-1.webm?format=mp3'
    );
  });

  it('appends format=mp3 with & when the fallback URL already has a query', () => {
    const gateway =
      'http://mock.test/api/storage/message_audios/a.webm?token=abc';
    expect(voicePlaybackUrl(gateway, 'audio/webm;codecs=opus')).toBe(
      'http://mock.test/api/storage/message_audios/a.webm?token=abc&format=mp3'
    );
  });

  it('does not double-apply the conversion to an already-converted URL', () => {
    const converted =
      'https://res.cloudinary.com/tone/video/upload/f_mp3/v1/tone/message_audios/msg.webm';
    expect(voicePlaybackUrl(converted, 'audio/webm;codecs=opus')).toBe(
      converted
    );
  });

  it('never re-requests a conversion when the URL already carries format=', () => {
    const gateway =
      'http://mock.test/api/storage/message_audios/a.webm?format=mp3';
    expect(voicePlaybackUrl(gateway, 'audio/webm;codecs=opus')).toBe(gateway);
  });
});