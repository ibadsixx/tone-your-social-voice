// The scroll sentinel that drives Profile pagination (do.md 7, 10, 24).
//
// `useInfiniteScrollSentinel` is what stands between "infinite scroll" and a
// list that quietly stops growing. The subtle failure it exists to prevent is
// not a crash but a STALL: appending an item below the sentinel does not change
// the sentinel's intersection, so a bare `IntersectionObserver` never fires
// again, and a visitor scrolling down watches the list freeze.
//
// These tests pin the three things that make it work:
//
//   * The observer is BANDED, so the next request is already in flight by the
//     time the sentinel scrolls into view rather than a frame later.
//   * A synchronous geometry re-check fires one more request when the bottom of
//     the list is still within reach, which is the anti-stall behaviour.
//   * Nothing asks after the feed is over, and an inactive section neither
//     observes nor asks, so switching tabs cannot generate traffic.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  useInfiniteScrollSentinel,
  PROFILE_SENTINEL_PREFETCH_PX,
} from '@/hooks/useInfiniteScrollSentinel';

// --- IntersectionObserver stub ---------------------------------------------
//
// jsdom has no IntersectionObserver, and the behaviour under test is what the
// component does when the sentinel enters the band, so the observer is stubbed
// with something the test drives by hand.

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

interface ObserverRecord {
  callback: ObserverCallback;
  options?: IntersectionObserverInit;
  disconnected: boolean;
}

const observers: ObserverRecord[] = [];

class MockIntersectionObserver {
  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    observers.push({ callback, options, disconnected: false });
  }
  observe() {}
  unobserve() {}
  disconnect() {
    const record = observers[observers.length - 1];
    if (record) record.disconnected = true;
  }
  takeRecords() {
    return [];
  }
}

/** Pretend the sentinel entered the observer band. */
function intersectSentinel() {
  observers.forEach((o) => o.callback([{ isIntersecting: true }]));
}

// --- Geometry stub ----------------------------------------------------------
//
// jsdom reports every element as a zero-sized box at the top of the viewport,
// which would make every geometry check "the bottom is on screen". The rect is
// stubbed so each test can place the sentinel deliberately.

let sentinelTop = 0;

