import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  audioCanPlay,
  voicePlaybackUrl,
  toConvertedUrl,
  voiceFileExtension,
  formatAudioTime,
} from '@/lib/audioPlayback';

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

describe('toConvertedUrl (runtime retry path)', () => {
  it('converts a Cloudinary delivery URL to f_mp3 unconditionally', () => {
    expect(toConvertedUrl(CLOUD_URL)).toBe(
      'https://res.cloudinary.com/tone/video/upload/f_mp3/v1/tone/message_audios/conv-1/msg-1.webm'
    );
  });

  it('converts a gateway fallback URL via format=mp3', () => {
    const gateway =
      'http://mock.test/api/storage/message_audios/message_audios/conv-1/msg-1.webm';
    expect(toConvertedUrl(gateway)).toBe(
      'http://mock.test/api/storage/message_audios/message_audios/conv-1/msg-1.webm?format=mp3'
    );
  });

  it('leaves an already-converted URL untouched', () => {
    const converted =
      'https://res.cloudinary.com/tone/video/upload/f_mp3/v1/tone/message_audios/msg.webm';
    expect(toConvertedUrl(converted)).toBe(converted);
  });
});

describe('voiceFileExtension', () => {
  it('maps the recorded MIME to the extension Cloudinary should see', () => {
    expect(voiceFileExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(voiceFileExtension('audio/webm')).toBe('webm');
    expect(voiceFileExtension('audio/ogg;codecs=opus')).toBe('ogg');
    expect(voiceFileExtension('audio/mp4')).toBe('mp4');
    expect(voiceFileExtension('audio/mp4; codecs=mp4a.40.2')).toBe('mp4');
    expect(voiceFileExtension('audio/mpeg')).toBe('mp3');
    expect(voiceFileExtension('unknown/x')).toBe('webm');
  });
});

describe('formatAudioTime (duration readout)', () => {
  it('formats do.md spec examples exactly', () => {
    expect(formatAudioTime(0)).toBe('0:00');
    expect(formatAudioTime(5)).toBe('0:05');
    expect(formatAudioTime(65)).toBe('1:05');
    expect(formatAudioTime(125.5)).toBe('2:05');
    expect(formatAudioTime(125.8)).toBe('2:05');
  });

  it('formats longer durations with minute-padded seconds', () => {
    expect(formatAudioTime(3600)).toBe('60:00');
    expect(formatAudioTime(3599.7)).toBe('59:59');
  });

  it('never emits Infinity/NaN for the values HTMLMediaElement can report', () => {
    // audio.duration is NaN before metadata loads and Infinity for streams
    // whose duration is still unknown — the exact inputs that produced
    // 'Infinity:NaN' in the UI.
    expect(formatAudioTime(NaN)).toBe('0:00');
    expect(formatAudioTime(Infinity)).toBe('0:00');
    expect(formatAudioTime(-Infinity)).toBe('0:00');
    expect(formatAudioTime(-5)).toBe('0:00');
    expect(formatAudioTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    const result = formatAudioTime(Infinity);
    expect(result).not.toMatch(/Infinity|NaN/);
  });
});