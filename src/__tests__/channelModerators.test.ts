// Regression test for the Channel Settings → Moderators data flow
// (messages.md). The "0 moderators" bug came from reading a scalar
// channelStats.moderator_count that could be undefined; the fix derives the
// moderator list (and therefore the count and names) from the real membership
// rows returned by get_channel_members. These tests pin the derivation:
// only stored role='moderator' rows are moderators, the owner is excluded
// unless the database explicitly stores the owner as a moderator, and the list
// is ordered by display name.
import { describe, it, expect } from 'vitest';

import { deriveChannelModerators, type ChannelMember } from '@/lib/channelMembers';

function member(overrides: Partial<ChannelMember> & Pick<ChannelMember, 'user_id' | 'role'>): ChannelMember {
  return {
    username: 'user',
    display_name: 'User',
    profile_pic: null,
    ...overrides,
  };
}

describe('deriveChannelModerators (messages.md moderators data flow)', () => {
  it('returns only members whose stored role is moderator', () => {
    const members = [
      member({ user_id: 'owner', role: 'owner', display_name: 'Owner' }),
      member({ user_id: 'mod-1', role: 'moderator', display_name: 'John Doe', username: 'johndoe' }),
      member({ user_id: 'mod-2', role: 'moderator', display_name: 'Sarah', username: 'sarah' }),
      member({ user_id: 'follower-1', role: 'follower', display_name: 'Reader' }),
    ];

    const moderators = deriveChannelModerators(members);

    expect(moderators.map((m) => m.user_id)).toEqual(['mod-1', 'mod-2']);
    expect(moderators).toHaveLength(2);
  });

  it('excludes the owner unless the database explicitly stores them as a moderator', () => {
    const ownerOnly = deriveChannelModerators([
      member({ user_id: 'owner', role: 'owner' }),
      member({ user_id: 'follower', role: 'follower' }),
    ]);
    expect(ownerOnly).toEqual([]);

    const ownerAsModerator = deriveChannelModerators([
      member({ user_id: 'owner', role: 'moderator', display_name: 'Owner' }),
    ]);
    expect(ownerAsModerator.map((m) => m.user_id)).toEqual(['owner']);
  });

  it('orders moderators by display name (case-insensitive)', () => {
    const moderators = deriveChannelModerators([
      member({ user_id: 'c', role: 'moderator', display_name: 'zara' }),
      member({ user_id: 'a', role: 'moderator', display_name: 'Alice' }),
      member({ user_id: 'b', role: 'moderator', display_name: 'bob' }),
    ]);

    expect(moderators.map((m) => m.display_name)).toEqual(['Alice', 'bob', 'zara']);
  });

  it('falls back to username when display_name is missing', () => {
    const moderators = deriveChannelModerators([
      member({ user_id: 'b', role: 'moderator', display_name: '', username: 'bravo' }),
      member({ user_id: 'a', role: 'moderator', display_name: '', username: 'alpha' }),
    ]);

    expect(moderators.map((m) => m.username)).toEqual(['alpha', 'bravo']);
  });

  it('returns an empty list when there are no moderators (not a hardcoded count)', () => {
    expect(deriveChannelModerators([])).toEqual([]);
    expect(
      deriveChannelModerators([
        member({ user_id: 'owner', role: 'owner' }),
        member({ user_id: 'f1', role: 'follower' }),
      ])
    ).toEqual([]);
  });
});
