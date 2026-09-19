import { describe, it, expect } from 'vitest';
import {
  sectionToFilter,
  profileSectionPath,
  redirectForInvalidSection,
} from '@/lib/profileSections';

describe('profileSections', () => {
  describe('sectionToFilter', () => {
    it('defaults to Posts for the base profile URL', () => {
      expect(sectionToFilter(undefined)).toBe('all');
    });

    it('maps the known section segments', () => {
      expect(sectionToFilter('photos')).toBe('photos');
      expect(sectionToFilter('reels')).toBe('reels');
      expect(sectionToFilter('shared')).toBe('shared');
    });

    it('falls back to Posts for unknown segments (e.g. removed videos)', () => {
      expect(sectionToFilter('videos')).toBe('all');
      expect(sectionToFilter('nonsense')).toBe('all');
    });
  });

  describe('profileSectionPath', () => {
    it('returns the bare profile URL for Posts', () => {
      expect(profileSectionPath('jane', 'all')).toBe('/profile/jane');
    });

    it('returns the nested URL for the other sections', () => {
      expect(profileSectionPath('jane', 'photos')).toBe('/profile/jane/photos');
      expect(profileSectionPath('jane', 'reels')).toBe('/profile/jane/reels');
      expect(profileSectionPath('jane', 'shared')).toBe('/profile/jane/shared');
    });
  });

  describe('redirectForInvalidSection', () => {
    it('returns null for the base URL and known sections', () => {
      expect(redirectForInvalidSection(undefined)).toBeNull();
      expect(redirectForInvalidSection('photos')).toBeNull();
      expect(redirectForInvalidSection('reels')).toBeNull();
      expect(redirectForInvalidSection('shared')).toBeNull();
    });

    it('returns null for the URL-backed top-level tab sections', () => {
      expect(redirectForInvalidSection('friends')).toBeNull();
      expect(redirectForInvalidSection('mentions')).toBeNull();
      expect(redirectForInvalidSection('scheduled')).toBeNull();
    });

    it('redirects the removed Videos section to Reels', () => {
      expect(redirectForInvalidSection('videos')).toBe('reels');
    });

    it('redirects any other unknown segment to Posts', () => {
      expect(redirectForInvalidSection('nonsense')).toBe('all');
      expect(redirectForInvalidSection('all')).toBe('all');
    });
  });
});
