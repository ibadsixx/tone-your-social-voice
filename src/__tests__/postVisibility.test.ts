// Friends-audience regression suite (do.md, "Fix the critical Friends-audience
// privacy bug for posts, reels, photos").
//
// The authoritative enforcement for a read is now in the Gateway
// (src/features/contentVisibility.ts) plus the `Posts are viewable based on
// audience and status` RLS policy. This suite locks down the client-side
// defense-in-depth layer and, most importantly, the regression that caused the
// "visible only to the owner, as if it were Only me" symptom: the evaluators
// used to check the legacy `visibility` column BEFORE `audience_type` and
// returned false for any non-'public' `visibility`, so a Friends reel written
// with BOTH columns set was denied to every accepted friend.
//
// Matrix: A (owner) / B (accepted friend) / C (non-friend) / Guest, across
// post, reel and photo, then the Public and Only-me changes.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: () => ({
      select: () => ({
        or: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  },
}));

import {
  isPostVisibleToViewer,
  isPublicAudience,
  resolvePostAudience,
  canonicalAudienceType,
  DENIED_AUDIENCE,
  type PostVisibilityFields,
} from '@/lib/postVisibility';

const OWNER = 'owner-uuid';
const FRIEND = 'accepted-friend-uuid';
const STRANGER = 'non-friend-uuid';

// The viewer's accepted-friendship set contains the VIEWER's friends, so A's set
// holds B and B's set holds A.
const OWNER_FRIENDS = new Set<string>([FRIEND]);
const FRIEND_FRIENDS = new Set<string>([OWNER]);
const STRANGER_FRIENDS = new Set<string>();
// A logged-out viewer. A guest is never a friend for any audience.
const GUEST = '';

type Kind = 'post' | 'reel' | 'photo';
const KINDS: Kind[] = ['post', 'reel', 'photo'];

function makeContent(
  kind: Kind,
  audience: 'public' | 'friends' | 'only_me' | 'friends_except' | 'specific' | 'custom_list',
  options: { legacyVisibility?: string | null; status?: string } = {}
): PostVisibilityFields {
  const { legacyVisibility, status = 'published' } = options;
  return {
    user_id: OWNER,
    // `visibility: null` is what every creation path wrote except the reel
    // composer; `legacyVisibility` reproduces the old two-column row.
    visibility: legacyVisibility === undefined ? null : legacyVisibility,
    audience_type: audience,
    status,
  };
}

describe('A. Friends audience is visible to the owner and accepted friends only', () => {
  for (const kind of KINDS) {
    for (const legacyVisibility of [null, 'friends'] as const) {
      const label = legacyVisibility ? 'with legacy visibility' : 'audience_type only';
      const content = makeContent(kind, 'friends', { legacyVisibility });

      it(`${kind} (${label}): A owner sees it`, () => {
        expect(isPostVisibleToViewer(content, OWNER, OWNER_FRIENDS)).toBe(true);
      });

      it(`${kind} (${label}): B accepted friend sees it`, () => {
        expect(isPostVisibleToViewer(content, FRIEND, FRIEND_FRIENDS)).toBe(true);
      });

      it(`${kind} (${label}): C authenticated non-friend never sees it`, () => {
        expect(isPostVisibleToViewer(content, STRANGER, STRANGER_FRIENDS)).toBe(false);
      });

      it(`${kind} (${label}): a viewer with only a pending request is not a friend`, () => {
        expect(isPostVisibleToViewer(content, 'pending-uuid', new Set())).toBe(false);
      });

      it(`${kind} (${label}): a guest is never a friend`, () => {
        expect(isPostVisibleToViewer(content, GUEST, new Set())).toBe(false);
      });

      it(`${kind} (${label}): never in a public discovery surface`, () => {
        expect(isPublicAudience(content)).toBe(false);
      });
    }
  }
});

