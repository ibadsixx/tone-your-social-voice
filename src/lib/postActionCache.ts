/**
 * Shared per-post action state, so a post's Like/Comment/Save/Share read the
 * same value wherever they are rendered.
 *
 * WHY THIS EXISTS
 * ---------------
 * A reel is a `posts` row (`type = 'reel'`), and it can be rendered by two
 * different components: the feed's `Post` card and the fullscreen `/reels/:id`
 * viewer. Both drive the *same* backend records (`reactions`, `comments`,
 * `saved_posts`), but each hook instance kept its own `useState`. Reacting on
 * the viewer therefore left the feed card showing the old state until it
 * happened to remount, and — because the gateway's `postgres_changes` shim
 * stores callbacks without ever opening the stream — nothing pushed a
 * correction either. That is the "out of sync with the original Reel/post
 * buttons" symptom.
 *
 * This is a *cache*, not a second source of truth. The server still owns every
 * value: each hook fetches on mount, after every mutation, and the fetch
 * overwrites whatever is cached. The cache only removes the window in which two
 * mounted surfaces disagree, and lets a remounting surface paint the settled
 * value immediately instead of flashing a default.
 *
 * KEYING
 * ------
 * Entries are keyed by `<userId>|<postId>`. Reaction and save state are private
 * to one account, so two accounts on the same browser (or a sign-out followed by
 * a sign-in) must never read each other's entry. `clearPostActionsForUser` is
 * called on sign-out; `readPostActions` refuses to return account-scoped fields
 * to a guest, who gets counts only.
 *
 * This mirrors the shape already used by `useFriendRequestLiveUpdates`
 * (a module-level registry keyed on user id with a subscriber Set), rather than
 * introducing a new state library.
 */

export type PostActionReactionKey = string;

/**
 * The three independent actions, each with its own write order.
 *
 * They are ordered separately because they are written separately: `useSavedPosts`
 * never touches a reaction, `useComments` never touches a bookmark. A single
 * shared counter cannot express that, and the result is not theoretical — with
 * one counter, saving a post made the reaction hook believe some *other* surface
 * had a newer answer for the reaction total, so it rendered the cache's empty
 * default of `0` and, being "behind", refused to publish its own freshly fetched
 * total. The post showed no likes at all, permanently.
 */
export type PostActionGroup = 'reactions' | 'saved' | 'comments';

export interface PostActionState {
  /**
   * Monotonic order of writes, per group, per (viewer, post).
   *
   * Each hook remembers the version of the write it made itself and renders
   * whichever of its own state and the shared state is newer. Without an order,
   * the surface the viewer just touched would show the *older* cached value for
   * the length of its own re-read — pressing Like and watching the old state sit
   * there until the round trip finished is the exact symptom this cache exists to
   * remove, so the actor's own state has to win for itself.
   *
   * `0` means "never published", which is how a mounting surface knows to fall
   * back to what it fetched itself.
   */
  versions: Record<PostActionGroup, number>;
  /** The signed-in viewer's own reaction, or null. Never set for a guest. */
  userReaction: PostActionReactionKey | null;
  /**
   * Row id of the viewer's own `reactions` row.
   *
   * Carried because the reaction mutation is a read-modify-write keyed on that
   * id: a surface that adopted a peer's `userReaction` without the id would find
   * no local row and INSERT a second one for the same post, leaving the viewer
   * with duplicate reactions the aggregate then double-counts.
   */
  userReactionId: string | null;
  /** Server aggregate reaction total. Public. */
  reactionsCount: number;
  /**
   * Per-type breakdown behind `reactionsCount`. Carried alongside the total
   * because a surface that adopted the total but not the breakdown would render
   * a counter that disagrees with the icons above it.
   */
  reactionTypes: Record<string, number> | null;
  /** Whether the signed-in viewer has saved the post. Never set for a guest. */
  isSaved: boolean | null;
  /** Comment total. Public. */
  commentsCount: number | null;
}

const EMPTY: PostActionState = {
  versions: { reactions: 0, saved: 0, comments: 0 },
  userReaction: null,
  userReactionId: null,
  reactionsCount: 0,
  reactionTypes: null,
  isSaved: null,
  commentsCount: null,
};

/** Which group a patch belongs to. Every hook writes exactly one group. */
const GROUPS: ReadonlyArray<{
  group: PostActionGroup;
  fields: ReadonlyArray<keyof PostActionState>;
}> = [
  { group: 'reactions', fields: ['userReaction', 'userReactionId', 'reactionsCount', 'reactionTypes'] },
  { group: 'saved', fields: ['isSaved'] },
  { group: 'comments', fields: ['commentsCount'] },
];

type Listener = (state: PostActionState) => void;

interface CacheEntry {
  state: PostActionState;
  /** origin -> listener. Keyed so a hook never re-hears its own write. */
  listeners: Map<string, Listener>;
}

const cache = new Map<string, CacheEntry>();

const key = (userId: string | undefined, postId: string): string =>
  `${userId ?? 'guest'}|${postId}`;

