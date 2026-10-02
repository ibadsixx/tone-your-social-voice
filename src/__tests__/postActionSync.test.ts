// A reel is a `posts` row, and it can be rendered by two surfaces at once: the
// feed's `Post` card and the fullscreen `/reels/:id` viewer. Both drive the same
// `useReactions` / `useSavedPosts` / `useComments` hooks, so the question these
// tests answer is whether those two surfaces can disagree — and whether one
// account's state can leak into another's.
//
// The bug being pinned: each hook kept its own `useState`, so a reaction on the
// viewer left the feed card stale until it happened to remount, and nothing
// pushed a correction either, because the gateway's `postgres_changes` shim
// stores callbacks without ever opening the stream.
//
// The Gateway is faked as a small in-memory store rather than a canned stub, so a
// mutation followed by the hook's own re-read is a genuine round trip. A stub that
// always answers the same thing cannot catch a hook publishing stale numbers.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Row = Record<string, unknown> & { id: string };

/** The fake server. Reset per test so no case depends on another's writes. */
const db = {
  reactions: [] as Row[],
  saved: [] as Row[],
  comments: [] as Row[],
};

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

const ops: Array<{ table: string; op: string }> = [];

let currentUser: { id: string } | null = { id: 'viewer' };

type StoreName = keyof typeof db;

/** Real table name -> this fake's store. */
const TABLE_STORE: Record<string, StoreName> = {
  reactions: 'reactions',
  saved_posts: 'saved',
  comments: 'comments',
};

const rowsFor = (table: StoreName, filters: Record<string, unknown>) =>
  db[table].filter(row =>
    Object.entries(filters).every(([col, val]) => row[col] === val)
  );

/**
 * A stand-in for the Gateway's query builder.
 *
 * Supports the shapes these hooks use: filtered reads, `insert(...).select()
 * .single()`, filtered `update`/`delete`, and awaiting a write directly. Writes
 * are applied when the builder is awaited, not when the verb is called — the
 * hooks chain `delete().eq('id', …)`, and an eager fake would delete the whole
 * table before ever seeing the filter.
 */
type Pending =
  | { kind: 'insert'; payload: Record<string, unknown> }
  | { kind: 'update'; payload: Record<string, unknown> }
  | { kind: 'delete' }
  | null;

const builder = (
  table: StoreName,
  filters: Record<string, unknown> = {},
  pending: Pending = null,
  tableName = table
) => {
  /** Applies the queued write (if any) and returns the awaited result. */
  const settle = () => {
    if (pending?.kind === 'insert') {
      const row = { id: nextId(table), ...pending.payload } as Row;
      db[table].push(row);
      ops.push({ table: tableName, op: 'insert' });
      return { data: row, error: null };
    }
    if (pending?.kind === 'update') {
      const matched = rowsFor(table, filters);
      matched.forEach((row) => Object.assign(row, pending.payload));
      ops.push({ table: tableName, op: 'update' });
      return { data: null, error: null };
    }
    if (pending?.kind === 'delete') {
      const doomed = new Set(rowsFor(table, filters).map((r) => r.id));
      db[table] = db[table].filter((r) => !doomed.has(r.id));
      ops.push({ table: tableName, op: 'delete' });
      return { data: null, error: null };
    }
    return { data: rowsFor(table, filters)[0] ?? null, error: null };
  };

  const self: Record<string, unknown> = {
    select: () => self,
    eq: (col: string, val: unknown) => builder(table, { ...filters, [col]: val }, pending, tableName),
    order: () => self,
    limit: () => self,
    insert: (payload: Record<string, unknown>) =>
      builder(table, filters, { kind: 'insert', payload }, tableName),
    update: (payload: Record<string, unknown>) =>
      builder(table, filters, { kind: 'update', payload }, tableName),
    delete: () => builder(table, filters, { kind: 'delete' }, tableName),
    single: () => Promise.resolve(settle()),
    maybeSingle: () => Promise.resolve(settle()),
    then: (onDone: (v: unknown) => unknown) => onDone(settle()),
  };

  return self;
};

