// Regression tests for the Story Viewer reply/reaction UI (do.md):
//  1. A viewer of another user's story sees the reply input DIRECTLY at the
//     bottom of the viewer — no "Send Message" button gate — with the
//     placeholder "Write a reply...".
//  2. The Send button is disabled while the input is empty and becomes enabled
//     once the viewer starts typing.
//  3. Enter sends the reply through the existing story-reply/message infra
//     (get_or_create_dm + messages insert with the 📸 story prefix), clears the
//     input, and disables Send again.
//  4. The story reaction control uses the Post-style ok-hand trigger
//     (React to story); clicking it quick-likes the story with the 'ok'
//     reaction.
//  5. The reply input is NOT shown to the story owner viewing their own story.
//
// Heavy child components (analytics, archive, highlight dialog, media, etc.)
// and the gateway client are mocked; the reply send path is asserted by
// inspecting the gateway mock calls. Note: the repo does not load
// @testing-library/jest-dom, so plain matchers are used.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

import StoryViewer from '@/components/StoryViewer';
import type { Story } from '@/hooks/useStories';
import { gateway } from '@/lib/gateway';

// Control the signed-in user per test (viewer vs owner).
const auth = vi.hoisted(() => ({
  userId: 'viewer-1',
}));

// State + spy for the story reaction hook (lets tests simulate a stored
// reaction for the current viewer, exactly like the DB-backed hook would).
interface StoryReactionRow {
  id: string;
  story_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

const storyReactions = vi.hoisted(() => ({
  toggleReaction: vi.fn(),
  data: { reactions: [] as StoryReactionRow[] },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: auth.userId ? { id: auth.userId } : null }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useStoryMentions', () => ({
  useStoryMentions: () => ({ mentions: [] }),
}));

vi.mock('@/hooks/useStoryPolls', () => ({
  useStoryPolls: () => ({ poll: null, vote: vi.fn() }),
}));

vi.mock('@/hooks/useStoryQuestions', () => ({
  useStoryQuestions: () => ({ question: null, respond: vi.fn() }),
}));

vi.mock('@/hooks/useStoryReactions', () => ({
  useStoryReactions: () => ({
    reactions: storyReactions.data.reactions,
    loading: false,
    toggleReaction: storyReactions.toggleReaction,
    getReactionCounts: () => {
      const counts: Record<string, number> = {};
      for (const r of storyReactions.data.reactions) {
        counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      }
      return counts;
    },
    getUserReactions: () => storyReactions.data.reactions,
  }),
}));

vi.mock('@/lib/gateway', () => ({
  gateway: {
    rpc: vi.fn(async () => ({ data: 'conv-1', error: null })),
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
    })),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Stub heavy/unrelated story surface so the tests stay focused.
vi.mock('@/components/StoryAnalytics', () => ({ default: () => null }));
vi.mock('@/components/AddToHighlightDialog', () => ({ default: () => null }));
vi.mock('@/components/StoryArchiveButton', () => ({ default: () => null }));
vi.mock('@/components/StoryAudioPlayer', () => ({ default: () => null }));
vi.mock('@/components/StoryPollSticker', () => ({ default: () => null }));
vi.mock('@/components/StoryQuestionSticker', () => ({ default: () => null }));
vi.mock('@/components/AnimatedWebP', () => ({ default: () => null }));

// StoryReactions (kept real) uses framer-motion; render as plain elements.
vi.mock('framer-motion', () => {
  const motion = new Proxy({}, { get: () => 'div' });
  const AnimatePresence = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { motion, AnimatePresence };
});

// jsdom has no ResizeObserver; StoryViewer measures the content area with one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const STORY: Story = {
  id: 'story-1',
  user_id: 'owner-1',
  media_url: 'https://mock.test/story.jpg',
  media_type: 'image',
  thumbnail_url: null,
  caption: null,
  duration: 5,
  music_url: null,
  music_title: null,
  music_start_at: null,
  music_duration: null,
  music_source_type: null,
  music_video_id: null,
  music_thumbnail_url: null,
  created_at: '2026-09-22T00:00:00Z',
  expires_at: '2026-09-23T00:00:00Z',
  views: 0,
  viewed_by: [],
  privacy: 'public',
  profiles: {
    username: 'owner',
    display_name: 'Owner',
    profile_pic: null,
  },
};

const renderViewer = () =>
  render(
    <StoryViewer
      stories={[STORY]}
      username="owner"
      displayName="Owner"
      profilePic={null}
      open
      onOpenChange={() => {}}
      onView={() => {}}
      initialIndex={0}
    />
  );

