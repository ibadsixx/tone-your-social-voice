// A one-way "has this element been near the viewport" latch, backed by a SINGLE
// shared IntersectionObserver for the whole page.
//
// Why it exists: the Feed used to fire one request per post card the moment the
// card mounted, whether or not the reader ever scrolled near it. That is the N+1
// do.md §16 names, and it grew linearly with the feed — 24 posts meant 24
// requests before the reader had looked at a second card. The payload is needed
// to render a card, so the fix is to ask for it when the card is actually on its
// way into view, not when it is created.
//
// One-way on purpose: once a card has been seen it stays "seen". A reader who
// scrolls past a post and comes back must not pay for it twice, and a card that
// briefly leaves the viewport must never have its already-rendered state torn
// down underneath them.
import { useEffect, useRef, useState } from 'react';

// Element -> the hooks watching it. WeakMap so an unmounted card is collectable
// even if its effect cleanup was skipped.
const watchers = new WeakMap<Element, Set<() => void>>();

let sharedObserver: IntersectionObserver | null = null;
let observerUnavailable = false;

function getSharedObserver(): IntersectionObserver | null {
  if (sharedObserver) return sharedObserver;
  if (observerUnavailable) return null;
  if (typeof IntersectionObserver === 'undefined') {
    // jsdom and very old browsers. Falling back to "always in view" keeps the
    // current behaviour rather than silently dropping data.
    observerUnavailable = true;
    return null;
  }
  sharedObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const set = watchers.get(entry.target);
        if (!set) continue;
        // Flip the latch and stop watching: this is the only transition.
        for (const notify of [...set]) notify();
        watchers.delete(entry.target);
        sharedObserver?.unobserve(entry.target);
      }
    },
    { rootMargin: '600px 0px', threshold: 0 }
  );
  return sharedObserver;
}

export function useNearViewport<T extends Element = HTMLElement>(rootMargin = '600px 0px') {
  const ref = useRef<T | null>(null);
  // `true` by default when IntersectionObserver is unavailable, so the fallback
  // is "load everything" rather than "load nothing".
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (inView) return; // already latched; nothing left to observe

    const io = getSharedObserver();
    if (!io) {
      setInView(true);
      return;
    }

    let set = watchers.get(el);
    if (!set) {
      set = new Set();
      watchers.set(el, set);
    }
    const notify = () => setInView(true);
    set.add(notify);
    io.observe(el);

    return () => {
      watchers.get(el)?.delete(notify);
      io.unobserve(el);
    };
  }, [inView, rootMargin]);

  return { ref, inView };
}