describe('B. Public audience is visible to everyone, including guests', () => {
  for (const kind of KINDS) {
    it(`${kind}: owner, friend, non-friend and guest all see it`, () => {
      const content = makeContent(kind, 'public');
      expect(isPostVisibleToViewer(content, OWNER, OWNER_FRIENDS)).toBe(true);
      expect(isPostVisibleToViewer(content, FRIEND, FRIEND_FRIENDS)).toBe(true);
      expect(isPostVisibleToViewer(content, STRANGER, STRANGER_FRIENDS)).toBe(true);
      expect(isPostVisibleToViewer(content, GUEST, new Set())).toBe(true);
    });

    it(`${kind}: is discoverable publicly`, () => {
      expect(isPublicAudience(makeContent(kind, 'public'))).toBe(true);
    });

    it(`${kind}: a row with no audience columns is public (column DEFAULT)`, () => {
      const legacy = { user_id: OWNER, audience_type: null, visibility: null };
      expect(isPostVisibleToViewer(legacy, STRANGER, STRANGER_FRIENDS)).toBe(true);
      expect(isPostVisibleToViewer(legacy, GUEST, new Set())).toBe(true);
      expect(isPublicAudience(legacy)).toBe(true);
    });

    it(`${kind}: a viewer named in audience_excluded_user_ids is kept out`, () => {
      const excluded = { ...makeContent(kind, 'public'), audience_excluded_user_ids: [STRANGER] };
      expect(isPostVisibleToViewer(excluded, STRANGER, STRANGER_FRIENDS)).toBe(false);
      expect(isPostVisibleToViewer(excluded, FRIEND, FRIEND_FRIENDS)).toBe(true);
    });
  }
});

describe('C. Only me is visible to the owner alone', () => {
  for (const kind of KINDS) {
    for (const legacyVisibility of [null, 'only_me'] as const) {
      const label = legacyVisibility ? 'with legacy visibility' : 'audience_type only';
      const content = makeContent(kind, 'only_me', { legacyVisibility });

      it(`${kind} (${label}): owner sees it`, () => {
        expect(isPostVisibleToViewer(content, OWNER, OWNER_FRIENDS)).toBe(true);
      });

      it(`${kind} (${label}): friend, non-friend and guest are all denied`, () => {
        expect(isPostVisibleToViewer(content, FRIEND, FRIEND_FRIENDS)).toBe(false);
        expect(isPostVisibleToViewer(content, STRANGER, STRANGER_FRIENDS)).toBe(false);
        expect(isPostVisibleToViewer(content, GUEST, new Set())).toBe(false);
      });

      it(`${kind} (${label}): never in a public discovery surface`, () => {
        expect(isPublicAudience(content)).toBe(false);
      });
    }
  }
});

describe('D. The owner always sees their own content in every audience', () => {
  for (const kind of KINDS) {
    it(`${kind}: every audience is visible to the author`, () => {
      for (const audience of ['public', 'friends', 'only_me', 'friends_except', 'specific', 'custom_list'] as const) {
        const content = makeContent(kind, audience);
        expect(isPostVisibleToViewer(content, OWNER, OWNER_FRIENDS)).toBe(true);
      }
    });

    it(`${kind}: unpublished content (draft / scheduled) is author-only`, () => {
      for (const status of ['draft', 'scheduled']) {
        const content = makeContent(kind, 'public', { status });
        expect(isPostVisibleToViewer(content, OWNER, OWNER_FRIENDS)).toBe(true);
        expect(isPostVisibleToViewer(content, FRIEND, FRIEND_FRIENDS)).toBe(false);
        expect(isPostVisibleToViewer(content, STRANGER, STRANGER_FRIENDS)).toBe(false);
        expect(isPostVisibleToViewer(content, GUEST, new Set())).toBe(false);
        expect(isPublicAudience(content)).toBe(false);
      }
    });
  }
});

