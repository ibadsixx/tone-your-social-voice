import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ScheduledPostsTab must verify the authenticated user against the viewed
// profile owner at load time: a non-owner (even reachable without the redirect)
// must never trigger a scheduled-post request and must see the private state.
// The auth mock is a static owner, so the ownership gate is exercised through
// the viewed profile id (repo convention: mock factories never close over
// module-level state).
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner' }, loading: false }),
}));

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock('@/api/posts', () => ({
  getScheduledPosts: vi.fn(),
}));

vi.mock('@/lib/gateway', () => ({
  gateway: { from: vi.fn() },
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children}</div> },
}));

vi.mock('lucide-react', () => ({
  Calendar: () => null,
  Clock: () => null,
  Edit3: () => null,
  Trash2: () => null,
  Eye: () => null,
  Lock: () => null,
  X: () => null,
}));

vi.mock('@/components/SchedulePostModal', () => ({
  default: () => null,
}));

vi.mock('date-fns', () => ({
  format: () => 'scheduled date',
}));

import { getScheduledPosts } from '@/api/posts';
import ScheduledPostsTab from '@/components/ScheduledPostsTab';

const scheduledPost = {
  id: 'sp1',
  content: 'Draft content',
  scheduled_at: '2026-10-01T10:00:00.000Z',
  created_at: '2026-09-01T10:00:00.000Z',
  user_id: 'owner',
  feeling_activity_emoji: null,
  feeling_activity_text: null,
  profiles: {
    username: 'owner',
    display_name: 'Owner',
    profile_pic: null,
  },
};

describe('ScheduledPostsTab privacy', () => {
  beforeEach(() => {
    vi.mocked(getScheduledPosts).mockReset();
    vi.mocked(getScheduledPosts).mockResolvedValue({ data: [], error: null });
  });

  it('does not request scheduled posts and shows the private state for a non-owner', async () => {
    render(<ScheduledPostsTab profileId="another-user" />);

    await screen.findByTestId('scheduled-private');
    expect(getScheduledPosts).not.toHaveBeenCalled();
  });

  it('fails closed when no profile owner is provided', async () => {
    render(<ScheduledPostsTab />);

    await screen.findByTestId('scheduled-private');
    expect(getScheduledPosts).not.toHaveBeenCalled();
  });

  it('requests the owner\u2019s scheduled posts only for the matching profile', async () => {
    render(<ScheduledPostsTab profileId="owner" />);

    await waitFor(() => expect(getScheduledPosts).toHaveBeenCalledTimes(1));
    expect(getScheduledPosts).toHaveBeenCalledWith('owner');
  });

  it('renders the owner\u2019s scheduled posts when access is allowed', async () => {
    vi.mocked(getScheduledPosts).mockResolvedValue({ data: [scheduledPost], error: null });
    render(<ScheduledPostsTab profileId="owner" />);

    expect(await screen.findByText('Draft content')).toBeTruthy();
    expect(screen.queryByTestId('scheduled-private')).toBeNull();
  });
});