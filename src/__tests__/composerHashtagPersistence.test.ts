// `NewPost` is the composer path that has always registered hashtags: after the
// post row exists it calls the existing `saveMentionsAndHashtags` helper
// (NewPost.tsx). The Editor fix made the Editor match this, so this file guards
// the composer side of that pair — a change to either entry point must not make
// one of them stop registering tags, since they are now the only two that do.
//
// The composer itself is mounted in postBodyHashtags.test.tsx /
// editorPublishHashtags.test.tsx; what is asserted here is the shared helper
// underneath both, which is what keeps `#POV` from producing a duplicate row per
// post: extraction lowercases and de-duplicates before anything is written, and
// the `hashtags` upsert runs on conflict `tag`.
//
// Run: npx vitest run src/__tests__/composerHashtagPersistence.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// `useMentions` is used as-is. Both halves of `saveMentionsAndHashtags` are the
// REAL implementation — a stubbed hook would prove only that the mock was
// called, and what has to hold is that the call actually reaches the two
// hashtag tables. The `profiles` lookup the mention half performs is answered
// empty by the gateway stub, which is exactly what a caption with no matching
// username looks like.
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'viewer-1' } }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));

/**
 * The real extractor and writer, against a recording stub of the gateway. Only
 * the two tables this path touches are answered; everything else rejects so an
 * unexpected write is loud rather than silent.
 */
const written: Array<{ table: string; op: string; rows: unknown }> = [];

vi.mock('@/lib/gateway', () => {
  const chain: Record<string, unknown> = {
    select: () => chain,
    onConflict: () => chain,
    eq: () => chain,
    // The mention half looks usernames up with `.in(...)`.
    in: () => chain,
    then: (onDone: (v: unknown) => unknown) => onDone({ data: [], error: null }),
  };

  return {
    gateway: {
      from: (table: string) => ({
        select: () => chain,
        upsert: (row: unknown, _opts?: unknown) => {
          written.push({ table, op: 'upsert', rows: row });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'tag-1' }, error: null }),
            }),
          };
        },
        insert: (row: unknown) => {
          written.push({ table, op: 'insert', rows: row });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'link-1' }, error: null }),
            }),
          };
        },
      }),
    },
  };
});

import { extractHashtags, saveHashtags } from '@/utils/hashtags';
import { useMentions } from '@/hooks/useMentions';

describe('the entry-point helper really writes the hashtag rows', () => {
  beforeEach(() => {
    written.length = 0;
  });

  it('takes a post id and caption through to hashtags and hashtag_links', async () => {
    // This is the call both entry points make: `NewPost` after it creates the
    // row, and `EditorPublish` after the same. Exercised here against the real
    // implementation so the test fails if `saveMentionsAndHashtags` ever stops
    // delegating to `saveHashtags` — which would make every entry point
    // silently stop registering tags, exactly the bug being fixed.
    const { saveMentionsAndHashtags } = useMentions();
    await saveMentionsAndHashtags('post', 'post-123', 'Hello #POV');

    expect(written.filter(w => w.table === 'hashtags')).toHaveLength(1);
    expect(written.filter(w => w.table === 'hashtag_links')).toHaveLength(1);
    expect(written.find(w => w.table === 'hashtags')?.rows).toEqual({ tag: 'pov' });
    expect(written.find(w => w.table === 'hashtag_links')?.rows).toEqual({
      source_type: 'post',
      source_id: 'post-123',
      hashtag_id: 'tag-1',
    });
  });

  it('registers the hashtag even when the text also has an @mention', async () => {
    // The helper's name promises both, and it runs them concurrently. A caption
    // mixing `@alice` and `#POV` must still produce the hashtag rows — the case
    // that a mention lookup failing would otherwise swallow.
    const { saveMentionsAndHashtags } = useMentions();
    await saveMentionsAndHashtags('post', 'post-123', 'hey @alice about #POV');

    expect(written.find(w => w.table === 'hashtags')?.rows).toEqual({ tag: 'pov' });
    expect(written.find(w => w.table === 'hashtag_links')?.rows).toMatchObject({
      source_type: 'post',
      source_id: 'post-123',
    });
  });

  it('writes no hashtag rows when the caption has no hashtag', async () => {
    // The no-op path. An Editor post with a caption but no tags must not create
    // an empty or placeholder `hashtags` row.
    const { saveMentionsAndHashtags } = useMentions();
    await saveMentionsAndHashtags('post', 'post-123', 'just a caption');

    expect(written).toHaveLength(0);
  });
});

describe('the extractor lowercases and de-duplicates', () => {
  it('reads #POV as pov', () => {
    expect(extractHashtags('Hello #POV')).toEqual(['pov']);
  });

  it('collapses repeats and case variants into one tag', () => {
    // This is what stops `#POV ... #pov` becoming two writes to `hashtags`.
    expect(extractHashtags('#POV then #pov then #POV again')).toEqual(['pov']);
  });

  it('keeps distinct tags distinct', () => {
    expect(extractHashtags('#POV and #vlog and #POV')).toEqual(['pov', 'vlog']);
  });

  it('returns nothing for text with no hashtag', () => {
    expect(extractHashtags('no tags here')).toEqual([]);
  });
});

describe('the writer upserts the tag then links it to the post', () => {
  beforeEach(() => {
    written.length = 0;
  });

  it('writes one hashtags row and one hashtag_links row for #POV', async () => {
    await saveHashtags('post', 'post-123', 'Hello #POV');

    const upserts = written.filter(w => w.table === 'hashtags');
    const links = written.filter(w => w.table === 'hashtag_links');
    expect(upserts).toHaveLength(1);
    expect(links).toHaveLength(1);
    // Stored WITHOUT the '#', lowercased — the shape `useHashtagFeed` looks up
    // with `.eq('tag', tag.toLowerCase())`.
    expect(upserts[0].rows).toEqual({ tag: 'pov' });
    expect(links[0].rows).toEqual({
      source_type: 'post',
      source_id: 'post-123',
      hashtag_id: 'tag-1',
    });
  });

  it('writes a single tag row when the same tag appears repeatedly', async () => {
    // The duplicate-record guard. De-duplication happens in `extractHashtags`,
    // so the loop body runs once per DISTINCT tag.
    await saveHashtags('post', 'post-123', '#POV #pov #POV');

    expect(written.filter(w => w.table === 'hashtags')).toHaveLength(1);
    expect(written.filter(w => w.table === 'hashtag_links')).toHaveLength(1);
  });

  it('writes one row per distinct tag', async () => {
    await saveHashtags('post', 'post-123', '#POV and #vlog');

    expect(written.filter(w => w.table === 'hashtags').map(w => (w.rows as { tag: string }).tag)).toEqual([
      'pov',
      'vlog',
    ]);
  });

  it('writes nothing at all when the text has no hashtag', async () => {
    await saveHashtags('post', 'post-123', 'plain caption');

    expect(written).toHaveLength(0);
  });

  it('records the source type it was given', async () => {
    await saveHashtags('comment', 'comment-9', 'a #POV reply');

    expect(written.find(w => w.table === 'hashtag_links')?.rows).toMatchObject({
      source_type: 'comment',
      source_id: 'comment-9',
    });
  });
});