describe('E. The other audiences keep their existing rules', () => {
  it('friends_except is visible to friends who are not excluded', () => {
    const content = {
      ...makeContent('post', 'friends_except'),
      audience_excluded_user_ids: ['excluded-uuid'],
    };
    expect(isPostVisibleToViewer(content, FRIEND, FRIEND_FRIENDS)).toBe(true);
    expect(isPostVisibleToViewer(content, 'excluded-uuid', new Set(['excluded-uuid', OWNER]))).toBe(false);
    expect(isPostVisibleToViewer(content, STRANGER, STRANGER_FRIENDS)).toBe(false);
    expect(isPublicAudience(content)).toBe(false);
  });

  it('specific is visible only to the listed viewers', () => {
    const content = { ...makeContent('post', 'specific'), audience_user_ids: [FRIEND] };
    expect(isPostVisibleToViewer(content, FRIEND, FRIEND_FRIENDS)).toBe(true);
    expect(isPostVisibleToViewer(content, STRANGER, STRANGER_FRIENDS)).toBe(false);
    expect(isPostVisibleToViewer(content, GUEST, new Set())).toBe(false);
    expect(isPublicAudience(content)).toBe(false);
  });

  it('custom_list fails closed for everyone but the owner', () => {
    const content = makeContent('post', 'custom_list');
    expect(isPostVisibleToViewer(content, OWNER, OWNER_FRIENDS)).toBe(true);
    expect(isPostVisibleToViewer(content, FRIEND, FRIEND_FRIENDS)).toBe(false);
    expect(isPostVisibleToViewer(content, STRANGER, STRANGER_FRIENDS)).toBe(false);
    expect(isPublicAudience(content)).toBe(false);
  });
});

describe('F. Audience normalization never lets the legacy column shadow audience_type', () => {
  it('resolves stored friends variants', () => {
    for (const stored of ['friends', 'Friends', 'FRIENDS', ' friends ', 'friends_only', 'friends-only', 'friend']) {
      expect(canonicalAudienceType(stored)).toBe('friends');
    }
  });

  it('resolves stored public variants', () => {
    for (const stored of ['public', 'Public', 'PUBLIC', ' everyone ', 'anyone']) {
      expect(canonicalAudienceType(stored)).toBe('public');
    }
  });

  it('resolves stored only-me variants', () => {
    for (const stored of ['only_me', 'onlyMe', 'only-me', 'private', ' Only Me ']) {
      expect(canonicalAudienceType(stored)).toBe('only_me');
    }
  });

  it('treats an absent value as absent, not denied', () => {
    expect(canonicalAudienceType(null)).toBeNull();
    expect(canonicalAudienceType(undefined)).toBeNull();
    expect(canonicalAudienceType('')).toBeNull();
    expect(canonicalAudienceType('   ')).toBeNull();
  });

  it('fails closed on an unrecognized value', () => {
    expect(canonicalAudienceType('secret_handshake')).toBe(DENIED_AUDIENCE);
    expect(
      isPostVisibleToViewer({ user_id: OWNER, audience_type: 'wat' }, STRANGER, STRANGER_FRIENDS)
    ).toBe(false);
    expect(
      isPostVisibleToViewer({ user_id: OWNER, visibility: 'wat' }, STRANGER, STRANGER_FRIENDS)
    ).toBe(false);
  });

  it('audience_type always wins over the legacy visibility column', () => {
    expect(resolvePostAudience({ user_id: OWNER, audience_type: 'friends', visibility: 'only_me' })).toBe('friends');
    expect(resolvePostAudience({ user_id: OWNER, audience_type: 'public', visibility: 'friends' })).toBe('public');
    // A Friends post whose legacy column says "only_me" is still Friends.
    expect(
      isPostVisibleToViewer(
        { user_id: OWNER, audience_type: 'friends', visibility: 'only_me' },
        FRIEND,
        FRIEND_FRIENDS
      )
    ).toBe(true);
  });

  it('falls back to the legacy visibility column only when audience_type is absent', () => {
    expect(resolvePostAudience({ user_id: OWNER, visibility: 'friends' })).toBe('friends');
    expect(resolvePostAudience({ user_id: OWNER, visibility: 'private' })).toBe('only_me');
    expect(resolvePostAudience({ user_id: OWNER })).toBe('public');
  });
});
