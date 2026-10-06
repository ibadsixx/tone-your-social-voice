// The EDIT POST flow was the gap: `EditPostDialog` called `postsApi.updatePost`
// and stopped, so a tag typed into an existing post never reached
// `hashtags` / `hashtag_links`. The composer and the Editor both call the shared
// `saveMentionsAndHashtags('post', id, text)` helper after the row exists; this
// file mounts the real dialog and asserts it now does the same - and, crucially,
// that it delegates to that helper instead of writing the hashtag tables itself.
//
// Run: npx vitest run src/__tests__/editPostDialogSync.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  updatePost: vi.fn(),
  saveMentionsAndHashtags: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/api', () => ({ postsApi: { updatePost: mocks.updatePost } }));
vi.mock('@/hooks/useMentions', () => ({
  useMentions: () => ({ saveMentionsAndHashtags: mocks.saveMentionsAndHashtags }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }), toast: mocks.toast }));

import { EditPostDialog } from '@/components/EditPostDialog';

const POST_ID = '11111111-1111-1111-1111-111111111111';
const onOpenChange = vi.fn();
const onPostUpdated = vi.fn();

const renderDialog = (initialContent: string) =>
  render(
    <EditPostDialog
      open
      onOpenChange={onOpenChange}
      post={{ id: POST_ID, content: initialContent }}
      onPostUpdated={onPostUpdated}
    />
  );

/** Type a new caption and press Save Changes. */
async function editTo(nextContent: string) {
  const textarea = screen.getByPlaceholderText("What's on your mind?");
  fireEvent.change(textarea, { target: { value: nextContent } });
  const save = screen.getByRole('button', { name: /save changes/i });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(save);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.updatePost.mockResolvedValue({ data: null, error: null });
  mocks.saveMentionsAndHashtags.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('editing a post synchronizes its hashtags through the existing helper', () => {
  it('calls the helper with the edited id and the new text', async () => {
    renderDialog('Test');
    await editTo('Test #POV');

    await waitFor(() =>
      expect(mocks.saveMentionsAndHashtags).toHaveBeenCalledWith('post', POST_ID, 'Test #POV')
    );
  });

  it('runs the helper only after the posts row update resolves', async () => {
    // A hashtag row pointing at a not-yet-updated (or failed) post is an orphan,
    // so the ordering is the fact being pinned, not that both ran.
    const order: string[] = [];
    mocks.updatePost.mockImplementation(async () => {
      order.push('update');
      return { data: null, error: null };
    });
    mocks.saveMentionsAndHashtags.mockImplementation(async () => {
      order.push('sync');
    });

    renderDialog('Test');
    await editTo('Test #POV');

    await waitFor(() => expect(mocks.saveMentionsAndHashtags).toHaveBeenCalled());
    expect(order).toEqual(['update', 'sync']);
  });

  it('does not call the helper when the posts update fails', async () => {
    mocks.updatePost.mockResolvedValue({ data: null, error: { message: 'update failed' } });

    renderDialog('Test');
    await editTo('Test #POV');

    await waitFor(() => expect(mocks.updatePost).toHaveBeenCalled());
    expect(mocks.saveMentionsAndHashtags).not.toHaveBeenCalled();
  });

  it('still completes the edit when the helper fails', async () => {
    // The post is already live when the helper runs; a hashtag failure must not
    // surface as a failed edit or block the dialog from closing.
    mocks.saveMentionsAndHashtags.mockRejectedValue(new Error('hashtags host down'));

    renderDialog('Test');
    await editTo('Test #POV');

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onPostUpdated).toHaveBeenCalled();
  });

  it('calls the helper for a caption with no hashtag too', async () => {
    // The helper's own no-op handles the no-tag case; the entry point must not
    // decide, or the two paths could drift the way they already did once.
    renderDialog('Test #POV');
    await editTo('Test for everyone');

    await waitFor(() =>
      expect(mocks.saveMentionsAndHashtags).toHaveBeenCalledWith('post', POST_ID, 'Test for everyone')
    );
  });

  it('trims the caption before it reaches the helper', async () => {
    renderDialog('Test');
    await editTo('  Test #POV  ');

    await waitFor(() =>
      expect(mocks.saveMentionsAndHashtags).toHaveBeenCalledWith('post', POST_ID, 'Test #POV')
    );
    expect(mocks.updatePost).toHaveBeenCalledWith(POST_ID, { content: 'Test #POV' });
  });
});