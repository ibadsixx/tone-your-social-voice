// The Groups page must distinguish "the API confirmed no memberships" from "the
// request failed". Before this, a failed group fetch left the list empty and the
// Joined tab rendered "You haven't joined any groups yet" — a silent, wrong
// success. These tests pin the error state and the retry action.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Groups from '@/pages/Groups';

const state = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  fetchGroups: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useGroups', () => ({
  useGroups: () => ({
    loading: state.loading,
    error: state.error,
    fetchGroups: state.fetchGroups,
    joinGroup: vi.fn(),
    leaveGroup: vi.fn(),
    createGroup: vi.fn(),
    getSuggestedGroups: () => [],
    getNewGroups: () => [],
    getMostActiveGroups: () => [],
    getJoinedGroups: () => [],
    getManagedGroups: () => [],
  }),
}));

beforeEach(() => {
  state.loading = false;
  state.error = null;
  state.fetchGroups.mockReset();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <Groups />
    </MemoryRouter>
  );

describe('Groups page: failure vs. genuinely empty', () => {
  const openJoinedTab = () => {
    const tab = screen.getByRole('tab', { name: /joined/i });
    fireEvent.mouseDown(tab, { button: 0 });
    fireEvent.click(tab);
  };

  it('shows an actionable error state instead of the empty joined message', () => {
    state.error = 'Failed to load groups';
    renderPage();
    openJoinedTab();

    // The error is surfaced…
    expect(screen.getByText("We couldn't load your groups")).toBeTruthy();
    expect(screen.getByText('Failed to load groups')).toBeTruthy();

    // …and the Joined tab never claims the user has no groups.
    expect(screen.queryByText("You haven't joined any groups yet")).toBeNull();
  });

  it('retries the fetch from the error state', () => {
    state.error = 'Failed to load groups';
    renderPage();

    fireEvent.click(screen.getByText('Try again'));
    expect(state.fetchGroups).toHaveBeenCalled();
  });

  it('shows the empty joined message only once the API confirms no groups', () => {
    state.error = null;
    renderPage();
    openJoinedTab();

    expect(screen.queryByText("We couldn't load your groups")).toBeNull();
    expect(screen.getByText("You haven't joined any groups yet")).toBeTruthy();
  });
});
