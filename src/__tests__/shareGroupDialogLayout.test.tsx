// Group "Share" dialog (message.md): layout + behaviour regression.
//
// The real bug was in `ShareGroupDialog`: the dialog panel was the Radix
// `grid` primitive with a `w-full` (100vw) width and no `min-w-0`. The
// horizontal friends strip is wider than the panel, so it stretched the single
// auto grid column to its min-content width (~944px). Because the panel kept
// `overflow-hidden`, everything to the right of the panel — notably the
// right-aligned "Share now" button and the far-right "Friend's profile" option
// — was clipped. On mobile the panel was also edge-to-edge (100vw, no gutter).
//
// The fix: turn the panel into a `flex flex-col` with
// `w-[calc(100%-2rem)] max-w-md max-h-[90vh]`, give the scrolling body
// `min-h-0 flex-1 overflow-y-auto overflow-x-hidden`, and make the friends row
// a horizontally scrollable `w-max` strip.
//
// These assertions guard the structural contract; the pixel-level behaviour is
// covered by e2e/share-dialog.layout.spec.ts (real Chromium + real CSS).
//
// Run: npx vitest run src/__tests__/shareGroupDialogLayout.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';

// jsdom has no ResizeObserver; Radix ScrollArea measures with one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const toastSpy = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  user: { id: 'viewer-1', email: 'viewer@example.com', user_metadata: { display_name: 'Viewer Person' } },
}));

const api = vi.hoisted(() => ({
  getFriendsByUser: vi.fn(),
  getProfileById: vi.fn(),
  createPost: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock('@/api', () => ({
  usersApi: { getFriendsByUser: (...a: unknown[]) => api.getFriendsByUser(...a) },
  profilesApi: { getProfileById: (...a: unknown[]) => api.getProfileById(...a) },
  postsApi: { createPost: (...a: unknown[]) => api.createPost(...a) },
}));

import ShareGroupDialog from '@/components/groups/ShareGroupDialog';

const VIEWER = 'viewer-1';

// `friends` rows are returned accepted-only (the API contract). Include an
// incoming and an outgoing friendship so both directions're exercised.
const FRIEND_ROWS = [
  { id: 'fr-1', requester_id: VIEWER, receiver_id: 'friend-ada', status: 'accepted' },
  { id: 'fr-2', requester_id: 'friend-grace', receiver_id: VIEWER, status: 'accepted' },
];

const PROFILES: Record<string, { id: string; username: string; display_name: string; profile_pic: string | null }> = {
  [VIEWER]: { id: VIEWER, username: 'viewer', display_name: 'Viewer Person', profile_pic: null },
  'friend-ada': { id: 'friend-ada', username: 'ada', display_name: 'Ada Lovelace', profile_pic: null },
  'friend-grace': { id: 'friend-grace', username: 'grace', display_name: 'Grace Hopper', profile_pic: null },
};

const renderDialog = () =>
  render(
    <ShareGroupDialog
      isOpen
      onClose={() => {}}
      groupId="group-1"
      groupName="Test Group"
    />
  );

beforeEach(() => {
  toastSpy.mockReset();
  api.getFriendsByUser.mockReset().mockResolvedValue({ data: FRIEND_ROWS, error: null });
  api.getProfileById
    .mockReset()
    .mockImplementation((id: string) => Promise.resolve({ data: PROFILES[id] ?? null, error: null }));
  api.createPost.mockReset().mockResolvedValue({ data: { id: 'post-1' }, error: null });

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;

describe('ShareGroupDialog layout contract', () => {
  it('constrains the panel to the viewport with a gutter, a max width and a column layout', async () => {
    renderDialog();
    await screen.findByText('Ada Lovelace');

    const panel = dialog();
    const cls = panel.className;
    // Never 100vw edge-to-edge, and capped on desktop.
    expect(cls).toContain('w-[calc(100%-2rem)]');
    expect(cls).toContain('max-w-md');
    // Column layout (the primitive's `grid` is replaced) so a wide child can
    // no longer stretch the panel past the viewport.
    expect(cls).toContain('flex');
    expect(cls).toContain('flex-col');
    // Usable on short screens.
    expect(cls).toContain('max-h-[90vh]');
  });

  it('scrolls its body and keeps a horizontally scrollable friends strip', async () => {
    renderDialog();
    await screen.findByText('Ada Lovelace');

    const panel = dialog();
    const body = panel.querySelector('.overflow-y-auto') as HTMLElement | null;
    expect(body).not.toBeNull();
    expect(body!.className).toContain('min-h-0');
    expect(body!.className).toContain('flex-1');
    expect(body!.className).toContain('overflow-x-hidden');

    // The friends row is a `w-max` strip inside the Radix ScrollArea, and a
    // horizontal scrollbar is registered.
    const strip = panel.querySelector('.w-max') as HTMLElement | null;
    expect(strip).not.toBeNull();
    expect(panel.querySelector('[data-radix-scroll-area-viewport]')).not.toBeNull();
    expect(panel.querySelector('[data-orientation="horizontal"]')).not.toBeNull();

    // Options may wrap rather than clip.
    expect(panel.querySelector('.flex-wrap')).not.toBeNull();
  });
});

describe('ShareGroupDialog behaviour', () => {
  it('lists accepted friends and every existing share option', async () => {
    renderDialog();

    await screen.findByText('Ada Lovelace');
    expect(screen.getByText('Grace Hopper')).toBeTruthy();

    for (const label of ['Send to', 'Share to', 'WhatsApp', 'Copy link', 'Group', "Friend's profile", 'X', 'Share now']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('renders a long friend list without dropping items', async () => {
    const manyRows = Array.from({ length: 20 }, (_, i) => ({
      id: `fr-${i}`,
      requester_id: VIEWER,
      receiver_id: `friend-${i}`,
      status: 'accepted',
    }));
    api.getFriendsByUser.mockResolvedValue({ data: manyRows, error: null });
    api.getProfileById.mockImplementation((id: string) =>
      Promise.resolve({
        data: id === VIEWER
          ? PROFILES[VIEWER]
          : { id, username: `f${id}`, display_name: `Friend ${id}`, profile_pic: null },
        error: null,
      })
    );

    renderDialog();
    await screen.findByText('Friend friend-0');
    expect(screen.getByText('Friend friend-19')).toBeTruthy();
  });

  it('keeps friend selection and Share now working', async () => {
    const onClose = vi.fn();
    render(
      <ShareGroupDialog isOpen onClose={onClose} groupId="group-1" groupName="Test Group" />
    );
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByText('Ada Lovelace').closest('button')!);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Shared with Ada Lovelace' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share now' }));
    await screen.findByText('Ada Lovelace'); // flush effects
    expect(api.createPost).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when the viewer has no friends', async () => {
    api.getFriendsByUser.mockResolvedValue({ data: [], error: null });
    renderDialog();
    await screen.findByText('No friends to send to yet.');
  });

  it('preserves the remaining share options (Copy link, WhatsApp, X, Group)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderDialog();
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/groups/group-1'))
    );
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: '🔗 Link copied!' }));

    fireEvent.click(screen.getByText('WhatsApp'));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('api.whatsapp.com'),
      '_blank',
      expect.any(String)
    );

    fireEvent.click(screen.getByText('X'));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('twitter.com/intent/tweet'),
      '_blank',
      expect.any(String)
    );

    fireEvent.click(screen.getByText('Group'));
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Coming soon' }));
  });
});
