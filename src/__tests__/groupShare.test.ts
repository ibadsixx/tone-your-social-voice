import { describe, it, expect } from 'vitest';
import {
  parseGroupShareContent,
  encodeGroupShareContent,
  sanitizeImageUrl,
} from '@/lib/groupShare';

describe('sanitizeImageUrl', () => {
  it('returns null for null input', () => {
    expect(sanitizeImageUrl(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(sanitizeImageUrl(undefined)).toBeUndefined();
  });

  it('returns plain URLs unchanged', () => {
    expect(sanitizeImageUrl('https://picsum.photos/200/200')).toBe('https://picsum.photos/200/200');
    expect(sanitizeImageUrl('https://example.com/image.png?v=1')).toBe('https://example.com/image.png?v=1');
  });

  it('strips Markdown link wrapping', () => {
    expect(sanitizeImageUrl('[https://picsum.photos/200/200](https://picsum.photos/200/200)')).toBe(
      'https://picsum.photos/200/200'
    );
    expect(sanitizeImageUrl('[My Image](https://example.com/img.png)')).toBe(
      'https://example.com/img.png'
    );
  });

  it('returns empty string unchanged', () => {
    expect(sanitizeImageUrl('')).toBe('');
  });

  it('returns non-URL text unchanged', () => {
    expect(sanitizeImageUrl('just some text')).toBe('just some text');
    expect(sanitizeImageUrl('not a url at all')).toBe('not a url at all');
  });
});

describe('parseGroupShareContent', () => {
  it('returns null for null input', () => {
    expect(parseGroupShareContent(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseGroupShareContent(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseGroupShareContent('')).toBeNull();
  });

  it('returns null for non-JSON content', () => {
    expect(parseGroupShareContent('hello world')).toBeNull();
  });

  it('returns null for JSON without __group_share', () => {
    expect(parseGroupShareContent(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('returns null when __group_share is not true', () => {
    expect(parseGroupShareContent(JSON.stringify({ __group_share: false }))).toBeNull();
    expect(parseGroupShareContent(JSON.stringify({ __group_share: 'true' }))).toBeNull();
  });

  it('parses valid group-share content', () => {
    const payload = {
      __group_share: true,
      group_id: 'group-123',
      group_name: 'Test Group',
      group_image: 'https://picsum.photos/200/200',
      group_description: 'A test group',
      shared_by: 'user-1',
      shared_by_name: 'Test User',
      shared_at: '2026-01-01T00:00:00Z',
    };
    const result = parseGroupShareContent(JSON.stringify(payload));
    expect(result).toEqual(payload);
  });

  it('strips markdown wrapping from image URL', () => {
    const payload = {
      __group_share: true,
      group_id: 'group-123',
      group_name: 'Test Group',
      group_image: '[https://picsum.photos/200/200](https://picsum.photos/200/200)',
      group_description: null,
      shared_by: 'user-1',
      shared_by_name: 'Test User',
      shared_at: '2026-01-01T00:00:00Z',
    };
    const result = parseGroupShareContent(JSON.stringify(payload));
    expect(result?.group_image).toBe('https://picsum.photos/200/200');
  });

  it('handles missing optional fields', () => {
    const payload = {
      __group_share: true,
      group_id: 'group-123',
      group_name: 'Test Group',
    };
    const result = parseGroupShareContent(JSON.stringify(payload));
    expect(result?.group_image).toBeNull();
    expect(result?.group_description).toBeNull();
    expect(result?.shared_by).toBe('');
    expect(result?.shared_by_name).toBe('');
    expect(result?.shared_at).toBe('');
  });
});
