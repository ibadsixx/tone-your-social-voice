// Editing an existing post updates the `posts` row and then calls the existing
// `saveMentionsAndHashtags('post', id, text)` helper (see editPostDialogSync for
// the wiring). This file exercises the helper itself against a recording,
// in-memory stand-in for the two hashtag tables and `mentions`.
//
// The bug it guards: the helper only ever inserted. A create has nothing to
// remove, so insert-only was invisible; an EDIT does not - dropping `#Tone` from
// "#POV #Tone" left the `tone` link behind, and clearing the caption left every
// link behind. These tests pin the whole edit sequence from the task:
//
//   "Test"            -> hashtags {}
//   "Test #POV"       -> hashtags {pov}
//   "Test #POV #Tone" -> hashtags {pov, tone}
//   "Test #POV"       -> hashtags {pov}      (tone removed)
//   "Test"            -> hashtags {}         (all removed)
//
// Run: npx vitest run src/__tests__/editPostHashtagSync.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * A minimal in-memory Gateway.
 *
 * The real client is a Postgrest-style builder: `select().eq()...` is thenable,
 * `upsert(...).select().single()` resolves a row, `insert(...)` and
 * `delete().eq()...` are awaited directly. This reproduces just those shapes
 * against four arrays, so the REAL `saveHashtags` / `saveMentions` run and their
 * reads and writes are observable.
 */
const h = vi.hoisted(() => {
  const store = {
    hashtags: [] as Array<{ id: string; tag: string }>,
    hashtag_links: [] as Array<{ source_type: string; source_id: string; hashtag_id: string }>,
    mentions: [] as Array<{ id: string; source_type: string; source_id: string; mentioned_user_id: string; created_by: string }>,
    profiles: [] as Array<{ id: string; username: string; display_name: string }>,
  };
  const notifications: Array<Record<string, unknown>> = [];
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  class Query {
    private filters: Array<[string, unknown]> = [];
    private inFilter: { column: string; values: unknown[] } | null = null;
    private body: unknown = undefined;
    private method = 'select';
    constructor(private table: string) {}

    private rows(): Array<Record<string, unknown>> {
      return ((store as unknown as Record<string, Array<Record<string, unknown>>>)[this.table] || []);
    }
    private matches(row: Record<string, unknown>): boolean {
      for (const [column, value] of this.filters) {
        if (row[column] !== value) return false;
      }
      if (this.inFilter && !this.inFilter.values.includes(row[this.inFilter.column])) {
        return false;
      }
      return true;
    }

    select(_columns = '*') { return this; }
    eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
    in(column: string, values: unknown[]) { this.inFilter = { column, values }; return this; }
    upsert(body: unknown, _options?: unknown) { this.method = 'upsert'; this.body = body; return this; }
    insert(body: unknown) { this.method = 'insert'; this.body = body; return this; }
    delete() { this.method = 'delete'; return this; }
    single() { return Promise.resolve(this.run(true)); }
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(this.run(false)).then(onFulfilled, onRejected);
    }

    private run(single: boolean): { data: unknown; error: unknown } {
      if (this.method === 'select') {
        const rows = this.rows().filter((row) => this.matches(row));
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      }
      if (this.method === 'upsert') {
        const tag = (this.body as { tag: string }).tag;
        let existing = store.hashtags.find((t) => t.tag === tag);
        if (!existing) {
          existing = { id: nextId('tag'), tag };
          store.hashtags.push(existing);
        }
        return { data: { id: existing.id }, error: null };
      }
      if (this.method === 'insert') {
        const list = Array.isArray(this.body) ? this.body : [this.body];
        for (const raw of list) {
          const row = raw as Record<string, unknown>;
          if (this.table === 'hashtags') {
            if (!store.hashtags.some((t) => t.tag === row.tag)) {
              store.hashtags.push({ id: nextId('tag'), tag: row.tag as string });
            }
          } else {
            const target = this.rows();
            target.push({ id: nextId(this.table), ...row });
          }
        }
        return { data: null, error: null };
      }
      if (this.method === 'delete') {
        // Mutate the store array in place so the removals are visible.
        const rows = this.rows();
        const keep = rows.filter((row) => !this.matches(row));
        rows.length = 0;
        rows.push(...keep);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }
  }

  return { store, notifications, Query };
});

vi.mock('@/lib/gateway', () => ({
  gateway: { from: (table: string) => new h.Query(table) },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'viewer-1', user_metadata: { display_name: 'Viewer' } } }),
}));
vi.mock('@/hooks/useNotifications', () => ({
  createNotification: async (notification: unknown) => {
    h.notifications.push(notification as Record<string, unknown>);
  },
}));

import { saveHashtags } from '@/utils/hashtags';
import { useMentions } from '@/hooks/useMentions';

