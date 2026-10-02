/**
 * Client-side mirror of the Gateway's audience rule.
 *
 * The Gateway is the authority — `filterContentRowsForViewer` decides what a read
 * returns, and `src/features/contentAudience.ts` on the Gateway is the single
 * definition (`isGuestSafePublicContent`). This file exists for one narrow
 * purpose: a surface must not *offer* an action the audience forbids, even when
 * the backend would refuse it.
 *
 * Concretely, `/reels/:id` used to hardcode `isPublic={true}` into its options
 * menu, so a friends-only reel still offered "Embed". The read was already
 * filtered; it was the affordance that leaked.
 *
 * Deliberately a copy and not a shared import: the two are separate deployables
 * with separate build pipelines, and the Gateway's version is written in
 * TypeScript against its own `AudienceRow`. Keep the two in step — if this rule
 * moves there, move it here.
 */

export interface AudienceRow {
  audience_type?: unknown;
  /** Legacy column. Consulted only to catch rows whose two columns disagree. */
  visibility?: unknown;
  status?: unknown;
}

/**
 * "This value says public": exactly the string `public`, ignoring surrounding
 * whitespace only.
 *
 * Case is deliberately NOT normalized — the Gateway's RLS policies compare
 * literally, so treating `Public` as public would make the client more permissive
 * than the database it fronts, which is the unsafe direction.
 */
const isExactlyPublic = (value: unknown): boolean =>
  typeof value === 'string' && value.trim() === 'public';

/**
 * Unpublished content is author-only.
 *
 * `status` is absent on many legacy rows, so only an explicit non-published
 * value denies; an unknown status is not treated as published.
 */
export const isPublishedContent = (row: AudienceRow): boolean => {
  const status = row.status;
  if (status === null || status === undefined) return true;
  return String(status).trim().toLowerCase() === 'published';
};

/**
 * Whether a row may be treated as public by an anonymous-facing surface.
 *
 * Two independent requirements, both mandatory:
 *
 *  - the canonical `audience_type` column must be exactly `public`, and
 *  - the legacy `visibility` column must not contradict it.
 *
 * The second condition is about drifted rows: the two columns are written by
 * different composers and legacy rows exist where they disagree. When they
 * disagree the safe answer is "not public".
 */
export const isGuestSafePublicContent = (row: AudienceRow | null | undefined): boolean => {
  if (!row || typeof row !== 'object') return false;
  if (!isPublishedContent(row)) return false;
  if (!isExactlyPublic(row.audience_type)) return false;
  const legacy = row.visibility;
  if (legacy === null || legacy === undefined || legacy === '') return true;
  return isExactlyPublic(legacy);
};