/** A read that returns rows rather than a single one. */
const readable = (table: keyof typeof db, filters: Record<string, unknown>) => {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: (col: string, val: unknown) => readable(table, { ...filters, [col]: val }),
    order: () => self,
    is: (col: string, val: unknown) => readable(table, { ...filters, [col]: val }),
    then: (onDone: (v: unknown) => unknown) =>
      onDone({ data: rowsFor(table, filters), error: null }),
  };
  return self;
};

const reactionAggregate = (postId: string) => {
  const rows = rowsFor('reactions', { post_id: postId });
  const types: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row.type);
    types[key] = (types[key] ?? 0) + 1;
  }
  return {
    reaction_count: rows.length,
    reaction_types: types,
    // Identity rows are the viewer's own only — this is what the Gateway's
    // aggregate/state endpoint is allowed to return.
    viewer_reactions: currentUser
      ? rows
          .filter((row) => row.user_id === currentUser!.id)
          .map((row) => ({
            id: row.id,
            user_id: row.user_id,
            reaction_type: row.type,
            created_at: row.created_at ?? '2026-01-01T00:00:00.000Z',
          }))
      : [],
  };
};

/**
 * Reads, optionally held back so a test can make one resolve after a write it was
 * issued before. The aggregate is computed when the read is *made*, the way a
 * server computes it when it handles the request — so a held read carries the
 * answer that was true at that moment, not the one that is true when it lands.
 */
const deferredReads: Array<() => void> = [];
let holdReads = false;

const reactionRead = (postId: string) => {
  const snapshot = reactionAggregate(postId);
  if (holdReads) {
    return new Promise((resolve) => {
      deferredReads.push(() => resolve({ data: snapshot, error: null }));
    });
  }
  return Promise.resolve({ data: snapshot, error: null });
};

