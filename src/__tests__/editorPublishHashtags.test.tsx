// The Editor publish path inserted the `posts` row and stopped there, so a
// caption typed in the Editor never reached `saveMentionsAndHashtags` — no
// `hashtags` row, no `hashtag_links` row, and a `#POV` that could not appear in
// any hashtag page. The feed composer (`NewPost.tsx`) has always made that call,
// which is why the same text worked from one entry point and not the other.
//
// These tests mount the real page and assert it delegates to the EXISTING helper
// rather than writing `hashtags` / `hashtag_links` itself — duplicating the
// helper here would be the second hashtag architecture the fix is meant to avoid.
//
// Run: npx vitest run src/__tests__/editorPublishHashtags.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const VIEWER = 'viewer-1';
const POST_ID = '77777777-7777-7777-7777-777777777777';

const saveMentionsAndHashtags = vi.fn();

// The user object must be STABLE across renders. `useAuth` here returns a
// literal, so a fresh object each call would change the identity of the `user`
// dependency in the page's load effect and re-run it forever.
const AUTH_USER = { id: VIEWER };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: AUTH_USER }) }));
vi.mock('@/hooks/useMentions', () => ({
  useMentions: () => ({ saveMentionsAndHashtags }),
}));
// `use-toast` backs both `toast()` and `useToast()`. Stubbing only the named
// export leaves `useFriends` (pulled in by TagPeopleModal) calling the real hook.
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));
// The page mounts two heavy children that open their own data reads (the
// friends list, the places autocomplete). Neither is under test, and stubbing
// the components cuts their whole subtree rather than chasing each hook.
vi.mock('@/components/TagPeopleModal', () => ({ default: () => null }));
vi.mock('@/components/LocationSelector', () => ({ LocationSelector: () => null }));
// `useLocation` keeps a debounce timer alive, which keeps the worker from
// exiting cleanly between tests.
vi.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({
    searchLocation: vi.fn(),
    locationLoading: false,
  }),
  LocationData: {},
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearchParams: () => [new URLSearchParams('projectId=proj-1'), vi.fn()],
  };
});

/** What the page asked the gateway to write. */
const writes: Array<{ table: string; op: string; rows: unknown[] }> = [];
/** Call order of the collaborators the ordering test compares. */
const order: string[] = [];

const project = {
  id: 'proj-1',
  owner_id: VIEWER,
  title: 'Untitled Project',
  status: 'draft',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  project_json: {
    // A video track is required — the publish path throws without one.
    tracks: [
      { type: 'video', clips: [{ src: 'https://cdn.test/clip.mp4' }] },
      { type: 'text', clips: [{ text: 'Hello' }] },
    ],
    settings: { caption: '', duration: 5 },
  },
};

vi.mock('@/lib/gateway', () => {
  /** A chainable query builder over a canned result set. */
  const builder = (table: string, result: unknown) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve({ data: result, error: null }),
      then: (onDone: (v: unknown) => unknown) =>
        onDone({ data: result === undefined ? [] : [result], error: null }),
    };
    return chain;
  };

  const write = (table: string, op: string, rows: unknown) => {
    const list = Array.isArray(rows) ? rows : [rows];
    writes.push({ table, op, rows: list });
    const written = list[list.length - 1] as Record<string, unknown>;
    if (table === 'posts' && (op === 'insert' || op === 'update')) order.push('post');
    // An insert of a post is what creates the id the helper needs.
    return builder(table, op === 'insert' && table === 'posts' ? { ...written, id: POST_ID } : written);
  };

  const readResult = (table: string) =>
    table === 'editor_projects' ? project : undefined;

  return {
    gateway: {
      from: (table: string) => ({
        select: () => builder(table, readResult(table)),
        insert: (rows: unknown) => write(table, 'insert', rows),
        update: (rows: unknown) => write(table, 'update', rows),
        delete: () => builder(table, {}),
      }),
      storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) },
    },
  };
});

import EditorPublish from '@/pages/EditorPublish';

/**
 * The Publish button is disabled until the settings form has hydrated, so a
 * click before that is a no-op. Waiting for it to be enabled is therefore the
 * reliable signal that `loadProject` finished.
 */
async function hydrated() {
  await waitFor(
    () => {
      const button = screen.getByRole('button', { name: 'Publish' });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    },
    { timeout: 5000 }
  );
}

async function publish() {
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveMentionsAndHashtags).toHaveBeenCalled(), { timeout: 5000 });
}

describe('publishing from the Editor registers the caption hashtags', () => {
  beforeEach(() => {
    writes.length = 0;
    navigate.mockClear();
    saveMentionsAndHashtags.mockClear();
    saveMentionsAndHashtags.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('calls the existing helper with the post id and the caption', async () => {
    render(
      <MemoryRouter>
        <EditorPublish />
      </MemoryRouter>
    );
    await hydrated();

    // The caption the form is hydrated with comes from the draft read; the
    // publish path sends `settings.caption` as the post's `content`. Whatever
    // it is, the same string must reach the helper.
    await publish();

    await waitFor(() => expect(saveMentionsAndHashtags).toHaveBeenCalledTimes(1));
    const [sourceType, sourceId, content] = saveMentionsAndHashtags.mock.calls[0];
    expect(sourceType).toBe('post');
    expect(sourceId).toBe(POST_ID);
    expect(typeof content).toBe('string');
  });

  it('is called only AFTER the post row exists', async () => {
    render(
      <MemoryRouter>
        <EditorPublish />
      </MemoryRouter>
    );
    await hydrated();

    // Ordering is the point: a hashtag row pointing at a post that does not
    // exist yet is an orphan, so the helper must never precede the insert.
    // Recorded by pushing onto a shared timeline from inside each collaborator
    // at call time — polling would race the microtasks it is trying to order.
    order.length = 0;
    saveMentionsAndHashtags.mockImplementation(async () => {
      order.push('hashtags');
    });

    await publish();

    expect(order).toEqual(['post', 'hashtags']);
  });

  it('does not write hashtags or hashtag_links from the page itself', async () => {
    render(
      <MemoryRouter>
        <EditorPublish />
      </MemoryRouter>
    );
    await hydrated();
    await publish();
    await waitFor(() => expect(saveMentionsAndHashtags).toHaveBeenCalled());

    // The helper owns those tables. A direct write here would be a second
    // implementation of the same thing, which is what this fix exists to avoid.
    const tables = writes.map(w => w.table);
    expect(tables).not.toContain('hashtags');
    expect(tables).not.toContain('hashtag_links');
    expect(tables).not.toContain('mentions');
  });

  it('still completes the publish when the helper fails', async () => {
    // The post is already live when the helper runs, so a hashtag failure must
    // not unwind the publish (story write, project status, redirect).
    saveMentionsAndHashtags.mockRejectedValue(new Error('hashtags host down'));

    render(
      <MemoryRouter>
        <EditorPublish />
      </MemoryRouter>
    );
    await hydrated();
    await publish();

    await waitFor(() => expect(saveMentionsAndHashtags).toHaveBeenCalled());
    await waitFor(() =>
      expect(writes.some(w => w.table === 'editor_projects' && w.op === 'update')).toBe(true)
    );
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
