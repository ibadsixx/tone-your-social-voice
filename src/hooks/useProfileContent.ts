// One-item-at-a-time infinite scroll for a Profile content section
// (do.md "Profile content pages").
//
// The contract this hook exists to hold:
//   * exactly ONE request returns exactly ONE content item;
//   * items are APPENDED, so nothing already on screen is re-fetched or replaced
//     and the Profile header never re-renders into a loading state;
//   * a cursor, not an offset, so a post created while the visitor scrolls
//     cannot shift the window and make a row appear twice or not at all;
//   * no two requests run at once, even if the sentinel re-fires;
//   * the same item is never rendered twice, whatever the server returns.
//
// It deliberately knows nothing about IntersectionObserver: `loadMore` is a plain
// stable callback, so the observer can be wired up (or torn down) wherever the
// section is rendered, and re-renders caused by loading do not churn the
// subscription.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getProfileContentPage,
  type ProfileContentKind,
  type ProfileContentPost,
} from '@/api/profileContent';

/** The spec's request shape: one scroll, one request, one item. */
export const PROFILE_ITEMS_PER_REQUEST = 1;

/**
 * A page may legitimately come back EMPTY while `has_more` is still true: the
 * Gateway skips past content this viewer may not read, and a long run of
 * Friends-only posts can fill several batches. The sentinel does not move when
 * that happens, so the hook keeps asking on the visitor's behalf — bounded, so
 * a pathologically private profile cannot spin forever.
 */
const MAX_CONSECUTIVE_EMPTY_PAGES = 12;

export interface UseProfileContentResult {
  items: ProfileContentPost[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  /** True once the feed is known to be exhausted; the caller must stop asking. */
  done: boolean;
  /** True while served by the whole-table fallback rather than the Gateway cursor. */
  degraded: boolean;
  loadMore: () => void;
  retry: () => void;
}

export function useProfileContent(
  profileId: string | undefined,
  kind: ProfileContentKind,
  options: { enabled?: boolean } = {}
): UseProfileContentResult {
  const enabled = options.enabled !== false;

  const [items, setItems] = useState<ProfileContentPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [done, setDone] = useState(false);
  const [degraded, setDegraded] = useState(false);

  // Mirrors of state that the request loop reads. Refs, not state, so a
  // re-render mid-flight cannot make the loop believe it has a different cursor
  // than the one it sent — which is how duplicate requests happen.
  const cursorRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const itemsRef = useRef<ProfileContentPost[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const doneRef = useRef(false);
  const emptyRunRef = useRef(0);
  const generationRef = useRef(0);

  const reset = useCallback(() => {
    generationRef.current += 1;
    cursorRef.current = null;
    inFlightRef.current = false;
    emptyRunRef.current = 0;
    doneRef.current = false;
    seenIdsRef.current = new Set();
    itemsRef.current = [];
    setItems([]);
    setError(null);
    setHasMore(true);
    setDone(false);
    setDegraded(false);
  }, []);

  // A different profile or a different section is a different feed: drop
  // everything rather than appending one section's posts to another's.
  useEffect(() => {
    reset();
  }, [profileId, kind, reset]);

  const request = useCallback(
    async (isRetry: boolean) => {
      if (!profileId || !enabled) return;
      // One request at a time. The sentinel can fire many times while a slow
      // request is outstanding, and a section can be scrolled during one.
      if (inFlightRef.current || doneRef.current) return;
      // A retry repeats the cursor that just failed, which is the only safe
      // thing to repeat: re-requesting from the start would duplicate the page.
      if (!isRetry && itemsRef.current.length === 0) setLoading(true);
      else if (!isRetry) setLoadingMore(true);
      if (isRetry) setError(null);

      inFlightRef.current = true;
      const generation = generationRef.current;

      try {
        const { data, error: requestError } = await getProfileContentPage(profileId, kind, {
          cursor: cursorRef.current,
          limit: PROFILE_ITEMS_PER_REQUEST,
        });
        // A response that arrives after the section was switched or unmounted
        // belongs to a feed nobody is looking at any more.
        if (generation !== generationRef.current) return;

        if (requestError || !data) {
          setError(requestError?.message || 'Failed to load this content');
          return;
        }

        setError(null);
        setDegraded(data.degraded);

        // Advance the cursor even for an empty page: an empty page with
        // `has_more` is how the Gateway reports "I skipped past content you
        // cannot see, ask again from further down".
        cursorRef.current = data.next_cursor;

        if (data.items.length === 0) {
          emptyRunRef.current += 1;
          if (!data.has_more || emptyRunRef.current >= MAX_CONSECUTIVE_EMPTY_PAGES) {
            doneRef.current = true;
            setHasMore(false);
            setDone(true);
          }
          return;
        }

        emptyRunRef.current = 0;
        // Dedupe by id. The cursor makes this unreachable in normal operation;
        // it is here so a repeated id can never produce a duplicated key or a
        // React "two children with the same key" crash.
        const fresh = data.items.filter((item) => {
          if (seenIdsRef.current.has(item.id)) return false;
          seenIdsRef.current.add(item.id);
          return true;
        });
        if (fresh.length > 0) {
          const merged = itemsRef.current.concat(fresh);
          itemsRef.current = merged;
          setItems(merged);
        }

        if (!data.has_more) {
          doneRef.current = true;
          setHasMore(false);
          setDone(true);
        } else {
          setHasMore(true);
        }
      } catch (err) {
        if (generation !== generationRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (generation === generationRef.current) {
          inFlightRef.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [profileId, kind, enabled]
  );

  /** Referentially stable: safe to hold in a ref for an observer effect. */
  const loadMore = useCallback(() => {
    void request(false);
  }, [request]);

  const retry = useCallback(() => {
    void request(true);
  }, [request]);

  // Load the first item as soon as the section exists. Sections are independent
  // (do.md 22), so switching tabs starts that section's own feed rather than
  // waiting for, or reusing, another one's.
  useEffect(() => {
    if (!profileId || !enabled) return;
    if (itemsRef.current.length > 0 || inFlightRef.current) return;
    void request(false);
  }, [profileId, enabled, request]);

  return { items, loading, loadingMore, error, hasMore, done, degraded, loadMore, retry };
}
