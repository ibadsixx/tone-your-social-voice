// Reel Review & Publish — audience options (Public / Friends / Only you)
// Covers: option rendering (no Followers option), selection state, default
// audience, and normalization of new + legacy stored audience values.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import EditorPublish, { normalizeAudience } from '@/pages/EditorPublish';
import { defaultPublishSettings } from '@/types/editor';

// Hoisted so the gateway mock factory (executed at import time) can read it.
// `auth` must stay referentially stable — a fresh object per render would make
// EditorPublish's `user`-dependent effect re-run loadProject forever.
const hoisted = vi.hoisted(() => ({
  project: {
    id: 'p1',
    title: 'My Reel',
    project_json: { tracks: [], settings: { duration: 30 } },
    updated_at: '2026-09-22T00:00:00.000Z',
  },
  auth: { user: { id: 'viewer' }, loading: false },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => hoisted.auth,
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

vi.mock('@/lib/gateway', () => {
  const methods = [
    'select', 'eq', 'neq', 'or', 'ilike', 'in', 'not', 'order', 'limit',
    'gte', 'lte', 'contains', 'textSearch', 'update', 'insert', 'delete',
    'upsert', 'csv',
  ];
  const chain = (data: unknown) => {
    const builder: Record<string, unknown> = {};
    for (const m of methods) builder[m] = () => chain(data);
    builder.single = async () => ({ data, error: null });
    builder.maybeSingle = async () => ({ data, error: null });
    return builder;
  };
  return {
    gateway: {
      from: (table: string) => {
        const data = table === 'editor_projects' ? { ...hoisted.project } : null;
        return chain(data);
      },
    },
  };
});

// Heavy/unrelated children of the Review & Publish screen are stubbed so the
// render stays small; the tests only exercise the Audience card + Boost state.
vi.mock('@/components/ui/calendar', () => ({ Calendar: () => null }));
vi.mock('@/components/TagPeopleModal', () => ({ default: () => null }));
vi.mock('@/components/LocationSelector', () => ({ LocationSelector: () => null }));

function renderPublish() {
  return render(
    <MemoryRouter initialEntries={['/editor/publish?projectId=p1']}>
      <EditorPublish />
    </MemoryRouter>
  );
}

const waitForAudience = async () => {
  await waitFor(() => expect(screen.getByText('Audience')).toBeTruthy());
};

const option = (labelRegExp: RegExp) =>
  screen.getByRole('button', { name: labelRegExp });

const publicOption = () => option(/^Public(?:\s|$)/);
const friendsOption = () => option(/^Friends(?:\s|$)/);
const onlyYouOption = () => option(/^Only you(?:\s|$)/);

const getBoostSwitch = (): HTMLButtonElement => {
  const row = screen.getByText('Boost Post').closest('div.justify-between') as HTMLElement | null;
  const switchEl = row?.querySelector('button[role="switch"]') as HTMLButtonElement | null;
  if (!switchEl) throw new Error('Boost switch not found');
  return switchEl;
};

describe('normalizeAudience', () => {
  it('maps the supported values through unchanged', () => {
    expect(normalizeAudience('public')).toBe('public');
    expect(normalizeAudience('friends')).toBe('friends');
    expect(normalizeAudience('only_me')).toBe('only_me');
  });

  it('maps the legacy "followers" value to "friends" (its DB mapping)', () => {
    expect(normalizeAudience('followers')).toBe('friends');
  });

  it('falls back to "public" for anything else', () => {
    expect(normalizeAudience(undefined)).toBe('public');
    expect(normalizeAudience(null)).toBe('public');
    expect(normalizeAudience('')).toBe('public');
    expect(normalizeAudience('bogus')).toBe('public');
  });
});

describe('Reel Review & Publish audience UI', () => {
  beforeEach(() => {
    hoisted.project = {
      id: 'p1',
      title: 'My Reel',
      project_json: { tracks: [], settings: { duration: 30 } },
      updated_at: '2026-09-22T00:00:00.000Z',
    };
  });

  it('defaults the audience to public', () => {
    expect(defaultPublishSettings.audience).toBe('public');
  });

  it('renders exactly Public, Friends and Only you — no Followers option', async () => {
    renderPublish();
    await waitForAudience();

    expect(publicOption().textContent).toContain('Anyone can see your Reel');
    expect(friendsOption().textContent).toContain('Only your friends can see your Reel');
    expect(onlyYouOption().textContent).toContain('Only you can see your Reel');

    expect(screen.queryByText('Followers')).toBeNull();
  });

  it('selecting Only you then Friends marks the post as non-public (Boost disabled)', async () => {
    renderPublish();
    await waitForAudience();

    // Default audience is public → Boost available
    expect(getBoostSwitch().disabled).toBe(false);

    fireEvent.click(onlyYouOption());
    await waitFor(() => expect(getBoostSwitch().disabled).toBe(true));

    fireEvent.click(friendsOption());
    await waitFor(() => expect(getBoostSwitch().disabled).toBe(true));
  });
});