vi.mock('@/lib/gateway', () => ({
  gateway: {
    postReactionUsers: (postId: string) => reactionRead(postId),
    postReactionCount: (postId: string) => {
      const { reaction_count, reaction_types } = reactionAggregate(postId);
      return Promise.resolve({ data: { reaction_count, reaction_types }, error: null });
    },
    commentReactionCounts: () => Promise.resolve({ data: { counts: {} }, error: null }),
    from: (table: string) => {
      const store = TABLE_STORE[table];
      if (!store) throw new Error(`unexpected table ${table}`);
      if (store === 'comments') return readable('comments', {});
      return builder(store, {}, null, table);
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: currentUser }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/hooks/useMentions', () => ({
  useMentions: () => ({ saveMentionsAndHashtags: vi.fn() }),
}));

const { useReactions } = await import('@/hooks/useReactions');
const { useSavedPosts } = await import('@/hooks/useSavedPosts');
const { clearAllPostActions, readPostActions } = await import('@/lib/postActionCache');

/** Two other people's reactions, so "mine" is distinguishable from "the total". */
const seedOthers = () => {
  db.reactions = [
    { id: 'other-1', post_id: 'p1', user_id: 'alice', type: 'ok' },
    { id: 'other-2', post_id: 'p1', user_id: 'carol', type: 'ok' },
  ];
};

beforeEach(() => {
  db.reactions = [];
  db.saved = [];
  db.comments = [];
  seq = 0;
  ops.length = 0;
  deferredReads.length = 0;
  holdReads = false;
  currentUser = { id: 'viewer' };
  clearAllPostActions();
  seedOthers();
});

describe('the two surfaces agree on reaction state', () => {
  it('a reaction published by one surface is adopted by the other', async () => {
    const { result } = renderHook(() => ({
      feed: useReactions('p1', 'alice'),
      viewer: useReactions('p1', 'alice'),
    }));
    await waitFor(() => expect(result.current.feed.reactionsCount).toBe(2));

    await act(async () => {
      await result.current.viewer.toggleReaction('red_heart');
    });

    // The viewer reacted, so the server total is 3 and the feed card must show
    // both the new icon and the new count — without refetching.
    await waitFor(() => expect(result.current.feed.userReaction).toBe('red_heart'));
    expect(result.current.feed.reactionsCount).toBe(3);
    expect(result.current.viewer.userReaction).toBe('red_heart');
    expect(result.current.viewer.reactionsCount).toBe(3);
  });

  it('the adopting surface does not refetch to learn of the change', async () => {
    const { result } = renderHook(() => ({
      feed: useReactions('p1', 'alice'),
      viewer: useReactions('p1', 'alice'),
    }));
    await waitFor(() => expect(result.current.feed.reactionsCount).toBe(2));
    const readsBefore = ops.length;

    await act(async () => {
      await result.current.viewer.toggleReaction('red_heart');
    });
    await waitFor(() => expect(result.current.feed.userReaction).toBe('red_heart'));

    // Exactly one write and the writer's own confirming re-read. If the observer
    // had refetched to correct itself, the two surfaces could still disagree for
    // the length of that round trip.
    expect(ops).toEqual([
      { table: 'reactions', op: 'insert' },
    ]);
    expect(readsBefore).toBe(0);
  });

  it('the reaction follows in both directions', async () => {
    const { result } = renderHook(() => ({
      feed: useReactions('p1', 'alice'),
      viewer: useReactions('p1', 'alice'),
    }));
    await waitFor(() => expect(result.current.feed.reactionsCount).toBe(2));

    await act(async () => {
      await result.current.viewer.toggleReaction('red_heart');
    });
    await waitFor(() => expect(result.current.feed.userReaction).toBe('red_heart'));

    // Removing it from the feed card clears it on the viewer and puts the total
    // back where it started.
    await act(async () => {
      await result.current.feed.toggleReaction('red_heart');
    });
    await waitFor(() => expect(result.current.viewer.userReaction).toBeNull());
    expect(result.current.feed.userReaction).toBeNull();
    expect(result.current.viewer.reactionsCount).toBe(2);
    expect(result.current.feed.reactionsCount).toBe(2);
  });

  it('changing the reaction updates the row rather than adding a second one', async () => {
    const { result } = renderHook(() => ({
      feed: useReactions('p1', 'alice'),
      viewer: useReactions('p1', 'alice'),
    }));
    await waitFor(() => expect(result.current.feed.reactionsCount).toBe(2));

    await act(async () => {
      await result.current.viewer.toggleReaction('ok');
    });
    await act(async () => {
      await result.current.feed.toggleReaction('red_heart');
    });

    await waitFor(() => expect(result.current.viewer.userReaction).toBe('red_heart'));
    // One reaction per viewer, however many surfaces acted on it.
    expect(db.reactions.filter((r) => r.user_id === 'viewer')).toHaveLength(1);
    expect(result.current.feed.reactionsCount).toBe(3);
  });

  it('writes only to the canonical `reactions` table, never the parallel reels tables', async () => {
    const { result } = renderHook(() => useReactions('p1', 'alice'));
    await waitFor(() => expect(result.current.reactionsCount).toBe(2));

    await act(async () => {
      await result.current.toggleReaction('ok');
    });

    // The parallel reels tables are what made the surfaces disagree: a like here
    // was invisible on the post. Nothing may write them any more.
    expect(new Set(ops.map((o) => o.table))).toEqual(new Set(['reactions']));
  });

  it('a surface that has not read yet still acts on the settled state', async () => {
    // The feed defers its reaction read until the card nears the viewport, so it
    // holds only what the viewer published. It must still UPDATE that row rather
    // than INSERT a duplicate — the mutation is keyed on the row id, which is why
    // the cache carries it.
    const { result } = renderHook(() => ({
      feed: useReactions('p1', 'alice', { enabled: false }),
      viewer: useReactions('p1', 'alice'),
    }));

    await act(async () => {
      await result.current.viewer.toggleReaction('red_heart');
    });
    await waitFor(() => expect(result.current.feed.userReaction).toBe('red_heart'));

    await act(async () => {
      await result.current.feed.toggleReaction('ok');
    });

    await waitFor(() => expect(result.current.viewer.userReaction).toBe('ok'));
    expect(db.reactions.filter((r) => r.user_id === 'viewer')).toHaveLength(1);
    expect(ops.filter((o) => o.op === 'insert')).toHaveLength(1);
  });

  it('drops a read that resolves after a write it was issued before', async () => {
    // Both surfaces read on mount. The feed's read is held past the viewer's
    // reaction, so it carries the pre-reaction answer. Applying it would reset the
    // total to 2 and clear the icon — on both surfaces, since they read the same
    // shared value.
    holdReads = true;
    const { result } = renderHook(() => ({
      feed: useReactions('p1', 'alice'),
      viewer: useReactions('p1', 'alice'),
    }));
    expect(deferredReads).toHaveLength(2);

    // Let the viewer's read through first; the feed's stays outstanding.
    await act(async () => {
      deferredReads[1]();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.viewer.toggleReaction('red_heart');
    });
    await waitFor(() => expect(result.current.feed.userReaction).toBe('red_heart'));

    holdReads = false;
    await act(async () => {
      deferredReads[0]();
      await Promise.resolve();
    });

    expect(result.current.feed.userReaction).toBe('red_heart');
    expect(result.current.feed.reactionsCount).toBe(3);
    expect(result.current.viewer.userReaction).toBe('red_heart');
    expect(result.current.viewer.reactionsCount).toBe(3);
  });
});

describe('the two surfaces agree on save state', () => {
  it('saving and unsaving is reflected on the other', async () => {
    const { result } = renderHook(() => ({
      feed: useSavedPosts('p1'),
      viewer: useSavedPosts('p1'),
    }));
    await waitFor(() => expect(result.current.feed.isSaved).toBe(false));

    await act(async () => {
      await result.current.viewer.toggleSave();
    });
    await waitFor(() => expect(result.current.feed.isSaved).toBe(true));
    expect(result.current.viewer.isSaved).toBe(true);

    await act(async () => {
      await result.current.feed.toggleSave();
    });
    await waitFor(() => expect(result.current.viewer.isSaved).toBe(false));
    expect(db.saved).toHaveLength(0);
  });

  it('writes only to `saved_posts`', async () => {
    const { result } = renderHook(() => useSavedPosts('p1'));
    await waitFor(() => expect(result.current.isSaved).toBe(false));

    await act(async () => {
      await result.current.toggleSave();
    });

    expect(new Set(ops.map((o) => o.table))).toEqual(new Set(['saved_posts']));
  });

  it('a surface that has not read yet unsaves rather than saving twice', async () => {
    const { result } = renderHook(() => useSavedPosts('p1'));
    await act(async () => {
      await result.current.toggleSave();
    });

    // Mounts after the save, so its own read is the only thing it would know.
    const late = renderHook(() => useSavedPosts('p1'));
    await act(async () => {
      await late.result.current.toggleSave();
    });

    expect(db.saved).toHaveLength(0);
  });
});

describe('one action cannot overwrite another', () => {
  // The regression this pins is not hypothetical. With a single write order shared
  // by every field, `useSavedPosts` publishing `isSaved` on mount advanced that
  // order, the reaction hook then read it as "somebody else has a newer answer for
  // the reaction total", and rendered the cache's empty default of 0 — while being
  // "behind" the peer, it also refused to publish the total it had just fetched. The
  // post showed no likes at all, and nothing would correct it until a remount.
  it('a bookmark does not make the reaction surface distrust its own count', async () => {
    const { result } = renderHook(() => ({
      reactions: useReactions('p1', 'alice'),
      saved: useSavedPosts('p1'),
    }));

    // Both reads settle: two other people have reacted, and it is not saved.
    await waitFor(() => expect(result.current.reactions.reactionsCount).toBe(2));
    await waitFor(() => expect(result.current.saved.isSaved).toBe(false));
    expect(result.current.reactions.reactionsCount).toBe(2);

    // Saving is a write to the bookmark and nothing else.
    await act(async () => {
      await result.current.saved.toggleSave();
    });
    await waitFor(() => expect(result.current.saved.isSaved).toBe(true));

    // The reaction total is untouched, and it is still *published* — a later
    // surface mounting on this post must paint 4, not 0.
    expect(result.current.reactions.reactionsCount).toBe(2);
    expect(readPostActions('viewer', 'p1').reactionsCount).toBe(2);
  });

  it('reacting does not make the bookmark surface distrust its own state', async () => {
    const { result } = renderHook(() => ({
      saved: useSavedPosts('p1'),
      reactions: useReactions('p1', 'alice'),
    }));

    await waitFor(() => expect(result.current.saved.isSaved).toBe(false));
    await act(async () => {
      await result.current.reactions.toggleReaction('red_heart');
    });
    await waitFor(() => expect(result.current.saved.isSaved).toBe(false));

    await act(async () => {
      await result.current.saved.toggleSave();
    });
    await waitFor(() => expect(result.current.saved.isSaved).toBe(true));

    // The reaction write left no claim on the bookmark, and the bookmark write left
    // none on the reaction: each surface's answer is still its own.
    expect(readPostActions('viewer', 'p1').isSaved).toBe(true);
    expect(readPostActions('viewer', 'p1').reactionsCount).toBe(3);
  });
});

describe('state is scoped to one account', () => {
  it("does not show one account's reaction to another", async () => {
    const alice = renderHook(() => useReactions('p1', 'carol'));
    await act(async () => {
      await alice.result.current.toggleReaction('red_heart');
    });
    await waitFor(() => expect(alice.result.current.userReaction).toBe('red_heart'));

    // Same browser, different account, same post.
    currentUser = { id: 'bob' };
    const bob = renderHook(() => useReactions('p1', 'carol'));

    await waitFor(() => expect(bob.result.current.userReaction).toBeNull());
    // Alice's cached reaction must not be handed to Bob, but the public total
    // still includes hers.
    expect(bob.result.current.reactionsCount).toBe(3);
  });

  it("does not show one account's bookmark to another", async () => {
    const alice = renderHook(() => useSavedPosts('p1'));
    await act(async () => {
      await alice.result.current.toggleSave();
    });
    await waitFor(() => expect(alice.result.current.isSaved).toBe(true));

    currentUser = { id: 'bob' };
    const bob = renderHook(() => useSavedPosts('p1'));

    await waitFor(() => expect(bob.result.current.isSaved).toBe(false));
  });

  it('gives a guest the public totals but never account-scoped state', async () => {
    const alice = renderHook(() => useReactions('p1', 'carol'));
    await act(async () => {
      await alice.result.current.toggleReaction('red_heart');
    });

    currentUser = null;
    const guest = renderHook(() => useReactions('p1', 'carol'));

    await waitFor(() => expect(guest.result.current.reactionsCount).toBe(3));
    expect(guest.result.current.userReaction).toBeNull();
    expect(readPostActions(undefined, 'p1').isSaved).toBeNull();
  });

  it('clears cached state on sign-out', async () => {
    const { clearPostActionsForUser } = await import('@/lib/postActionCache');
    const { result } = renderHook(() => useSavedPosts('p1'));
    await act(async () => {
      await result.current.toggleSave();
    });
    await waitFor(() => expect(readPostActions('viewer', 'p1').isSaved).toBe(true));

    clearPostActionsForUser('viewer');
    expect(readPostActions('viewer', 'p1').isSaved).toBeNull();
  });
});