const entryFor = (k: string): CacheEntry => {
  let entry = cache.get(k);
  if (!entry) {
    entry = { state: { ...EMPTY }, listeners: new Map() };
    cache.set(k, entry);
  }
  return entry;
};

/**
 * A stable per-hook-instance id, used only to skip self-delivery.
 *
 * A module counter is enough and deliberately not `crypto.randomUUID()`: this
 * only has to be unique among the hook instances alive in one JavaScript realm,
 * and it must stay stable across re-renders, which a value computed during
 * render would not.
 */
let instanceCounter = 0;
export const nextPostActionOrigin = (prefix: string): string => {
  instanceCounter += 1;
  return `${prefix}:${instanceCounter}`;
};

/**
 * Cached state for one (viewer, post) pair.
 *
 * A guest is only ever given the public totals. `userReaction` and `isSaved`
 * describe one account, so handing them to an unauthenticated caller would
 * both be wrong and leak the previous account's state through a shared browser.
 */
export const readPostActions = (
  userId: string | undefined,
  postId: string
): PostActionState => {
  if (!postId) return { ...EMPTY, versions: { ...EMPTY.versions } };
  const { state } = entryFor(key(userId, postId));
  if (userId) return { ...state, versions: { ...state.versions } };
  return {
    versions: { ...state.versions },
    userReaction: null,
    userReactionId: null,
    reactionsCount: state.reactionsCount,
    reactionTypes: state.reactionTypes,
    isSaved: null,
    commentsCount: state.commentsCount,
  };
};

/**
 * Merge a patch into the cached state and notify subscribers.
 *
 * `origin` identifies the writing hook instance. Listeners belonging to that
 * same instance are skipped: a hook already applied the value it just wrote, so
 * re-delivering it would only churn. This is what stops a
 * publish → notify → publish cycle between two mounted surfaces.
 *
 * A no-op patch is ignored so a refetch that returns the same numbers wakes
 * nobody.
 *
 * Returns the version of the group this patch belonged to, which is what the
 * caller stores as "the version of the state I published" so it can tell its own
 * state from a newer one published elsewhere. A hook writes one group, so the
 * maximum over the groups it touched is that group's own version.
 */
export const writePostActions = (
  userId: string | undefined,
  postId: string,
  patch: Partial<PostActionState>,
  origin?: string
): number => {
  if (!postId) return 0;

  // Account-scoped fields are meaningless without an identity, and writing them
  // from an anonymous surface would poison the `guest` bucket for real guests.
  const safePatch: Partial<PostActionState> = { ...patch };
  delete safePatch.versions;
  if (!userId) {
    delete safePatch.userReaction;
    delete safePatch.userReactionId;
    delete safePatch.isSaved;
  }

  const entry = entryFor(key(userId, postId));
  const written = new Set<PostActionGroup>();
  for (const { group, fields } of GROUPS) {
    for (const field of fields) {
      if (field in safePatch && !Object.is(entry.state[field], safePatch[field])) {
        written.add(group);
      }
    }
  }
  if (written.size === 0) {
    // Nothing changed, so no group's order advances and nobody is woken. A refetch
    // that returns the same numbers is the common case here.
    return Math.max(...GROUPS.map(({ group }) => entry.state.versions[group]));
  }

  // `reactionTypes` is compared by identity above, so an equal-by-value map from
  // a refetch counts as a write once and then settles. That costs one
  // notification per settled fetch and buys correct ordering, the cheaper trade.
  const versions = { ...entry.state.versions };
  for (const group of written) versions[group] += 1;
  entry.state = { ...entry.state, ...safePatch, versions };
  for (const [listenerOrigin, listener] of [...entry.listeners]) {
    if (origin !== undefined && listenerOrigin === origin) continue;
    listener(entry.state);
  }
  return Math.max(...[...written].map((group) => versions[group]));
};

/**
 * Subscribe to changes for one (viewer, post) pair.
 *
 * `origin` is this subscriber's identity, used only to skip its own writes.
 *
 * The listener is called once on subscribe with the current state so a mounting
 * surface can paint the settled value in the same tick instead of waiting for
 * the next write. Callers must treat that first call as "here is the cache",
 * not as "the server changed".
 */
export const subscribePostActions = (
  userId: string | undefined,
  postId: string,
  origin: string,
  listener: Listener
): (() => void) => {
  if (!postId) return () => {};
  const entry = entryFor(key(userId, postId));
  entry.listeners.set(origin, listener);
  listener(entry.state);
  return () => {
    entry.listeners.delete(origin);
  };
};

/**
 * Drop every cached entry for one account.
 *
 * Called on sign-out. Without this, the next account to sign in on the same
 * browser would briefly render the previous account's reaction and save state
 * before its first fetch resolved.
 */
export const clearPostActionsForUser = (userId: string | undefined): void => {
  if (!userId) return;
  const prefix = `${userId}|`;
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
};

/** Test seam: forget everything. */
export const clearAllPostActions = (): void => {
  cache.clear();
};