// Simulate the viewer having (or not having) a stored reaction for the story.
const setStoredReaction = (emoji: string | null) => {
  storyReactions.data.reactions = emoji
    ? [
        {
          id: 'rr-1',
          story_id: 'story-1',
          user_id: 'viewer-1',
          emoji,
          created_at: '2026-09-22T00:00:00Z',
        },
      ]
    : [];
};

const replyInput = () => screen.getByPlaceholderText('Write a reply...');
const replyInputQuery = () => screen.queryByPlaceholderText('Write a reply...');
const sendButton = () => screen.getByRole('button', { name: 'Send reply' });
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

describe('StoryViewer reply input (viewer only)', () => {
  beforeEach(() => {
    Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });
    auth.userId = 'viewer-1';
    storyReactions.data.reactions = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the reply input directly (no "Send Message" button) for a viewer', () => {
    renderViewer();

    expect(replyInput()).toBeTruthy();
    expect(screen.queryByText('Send Message')).toBeNull();
  });

  it('disables Send while empty and enables it once the viewer types', () => {
    renderViewer();

    const input = replyInput();
    expect(isDisabled(sendButton())).toBe(true);

    fireEvent.change(input, { target: { value: 'Love this story!' } });
    expect(isDisabled(sendButton())).toBe(false);
  });

  it('sends the reply via the existing story-reply infra on Enter and clears the input', async () => {
    renderViewer();

    const input = replyInput();
    fireEvent.change(input, { target: { value: 'Love this story!' } });

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(gateway.rpc).toHaveBeenCalledWith('get_or_create_dm', {
        p_user_a: 'viewer-1',
        p_user_b: 'owner-1',
      });
    });

    await waitFor(() => {
      expect(gateway.from).toHaveBeenCalledWith('messages');
    });

    const insertMock = (gateway.from as ReturnType<typeof vi.fn>).mock.results[0].value.insert;
    expect(insertMock).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      sender_id: 'viewer-1',
      content: '📸 Replied to your story: Love this story!',
    });

    // Input is cleared after a successful send and Send is disabled again.
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('');
    });
    expect(isDisabled(sendButton())).toBe(true);
  });

  it('uses the Post-style ok-hand trigger and quick-likes with "ok" on click', () => {
    renderViewer();

    const trigger = screen.getByTitle('React to story');
    expect(trigger).toBeTruthy();

    fireEvent.click(trigger);
    expect(storyReactions.toggleReaction).toHaveBeenCalledWith('ok');
  });

  it('shows the gray/inactive ok-hand (Post style) before the viewer reacts', () => {
    renderViewer();

    const trigger = screen.getByTitle('React to story');
    const img = trigger.querySelector('img');

    expect(img?.getAttribute('src')).toBe('/emoji/1f44c.png');
    const imgClass = img?.getAttribute('class') || '';
    expect(imgClass).toContain('grayscale');
    expect(imgClass).toContain('opacity-60');
    // Button text state mirrors the Post inactive state.
    expect(trigger.className).toContain('text-muted-foreground');
    expect(trigger.className).not.toContain('text-primary');
  });

  it('shows the active/colored state reflecting the viewer\'s stored reaction', () => {
    setStoredReaction('red_heart');
    renderViewer();

    const trigger = screen.getByTitle('React to story');
    const img = trigger.querySelector('img');

    // Active state matches the Post active state (text-primary + hover:opacity-80).
    expect(trigger.className).toContain('text-primary');
    expect(trigger.className).toContain('hover:opacity-80');
    // Icon reflects the stored reaction, not a hard-coded ok-hand.
    expect(img?.getAttribute('src')).toBe('/emoji/2764.png');
    const imgClass = img?.getAttribute('class') || '';
    expect(imgClass).not.toContain('grayscale');
    // Total reaction count is shown in the trigger.
    expect(trigger.textContent).toContain('1');
  });

  it('returns to the gray ok-hand when the viewer removes their reaction', () => {
    setStoredReaction('ok');
    renderViewer();
    expect(
      screen.getByTitle('React to story').querySelector('img')?.getAttribute('class')
    ).not.toContain('grayscale');

    cleanup();
    setStoredReaction(null);
    renderViewer();

    const img = screen.getByTitle('React to story').querySelector('img');
    expect(img?.getAttribute('src')).toBe('/emoji/1f44c.png');
    expect((img?.getAttribute('class') || '')).toContain('grayscale');
    expect(screen.getByTitle('React to story').className).toContain('text-muted-foreground');
  });

  it('does NOT show the reply input to the story owner', () => {
    auth.userId = 'owner-1';
    renderViewer();

    expect(replyInputQuery()).toBeNull();
    expect(screen.queryByText('Send Message')).toBeNull();
  });
});