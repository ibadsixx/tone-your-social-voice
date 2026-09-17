// Profile → About subsection navigation helpers.
//
// The About tab has seven subsections with fixed labels and URLs:
//
//   Overview                  /profile/:username/about
//   Work and Education        /profile/:username/about/workandeducation
//   Places Lived              /profile/:username/about/places
//   Contact Information       /profile/:username/about/contactInformation
//   Family and Relationships  /profile/:username/about/relationships
//   Life Events               /profile/:username/about/events
//   Details About You         /profile/:username/about/details
//
// Internally the sections keep their existing ids (work_education, contact,
// family, life_events) so the existing components and data are unchanged; only
// the URL slugs differ.
export type AboutSectionId =
  | 'overview'
  | 'work_education'
  | 'places'
  | 'contact'
  | 'family'
  | 'life_events'
  | 'details';

export const ABOUT_SECTIONS: ReadonlyArray<{ id: AboutSectionId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'work_education', label: 'Work and Education' },
  { id: 'places', label: 'Places Lived' },
  { id: 'contact', label: 'Contact Information' },
  { id: 'family', label: 'Family and Relationships' },
  { id: 'life_events', label: 'Life Events' },
  { id: 'details', label: 'Details About You' },
];

const ID_TO_SLUG: Record<Exclude<AboutSectionId, 'overview'>, string> = {
  work_education: 'workandeducation',
  places: 'places',
  contact: 'contactInformation',
  family: 'relationships',
  life_events: 'events',
  details: 'details',
};

const SLUG_TO_ID: Record<string, AboutSectionId> = Object.entries(ID_TO_SLUG).reduce(
  (acc, [id, slug]) => {
    acc[slug] = id as AboutSectionId;
    return acc;
  },
  {} as Record<string, AboutSectionId>
);

// Overview lives at the parent /about URL, so it has no slug.
export function aboutSectionToSlug(id: AboutSectionId): string | null {
  return id === 'overview' ? null : ID_TO_SLUG[id];
}

// Resolves a URL slug to a section id. Returns null for the overview/absent
// slug and for unknown slugs so callers can fall back or redirect.
export function slugToAboutSection(slug: string | undefined): AboutSectionId | null {
  if (!slug) return null;
  return SLUG_TO_ID[slug] ?? null;
}

// Builds the canonical About URL for a section.
export function aboutSectionPath(username: string, id: AboutSectionId): string {
  const base = `/profile/${username}/about`;
  const slug = aboutSectionToSlug(id);
  return slug ? `${base}/${slug}` : base;
}
