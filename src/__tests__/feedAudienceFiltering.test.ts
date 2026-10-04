// The Gateway filters every `posts` read by audience
// (gateway/src/features/contentVisibility.ts), which is the real enforcement.
// These tests pin the client-side layer that mirrors it on the surfaces the
// Gateway cannot see as a *content* read: a mention row, a saved-post bookmark
// and the Reels rail each join to `posts` from a table of their own, and the
// Reel viewer's navigation list is a list of ids the viewer can walk with the
// arrow keys.
//
// The failure this prevents is the specific one the Gateway filter does not
// cover: a row the client already holds (it arrived inside a `mentions` /
// `saved_posts` / navigation response) being rendered after the audience was
// tightened. `isPostVisibleToViewer` is the same evaluator the home feed and
// `usePost` already use, so these surfaces now agree with them by construction
// rather than by a second, drifting rule.
//
// Run: npx vitest run src/__tests__/feedAudienceFiltering.test.ts
import { describe, it, expect } from 'vitest';
import { isPostVisibleToViewer, isPublicAudience } from '@/lib/postVisibility';

const OWNER = 'owner-1';
const FRIEND = 'friend-1';
const STRANGER = 'stranger-1';

const OWNER_FRIENDS = new Set([FRIEND]);
const FRIEND_FRIENDS = new Set([OWNER]);
const NO_FRIENDS = new Set<string>();

type Row = {
  user_id: string;
  audience_type?: string | null;
  visibility?: string | null;
  status?: string | null;
};

/** A post row as it arrives on a joined read: audience columns included. */
const row = (overrides: Partial<Row>): Row => ({
  user_id: OWNER,
  audience_type: 'public',
  visibility: 'public',
  status: 'published',
  ...overrides,
});

describe('a joined mention / saved-post / rail row is filtered by audience', () => {
  it('keeps public content for everyone, including a guest', () => {
    const post = row({});
    expect(isPostVisibleToViewer(post, OWNER, NO_FRIENDS)).toBe(true);
    expect(isPostVisibleToViewer(post, STRANGER, NO_FRIENDS)).toBe(true);
    expect(isPostVisibleToViewer(post, '', new Set())).toBe(true);
  });

  it('keeps friends content for the owner and for an accepted friend', () => {
    const post = row({ audience_type: 'friends', visibility: 'public' });
    expect(isPostVisibleToViewer(post, OWNER, NO_FRIENDS)).toBe(true);
    expect(isPostVisibleToViewer(post, FRIEND, FRIEND_FRIENDS)).toBe(true);
  });

  it('drops friends content for a non-friend and for a guest', () => {
    const post = row({ audience_type: 'friends', visibility: 'public' });
    expect(isPostVisibleToViewer(post, STRANGER, NO_FRIENDS)).toBe(false);
    expect(isPostVisibleToViewer(post, '', new Set())).toBe(false);
  });

  it('drops only_me content for everyone but the owner', () => {
    const post = row({ audience_type: 'only_me', visibility: 'only_me' });
    expect(isPostVisibleToViewer(post, OWNER, NO_FRIENDS)).toBe(true);
    expect(isPostVisibleToViewer(post, FRIEND, FRIEND_FRIENDS)).toBe(false);
    expect(isPostVisibleToViewer(post, STRANGER, NO_FRIENDS)).toBe(false);
  });

  it("drops someone else's draft and scheduled row from every viewer's list", () => {
    for (const status of ['draft', 'scheduled']) {
      const post = row({ status });
      expect(isPostVisibleToViewer(post, OWNER, NO_FRIENDS)).toBe(true);
      expect(isPostVisibleToViewer(post, STRANGER, NO_FRIENDS)).toBe(false);
    }
  });

  it('honours the legacy visibility column when audience_type carries no value', () => {
    // The reel composer once wrote both columns with the same value, so a legacy
    // friends row can still exist with a null audience_type.
    const legacy = row({ audience_type: null, visibility: 'friends' });
    expect(isPostVisibleToViewer(legacy, FRIEND, FRIEND_FRIENDS)).toBe(true);
    expect(isPostVisibleToViewer(legacy, STRANGER, NO_FRIENDS)).toBe(false);
  });

  it('lets audience_type win over a contradicting legacy visibility', () => {
    const post = row({ audience_type: 'public', visibility: 'friends' });
    expect(isPostVisibleToViewer(post, STRANGER, NO_FRIENDS)).toBe(true);
  });

  it('fails closed on an audience value it cannot interpret', () => {
    const post = row({ audience_type: 'something-new', visibility: 'public' });
    expect(isPostVisibleToViewer(post, STRANGER, NO_FRIENDS)).toBe(false);
    expect(isPostVisibleToViewer(post, OWNER, NO_FRIENDS)).toBe(true);
  });

  it('keeps a public discovery surface public-only, even for an authorized friend', () => {
    // Explore/search/hashtag pages use `isPublicAudience`, so a friends-only post
    // is not discoverable there even by one of the author's friends.
    const friendsPost = row({ audience_type: 'friends', visibility: 'public' });
    expect(isPublicAudience(friendsPost)).toBe(false);
    expect(isPublicAudience(row({}))).toBe(true);
  });

  it('does not let a stale friends set widen a tightened audience', () => {
    // The audience can be changed after a friendship ends. `isPostVisibleToViewer`
    // reads the row's own audience, so only the current one decides.
    const post = row({ audience_type: 'only_me', visibility: 'only_me' });
    expect(isPostVisibleToViewer(post, FRIEND, new Set([OWNER]))).toBe(false);
  });
});