function makeRect(top: number): DOMRect {
  return {
    top,
    bottom: top + 40,
    left: 0,
    right: 0,
    width: 0,
    height: 40,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

const VIEWPORT_HEIGHT = () => window.innerHeight;

// --- Harness ----------------------------------------------------------------

interface HarnessProps {
  onReach: () => void;
  enabled?: boolean;
  hasMore?: boolean;
  watch?: unknown;
  prefetchPx?: number;
}

function Harness({ onReach, enabled = true, hasMore = true, watch = 0, prefetchPx }: HarnessProps) {
  const { sentinelRef } = useInfiniteScrollSentinel({ onReach, enabled, hasMore, watch, prefetchPx });
  return <div ref={sentinelRef} data-testid="sentinel" />;
}

function mountSentinel(props: HarnessProps) {
  return render(<Harness {...props} />);
}

beforeEach(() => {
  observers.length = 0;
  sentinelTop = 0;
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => makeRect(sentinelTop)
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- A. the observer is banded (§7) -----------------------------------------

describe('A. the sentinel watches a band around the viewport, not a scroll event', () => {
  it('starts the next request before the sentinel is visible', () => {
    mountSentinel({ onReach: vi.fn() });

    expect(observers).toHaveLength(1);
    expect(observers[0].options).toEqual({
      rootMargin: `${PROFILE_SENTINEL_PREFETCH_PX}px 0px`,
      threshold: 0,
    });
    // A band wide enough to cover a fast flick, and never wider than the
    // viewport: this is prefetch, not a bulk download.
    expect(PROFILE_SENTINEL_PREFETCH_PX).toBe(600);
  });

  it('asks when the sentinel enters the band', () => {
    // The bottom is parked below the fold so the geometry check stays quiet and
    // the intersection is the only thing that can ask here.
    sentinelTop = VIEWPORT_HEIGHT() + 5000;
    const onReach = vi.fn();
    mountSentinel({ onReach });

    expect(onReach).not.toHaveBeenCalled();

    intersectSentinel();

    expect(onReach).toHaveBeenCalledTimes(1);
  });

  it('honours a custom prefetch distance', () => {
    mountSentinel({ onReach: vi.fn(), prefetchPx: 0 });

    expect(observers[0].options?.rootMargin).toBe('0px 0px');
  });
});

// --- B. the anti-stall geometry re-check ------------------------------------

describe('B. a list that does not fill the screen still keeps loading', () => {
  it('asks again when the bottom is still in reach after an item is appended', () => {
    // A short feed: the sentinel never leaves the viewport, so the observer has
    // nothing left to report. Without the geometry check the second and third
    // items would never arrive.
    sentinelTop = 200;
    const onReach = vi.fn();
    const view = mountSentinel({ onReach, watch: 1 });

    expect(onReach).toHaveBeenCalledTimes(1);

    // An item lands; the sentinel is still on screen.
    view.rerender(<Harness onReach={onReach} watch={2} />);
    expect(onReach).toHaveBeenCalledTimes(2);

    view.rerender(<Harness onReach={onReach} watch={3} />);
    expect(onReach).toHaveBeenCalledTimes(3);
  });

  it('stops asking once the bottom is genuinely below the fold', () => {
    sentinelTop = VIEWPORT_HEIGHT() + 5000;
    const onReach = vi.fn();
    const view = mountSentinel({ onReach, watch: 1 });

    // Nothing to prefetch: the visitor has not reached the end of the list.
    expect(onReach).not.toHaveBeenCalled();

    view.rerender(<Harness onReach={onReach} watch={2} />);
    expect(onReach).not.toHaveBeenCalled();

    // Reaching the bottom is what makes the next request happen.
    intersectSentinel();
    expect(onReach).toHaveBeenCalledTimes(1);
  });

  it('treats the band as "the bottom is within reach of the viewport"', () => {
    const onReach = vi.fn();

    // Just inside the band: below the fold, but within the prefetch distance.
    sentinelTop = VIEWPORT_HEIGHT() + PROFILE_SENTINEL_PREFETCH_PX - 10;
    mountSentinel({ onReach });
    expect(onReach).toHaveBeenCalledTimes(1);

    // Just outside it.
    sentinelTop = VIEWPORT_HEIGHT() + PROFILE_SENTINEL_PREFETCH_PX + 10;
    const other = vi.fn();
    mountSentinel({ onReach: other });
    expect(other).not.toHaveBeenCalled();
  });
});

// --- C. no requests the feed does not need (§10, §22, §24) ------------------

describe('C. it never asks for a request it does not need', () => {
  it('does not observe or ask for a section that is not active', () => {
    sentinelTop = 100;
    const onReach = vi.fn();

    mountSentinel({ onReach, enabled: false });

    // All four sections stay mounted so they keep their cursors, but only the
    // visible one may reach the network.
    expect(observers).toHaveLength(0);
    expect(onReach).not.toHaveBeenCalled();
  });

  it('does not ask once the feed is exhausted', () => {
    sentinelTop = 100;
    const onReach = vi.fn();
    const view = mountSentinel({ onReach, hasMore: false });

    expect(onReach).not.toHaveBeenCalled();

    // An item landing (or a re-render) must not restart pagination after the end.
    view.rerender(<Harness onReach={onReach} hasMore={false} watch={2} />);
    expect(onReach).not.toHaveBeenCalled();
  });

  it('starts observing again when a section becomes active', () => {
    const onReach = vi.fn();
    const view = mountSentinel({ onReach, enabled: false });
    expect(observers).toHaveLength(0);

    view.rerender(<Harness onReach={onReach} enabled watch={1} />);

    expect(observers).toHaveLength(1);
  });
});

// --- D. the subscription survives a mid-scroll re-render --------------------

describe('D. the observer is not torn down by the re-render an append causes', () => {
  it('keeps one observer and calls the newest callback', () => {
    sentinelTop = VIEWPORT_HEIGHT() + 5000;
    const first = vi.fn();
    const second = vi.fn();

    const view = mountSentinel({ onReach: first, watch: 1 });
    expect(observers).toHaveLength(1);

    // `onReach` is a fresh closure on every render, because it closes over the
    // current cursor. Re-subscribing here would drop a scroll event that lands
    // in the gap between teardown and re-observe.
    view.rerender(<Harness onReach={second} watch={2} />);

    expect(observers).toHaveLength(1);
    expect(observers[0].disconnected).toBe(false);

    intersectSentinel();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

// --- E. the no-observer browsers --------------------------------------------

describe('E. content is delivered even where the observer does not exist', () => {
  it('treats the sentinel as permanently in reach without IntersectionObserver', () => {
    // jsdom in production-configured suites, and browsers from before the
    // observer shipped. A latch of "never in reach" would strand every one of
    // them with a list that never grows.
    vi.stubGlobal('IntersectionObserver', undefined);
    sentinelTop = VIEWPORT_HEIGHT() + 5000;
    const onReach = vi.fn();

    mountSentinel({ onReach });

    expect(observers).toHaveLength(0);
    expect(onReach).toHaveBeenCalledTimes(1);
  });
});
