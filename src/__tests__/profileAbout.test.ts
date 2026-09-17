import { describe, it, expect } from 'vitest';
import {
  ABOUT_SECTIONS,
  aboutSectionToSlug,
  slugToAboutSection,
  aboutSectionPath,
} from '@/lib/profileAbout';

describe('profileAbout', () => {
  it('exposes the exact labels in order', () => {
    expect(ABOUT_SECTIONS).toEqual([
      { id: 'overview', label: 'Overview' },
      { id: 'work_education', label: 'Work and Education' },
      { id: 'places', label: 'Places Lived' },
      { id: 'contact', label: 'Contact Information' },
      { id: 'family', label: 'Family and Relationships' },
      { id: 'life_events', label: 'Life Events' },
      { id: 'details', label: 'Details About You' },
    ]);
  });

  describe('aboutSectionPath', () => {
    it('builds the exact URLs, with Overview at the parent /about URL', () => {
      expect(aboutSectionPath('john', 'overview')).toBe('/profile/john/about');
      expect(aboutSectionPath('john', 'work_education')).toBe('/profile/john/about/workandeducation');
      expect(aboutSectionPath('john', 'places')).toBe('/profile/john/about/places');
      expect(aboutSectionPath('john', 'contact')).toBe('/profile/john/about/contactInformation');
      expect(aboutSectionPath('john', 'family')).toBe('/profile/john/about/relationships');
      expect(aboutSectionPath('john', 'life_events')).toBe('/profile/john/about/events');
      expect(aboutSectionPath('john', 'details')).toBe('/profile/john/about/details');
    });
  });

  describe('slugToAboutSection', () => {
    it('maps each URL slug back to its section id', () => {
      expect(slugToAboutSection('workandeducation')).toBe('work_education');
      expect(slugToAboutSection('places')).toBe('places');
      expect(slugToAboutSection('contactInformation')).toBe('contact');
      expect(slugToAboutSection('relationships')).toBe('family');
      expect(slugToAboutSection('events')).toBe('life_events');
      expect(slugToAboutSection('details')).toBe('details');
    });

    it('returns null for the overview/absent slug and unknown slugs', () => {
      expect(slugToAboutSection(undefined)).toBeNull();
      expect(slugToAboutSection('')).toBeNull();
      expect(slugToAboutSection('bogus')).toBeNull();
      expect(slugToAboutSection('contact')).toBeNull();
    });
  });

  it('aboutSectionToSlug has no slug for Overview', () => {
    expect(aboutSectionToSlug('overview')).toBeNull();
    expect(aboutSectionToSlug('contact')).toBe('contactInformation');
  });

  it('round-trips every non-overview section', () => {
    for (const { id } of ABOUT_SECTIONS) {
      if (id === 'overview') continue;
      expect(slugToAboutSection(aboutSectionToSlug(id) ?? undefined)).toBe(id);
    }
  });
});