/** The tags currently linked to a source, e.g. ['pov']. */
const tagsFor = (sourceType: string, sourceId: string): string[] => {
  const ids = new Set(
    h.store.hashtag_links
      .filter((link) => link.source_type === sourceType && link.source_id === sourceId)
      .map((link) => link.hashtag_id)
  );
  return h.store.hashtags.filter((tag) => ids.has(tag.id)).map((tag) => tag.tag).sort();
};
const linksFor = (sourceType: string, sourceId: string) =>
  h.store.hashtag_links.filter((link) => link.source_type === sourceType && link.source_id === sourceId);

beforeEach(() => {
  h.store.hashtags.length = 0;
  h.store.hashtag_links.length = 0;
  h.store.mentions.length = 0;
  h.store.profiles.length = 0;
  h.notifications.length = 0;
});

describe('saveHashtags synchronizes rather than only inserting', () => {
  it('records a hashtag added by an edit', async () => {
    await saveHashtags('post', 'post-1', 'Test #POV');

    expect(tagsFor('post', 'post-1')).toEqual(['pov']);
    expect(h.store.hashtags.map((tag) => tag.tag)).toEqual(['pov']);
  });

  it('records every hashtag an edit adds', async () => {
    await saveHashtags('post', 'post-1', 'Test #POV #Tone #Algeria');

    expect(tagsFor('post', 'post-1')).toEqual(['algeria', 'pov', 'tone']);
  });

  it('removes the one hashtag an edit drops', async () => {
    await saveHashtags('post', 'post-1', 'Test #POV #Tone');
    await saveHashtags('post', 'post-1', 'Test #POV');

    expect(tagsFor('post', 'post-1')).toEqual(['pov']);
    // `tone` itself stays in `hashtags` - it may be used elsewhere; only the
    // relationship is dropped.
    expect(h.store.hashtags.map((tag) => tag.tag).sort()).toEqual(['pov', 'tone']);
  });

  it('removes every link when an edit drops all hashtags', async () => {
    await saveHashtags('post', 'post-1', 'Test #POV #Tone');
    await saveHashtags('post', 'post-1', 'Test everyone');

    expect(linksFor('post', 'post-1')).toHaveLength(0);
  });

  it('adds nothing when an edit introduces no hashtag', async () => {
    await saveHashtags('post', 'post-1', 'Test with no tags');

    expect(linksFor('post', 'post-1')).toHaveLength(0);
    expect(h.store.hashtags).toHaveLength(0);
  });

  it('does not duplicate the link when unchanged text is saved twice', async () => {
    await saveHashtags('post', 'post-1', 'Test #POV');
    await saveHashtags('post', 'post-1', 'Test #POV');

    expect(linksFor('post', 'post-1')).toHaveLength(1);
  });

  it('leaves another post of the same source type untouched', async () => {
    await saveHashtags('post', 'post-2', 'Other #Tone');
    await saveHashtags('post', 'post-1', 'Test #POV');
    await saveHashtags('post', 'post-1', 'Test');

    expect(tagsFor('post', 'post-1')).toEqual([]);
    expect(tagsFor('post', 'post-2')).toEqual(['tone']);
  });

  it('leaves comment links untouched when a post is synchronized', async () => {
    await saveHashtags('comment', 'comment-1', 'a #POV reply');
    await saveHashtags('post', 'post-1', 'Test #POV');
    await saveHashtags('post', 'post-1', 'Test');

    expect(tagsFor('post', 'post-1')).toEqual([]);
    expect(tagsFor('comment', 'comment-1')).toEqual(['pov']);
  });
});

describe('saveMentionsAndHashtags stays safe on edits', () => {
  beforeEach(() => {
    h.store.profiles.push({ id: 'alice-id', username: 'alice', display_name: 'Alice' });
  });

  it('still records a mention and a hashtag together', async () => {
    const { result } = renderHook(() => useMentions());
    await result.current.saveMentionsAndHashtags('post', 'post-1', 'hey @alice about #POV');

    expect(h.store.mentions.map((m) => m.mentioned_user_id)).toEqual(['alice-id']);
    expect(h.notifications).toHaveLength(1);
    expect(tagsFor('post', 'post-1')).toEqual(['pov']);
  });

  it('does not duplicate or re-notify a mention on a repeated save', async () => {
    // The edit flow re-runs the whole helper. Mentions have no unique
    // constraint and every insert notifies, so without the existing-mention
    // guard an edit would spam the mentioned user and duplicate the row.
    const { result } = renderHook(() => useMentions());
    await result.current.saveMentionsAndHashtags('post', 'post-1', 'hey @alice #POV');
    await result.current.saveMentionsAndHashtags('post', 'post-1', 'hey @alice #POV');

    expect(h.store.mentions).toHaveLength(1);
    expect(h.notifications).toHaveLength(1);
    expect(linksFor('post', 'post-1')).toHaveLength(1);
  });
});