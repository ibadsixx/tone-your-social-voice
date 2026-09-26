// The scroll sentinel for Profile content sections (do.md 7).
//
// An `IntersectionObserver` on a sentinel placed after the loaded items, rather
// than a `scroll` listener that runs work on every frame.
//
// The subtlety worth stating, because the obvious implementation is broken: a
// bare observer STALLS. Appending an item below the sentinel does not change
// the sentinel's intersection, so no callback fires; and once the visitor
// scrolls the sentinel out of view it does not come back unless they scroll up.
// A visitor scrolling down would see the list stop growing.
//
// So the observer is paired with a synchronous geometry check: after items are
// appended, if the bottom of the list is still within reach, exactly one more
// item is requested. That is not preloading — it never runs ahead of what the
// visitor can see, and it fills a visible gap one item at a time rather than
// leaving a blank strip under the last post. The request itself is serialised by
// `useProfileContent`, so a fast sequence of appends still produces one
// in-flight request at a time.
import { useEffect, useRef } from 'react';

/** Start the next request this far before the sentinel reaches the viewport. */
export const PROFILE_SENTINEL_PREFETCH_PX = 600;

export interface UseInfiniteScrollSentinelOptions {
  /** Called when the sentinel comes into reach. Must be referentially stable. */
  onReach: () => void;
  /** Stop observing entirely (e.g. the section is not the active one). */
  enabled?: boolean;
  /** While false the sentinel may be observed but must not trigger a request. */
  hasMore?: boolean;
  /** Changing this re-runs the "is the bottom still in reach" check. */
  watch?: unknown;
  prefetchPx?: number;
}

export interface InfiniteScrollSentinel {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function useInfiniteScrollSentinel({
  onReach,
  enabled = true,
  hasMore = true,
  watch,
  prefetchPx = PROFILE_SENTINEL_PREFETCH_PX,
}: UseInfiniteScrollSentinelOptions): InfiniteScrollSentinel {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onReachRef = useRef(onReach);

  // Keep the callback current without re-creating the observer, so a re-render
  // caused by an item arriving cannot tear the subscription down mid-scroll.
  useEffect(() => {
    onReachRef.current = onReach;
  });

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !enabled || !hasMore) return;
    // Without IntersectionObserver (jsdom, very old browsers) treat the sentinel
    // as permanently in reach, so content is still delivered rather than
    // silently stranded.
    if (typeof IntersectionObserver === 'undefined') {
      onReachRef.current();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onReachRef.current();
        }
      },
      { rootMargin: `${prefetchPx}px 0px`, threshold: 0 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, hasMore, prefetchPx]);

  // Fill a gap the observer cannot report. Measured synchronously rather than
  // from an intersection flag, because the observer's callback for a moved
  // sentinel lands after this effect and the flag would be stale here.
  useEffect(() => {
    if (!enabled || !hasMore) return;
    const element = sentinelRef.current;
    if (!element || typeof element.getBoundingClientRect !== 'function') return;
    const rect = element.getBoundingClientRect();
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight || 0 : 0;
    if (rect.top <= viewportHeight + prefetchPx) onReachRef.current();
  }, [watch, enabled, hasMore, prefetchPx]);

  return { sentinelRef };
}
