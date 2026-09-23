// Tests for the owner-only Story analytics dialog (do.md sections 4-6/10):
//  - total views and total reactions shown side by side (views != reactions)
//  - the reaction list shows WHO reacted and the EXACT reaction each user
//    selected (not a generic "liked" state)
//  - the view list shows everyone who watched, reacting or not
// The hook (and the Gateway) restrict these rows to the Story owner; here the
// hook is mocked as the owner's data source.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import StoryAnalytics from '@/components/StoryAnalytics';
import type { StoryView, StoryReactionAnalytics } from '@/hooks/useStoryAnalytics';

const analytics = vi.hoisted(() => ({
  views: [] as StoryView[],
  reactions: [] as StoryReactionAnalytics[],
}));

vi.mock('@/hooks/useStoryAnalytics', () => ({
  useStoryAnalytics: () => ({
    views: analytics.views,
    reactions: analytics.reactions,
    loading: false,
    refetch: vi.fn(),
  }),
}));

describe('StoryAnalytics (owner-only)', () => {
  beforeEach(() => {
    analytics.views = [];
    analytics.reactions = [];
  });

  afterEach(() => {
    cleanup();
  });

  const renderDialog = () =>
    render(<StoryAnalytics storyId="story-1" open onOpenChange={() => {}} />);

  it('shows total views and total reactions side by side', () => {
    analytics.views = [
      {
        id: 'v1',
        story_id: 'story-1',
        viewer_id: 'user-b',
        viewed_at: '2026-09-22T00:00:00Z',
        viewer: { username: 'b', display_name: 'Bob', profile_pic: null },
      },
    ];
    analytics.reactions = [
      {
        id: 'r1',
        story_id: 'story-1',
        user_id: 'user-d',
        emoji: 'red_heart',
        created_at: '2026-09-22T00:00:00Z',
        user: { username: 'd', display_name: 'Dina', profile_pic: null },
      },
    ];

    renderDialog();

    expect(screen.getByText('Story Analytics')).toBeTruthy();
    // Stats row: views and reactions are counted independently.
    expect(screen.getByText('Views')).toBeTruthy();
    expect(screen.getByText('Reactions')).toBeTruthy();
    expect(screen.getByText('Reactions (1)')).toBeTruthy();
    expect(screen.getByText('Viewed by (1)')).toBeTruthy();
  });

  it('lists each user with the exact reaction they selected', () => {
    analytics.reactions = [
      {
        id: 'r1',
        story_id: 'story-1',
        user_id: 'user-b',
        emoji: 'red_heart',
        created_at: '2026-09-22T00:00:00Z',
        user: { username: 'b', display_name: 'Bob', profile_pic: null },
      },
      {
        id: 'r2',
        story_id: 'story-1',
        user_id: 'user-d',
        emoji: 'ok',
        created_at: '2026-09-22T00:00:00Z',
        user: { username: 'd', display_name: 'Dina', profile_pic: null },
      },
    ];

    renderDialog();

    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Dina')).toBeTruthy();
    // Bob's exact reaction: heart — Dina's exact reaction: ok-hand.
    const heartIcons = document.querySelectorAll('img[src="/emoji/2764.png"]');
    const okIcons = document.querySelectorAll('img[src="/emoji/1f44c.png"]');
    expect(heartIcons.length).toBe(1);
    expect(okIcons.length).toBe(1);
  });

  it('shows the view list from story_views tracking (non-reacting viewers included)', () => {
    analytics.views = [
      {
        id: 'v1',
        story_id: 'story-1',
        viewer_id: 'user-c',
        viewed_at: '2026-09-22T00:00:00Z',
        viewer: { username: 'c', display_name: 'Carl', profile_pic: null },
      },
    ];
    // Carl only watched — he reacted to nothing.
    analytics.reactions = [];

    renderDialog();

    expect(screen.getByText('Carl')).toBeTruthy();
    expect(screen.getByText('No reactions yet')).toBeTruthy();
  });

  it('shows empty states when the story has no views or reactions', () => {
    renderDialog();

    expect(screen.getByText('No reactions yet')).toBeTruthy();
    expect(screen.getByText('No views yet')).toBeTruthy();
  });
});