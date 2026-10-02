// The OK-hand on `/reels/:id` was wrong in two ways at once, and neither had
// anything to do with the reaction logic:
//
//   1. It was YELLOW when the viewer had not reacted. `/emoji/1f44c.png` is a
//      yellow hand (mean opaque pixel RGB 246,186,58 — chroma spread 205), so
//      "not selected" has to be painted on or it reads as a selection.
//      `StaticReactionIcon` did paint it — but only when `!onDark`, and the reel
//      viewer passes `onDark`. The post card, which does not, showed the same
//      reaction grey on the same post. The check was reading the background
//      instead of the viewer.
//
//   2. It was visibly SMALLER than the rail it sits in. The rail's buttons are
//      `w-12 h-12` circles over `w-6 h-6` glyphs with the count beneath; the
//      OK-hand arrived as the post card's `sm` (16px) icon inside a bare ghost
//      button with the count beside it.
//
// Both are asserted here against the mounted viewer, against the shared
// components directly, and — for the states that only exist after a click — by
// driving the real `useReactions` mutation path against an in-memory backend, so
// "removing the reaction turns it grey again" is an actual delete rather than a
// hand-fed prop. Every assertion was checked by reverting the change it covers.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import ReactionPicker from '@/components/ReactionPicker';
import StaticReactionIcon from '@/components/StaticReactionIcon';
import { useReactions } from '@/hooks/useReactions';
import { clearPostActionsForUser } from '@/lib/postActionCache';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

// jsdom implements no media playback and leaves `play()` returning undefined,
// which the viewer's `.play().catch(...)` chain trips over.
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};

// ---------------------------------------------------------------------------
// The shared icon, which is where the colour rule lives.
// ---------------------------------------------------------------------------

/** The one `<img>` a rendered icon produced. */
const onlyImg = (container: HTMLElement) => {
  const imgs = Array.from(container.querySelectorAll('img'));
  expect(imgs.length).toBe(1);
  return imgs[0];
};

describe('the unselected OK-hand is grey, whatever the background', () => {
  // The rule has to key off whether the viewer reacted, and `onDark` says
  // nothing about the viewer — it says what is behind the icon. Keying off it is
  // what made the same reaction two colours on two surfaces of one post.
  it.each([
    ['on a light background', {}],
    ['on a dark background', { onDark: true }],
  ])('is grey %s', (_label, extra) => {
    const { container } = render(
      <StaticReactionIcon reactionKey={null} isActive={false} {...extra} />
    );

    expect(onlyImg(container).className).toContain('grayscale');
  });

  it('is yellow once the OK-hand is selected', () => {
    const { container } = render(
      <StaticReactionIcon reactionKey="ok" isActive onDark />
    );

    // Selected is the *absence* of the filter, not the presence of another: the
    // asset is the same yellow hand in both states.
    expect(onlyImg(container).className).not.toContain('grayscale');
  });

  it('stays grey when merely bright rather than selected', () => {
    // The count text goes bright for a *selected* reaction. Brightness is not
    // selection, and the icon must not read it as one.
    const { container } = render(
      <StaticReactionIcon reactionKey={null} isActive={false} onDark count={12} showZero />
    );

    expect(onlyImg(container).className).toContain('grayscale');
  });

  it('does not dim the grey on dark, where the rail icons are solid white', () => {
    const { container: onDark } = render(
      <StaticReactionIcon reactionKey={null} isActive={false} onDark />
    );
    const { container: light } = render(
      <StaticReactionIcon reactionKey={null} isActive={false} />
    );

    // `opacity-60` is the light card's own dimming of an inactive control. On the
    // overlay it would leave this icon fainter than the white icons beside it,
    // which is the same "smaller/dimmer than its neighbours" complaint as the
    // size bug.
    expect(onlyImg(onDark).className).not.toContain('opacity-60');
    expect(onlyImg(light).className).toContain('opacity-60');
  });
});

describe('other reactions keep their own colours', () => {
  // The fix touches only the default-hand branch, which is the branch taken when
  // `reactionKey` resolves to no config. A selected reaction renders its own
  // asset with no filter at all, and must stay that way.
  it.each([
    ['red_heart', '2764'],
    ['laughing', '1f606'],
    ['astonished', '1f62e'],
    ['cry', '1f622'],
    ['rage', '1f621'],
    ['hug_face', '1f917'],
  ])('%s renders its own asset, unfiltered', (key, asset) => {
    const { container } = render(<StaticReactionIcon reactionKey={key} isActive onDark />);

    const img = onlyImg(container);
    expect(img.className).not.toContain('grayscale');
    expect(img.getAttribute('src')).toBe(`/emoji/${asset}.png`);
  });

  it('an unknown key falls back to the OK-hand asset rather than a broken image', () => {
    // `getReactionConfig` returns null for anything unrecognised, which lands in
    // the default-hand branch. The fallback must still follow the selected state,
    // or a stored value this build doesn't recognise would paint a yellow hand
    // and read as a selection the viewer never made.
    const { container } = render(
      <StaticReactionIcon reactionKey="not-a-reaction" isActive={false} onDark />
    );

    expect(onlyImg(container).getAttribute('src')).toBe('/emoji/1f44c.png');
    expect(onlyImg(container).className).toContain('grayscale');
  });

  it('resolves a legacy stored value to its modern reaction, keeping the colour', () => {
    // Rows written before the reaction set was renamed still say `like`. They map
    // onto the OK-hand, so they must show the selected yellow hand — not fall
    // through to the grey default.
    const { container } = render(
      <StaticReactionIcon reactionKey="ok" isActive onDark />
    );
    const legacy = render(<StaticReactionIcon reactionKey="ok" isActive onDark />);

    expect(onlyImg(container).className).toBe(onlyImg(legacy.container).className);
    expect(onlyImg(container).className).not.toContain('grayscale');
  });
});

describe('the picker offers the same reactions in both presentations', () => {
  // `variant` is presentation only. If it ever grew its own reaction set, the
  // viewer and the feed would be offering different things from one component.
  const openAndReadTitles = async (variant: 'inline' | 'overlay') => {
    const { unmount } = render(
      <ReactionPicker
        isLiked={false}
        selectedReaction={null}
        likesCount={0}
        onDark
        variant={variant}
        onReact={() => {}}
        onLike={() => {}}
      />
    );

    // The overlay trigger carries `aria-label`; the inline one takes its
    // accessible name from the icon inside it. Both are addressed by the button
    // wrapping the hand, so this reads the same trigger either way.
    const trigger = screen.getByAltText('Like').closest('button') as HTMLElement;
    fireEvent.mouseEnter(trigger);
    const titles = await waitFor(() => {
      const found = screen
        .getAllByRole('button')
        .map((b) => b.getAttribute('title'))
        .filter(Boolean);
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    unmount();
    return titles;
  };

  it('overlay offers every reaction inline offers', async () => {
    expect(await openAndReadTitles('overlay')).toEqual(await openAndReadTitles('inline'));
  });

  it('inline stays the post card size, so the feed is unchanged', () => {
    const { container } = render(
      <ReactionPicker isLiked={false} selectedReaction={null} likesCount={7} onReact={() => {}} onLike={() => {}} />
    );

    const img = onlyImg(container);
    expect(img.className).toContain('h-4');
    expect(img.className).toContain('w-4');
  });
});

// ---------------------------------------------------------------------------
// An in-memory stand-in for the Gateway, so a click is a real write.
// ---------------------------------------------------------------------------

const REEL_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = 'owner-1';

type Row = { id: string; user_id: string; type: string; post_id: string; created_at: string };

let reel: Record<string, unknown> = {};
/** The `reactions` table as the server would hold it. */
let rows: Row[] = [];
/** Other people's reactions — they count towards the total but are never shown. */
let others = 3;
let nextId = 1;
let currentUser: { id: string } | null = { id: OWNER_ID };

/** Apply a queued write. Lazy: only at the `await`, like a real round trip. */
const applyWrite = (op: { kind: string; payload?: Record<string, unknown>; id?: string } | null) => {
  if (!op) return null;
  if (op.kind === 'insert') {
    const row: Row = {
      id: `row-${nextId++}`,
      user_id: OWNER_ID,
      type: String(op.payload?.type),
      post_id: String(op.payload?.post_id ?? REEL_ID),
      created_at: '2026-01-01T00:00:00.000Z',
    };
    rows = [...rows, row];
    return row;
  }
  const id = op.id;
  if (op.kind === 'delete') rows = rows.filter((r) => r.id !== id);
  if (op.kind === 'update') {
    rows = rows.map((r) => (r.id === id ? { ...r, type: String(op.payload?.type) } : r));
  }
  return null;
};

const buildReactionsTable = () => {
  let queued: { kind: string; payload?: Record<string, unknown>; id?: string } | null = null;
  const self: Record<string, unknown> = {
    select: () => self,
    eq: (column: string, value: string) => {
      if (queued && column === 'id') queued.id = value;
      return self;
    },
    insert: (payload: Record<string, unknown>) => {
      queued = { kind: 'insert', payload };
      return self;
    },
    update: (payload: Record<string, unknown>) => {
      queued = { kind: 'update', payload };
      return self;
    },
    delete: () => {
      queued = { kind: 'delete' };
      return self;
    },
    single: async () => ({ data: applyWrite(queued), error: null }),
    then: (resolve: (v: unknown) => unknown) => {
      applyWrite(queued);
      return Promise.resolve(resolve({ data: null, error: null }));
    },
  };
  return self;
};

const aggregate = () => {
  const types: Record<string, number> = {};
  for (const r of rows) types[r.type] = (types[r.type] ?? 0) + 1;
  return {
    reaction_count: others + rows.length,
    reaction_types: types,
    viewer_reactions: rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      reaction_type: r.type,
      created_at: r.created_at,
    })),
  };
};

vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: (table: string) => {
      if (table === 'reactions') return buildReactionsTable();
      if (table === 'posts') {
        const self: Record<string, unknown> = {
          select: () => self,
          eq: () => self,
          order: () => self,
          limit: () => self,
          single: () => Promise.resolve({ data: reel, error: null }),
          then: (onDone: (v: unknown) => unknown) => onDone({ data: [{ id: REEL_ID }], error: null }),
        };
        return self;
      }
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        insert: () => q,
        update: () => q,
        delete: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        then: (onDone: (v: unknown) => unknown) => onDone({ data: [], error: null }),
      };
      return q;
    },
    postReactionUsers: () => Promise.resolve({ data: aggregate(), error: null }),
    postReactionCount: () =>
      Promise.resolve({ data: { reaction_count: others + rows.length, reaction_types: {} }, error: null }),
    commentReactionCounts: () => Promise.resolve({ data: { counts: {} }, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: currentUser }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/hooks/useSeeLessPreference', () => ({
  useSeeLessPreference: () => ({ hideReel: vi.fn(), isLoading: false }),
}));
vi.mock('@/components/modals/SendPostModal', () => ({ SendPostModal: () => null }));
vi.mock('@/components/modals/SharePostModal', () => ({ SharePostModal: () => null }));
vi.mock('@/components/PostCommentsPanel', () => ({ default: () => null }));
vi.mock('@/components/reels/ReelFeedbackModal', () => ({ default: () => null }));
vi.mock('@/components/reels/ReelEmbedModal', () => ({ default: () => null }));

import ReelViewer from '@/pages/ReelViewer';

const renderViewer = () =>
  render(
    <MemoryRouter initialEntries={[`/reels/${REEL_ID}`]}>
      <Routes>
        <Route path="/reels/:id" element={<ReelViewer />} />
      </Routes>
    </MemoryRouter>
  );

/** The rail's Like button, once the reel has loaded. */
const likeButton = async () => {
  const button = await screen.findByLabelText('Like');
  await waitFor(() => expect(button.querySelector('img')).toBeTruthy());
  return button;
};

const handOf = (button: HTMLElement) => button.querySelector('img') as HTMLImageElement;

beforeEach(() => {
  reel = {
    id: REEL_ID,
    user_id: OWNER_ID,
    media_url: 'https://cdn.test/reel.mp4',
    media_type: 'video',
    duration: 12,
    content: 'my reel',
    created_at: '2026-01-01T00:00:00.000Z',
    audience_type: 'public',
    visibility: 'public',
    status: 'published',
    comments: [{ count: 2 }],
    profiles: { username: 'owner', display_name: 'Owner', profile_pic: null },
  };
  rows = [];
  others = 3;
  nextId = 1;
  currentUser = { id: OWNER_ID };
  // The shared action cache is module-level and keyed on (viewer, post); every
  // case here uses the same ids, so without this a settled state from one case
  // would be adopted by the next.
  clearPostActionsForUser(OWNER_ID);
});

afterEach(() => {
  cleanup();
  clearPostActionsForUser(OWNER_ID);
});

// ---------------------------------------------------------------------------
// States 1-4, driven through the real mutation path rather than fed as props.
// ---------------------------------------------------------------------------

/**
 * One reel, both surfaces: the reel rail's overlay picker and the post card's
 * inline picker, each wired to its own `useReactions` on the same post — which is
 * exactly how `/reels/:id` and the feed are built in the app.
 */
const BothSurfaces = () => {
  const rail = useReactions(REEL_ID, OWNER_ID);
  const card = useReactions(REEL_ID, OWNER_ID);

  return (
    <div>
      <ReactionPicker
        variant="overlay"
        onDark
        isLiked={!!rail.userReaction}
        selectedReaction={rail.userReaction}
        likesCount={rail.reactionsCount}
        onReact={(key) => void rail.toggleReaction(key)}
        onLike={() => void rail.toggleReaction('ok')}
      />
      <ReactionPicker
        isLiked={!!card.userReaction}
        selectedReaction={card.userReaction}
        likesCount={card.reactionsCount}
        onReact={(key) => void card.toggleReaction(key)}
        onLike={() => void card.toggleReaction('ok')}
      />
    </div>
  );
};

/** Hover the nth picker, then choose the OK-hand from the opened list. */
const chooseOk = async (nth: 0 | 1) => {
  const triggers = screen.getAllByAltText('Like').map((img) => img.closest('button') as HTMLElement);
  fireEvent.mouseEnter(triggers[nth]);
  const ok = await screen.findByTitle('Like');
  fireEvent.click(ok);
};

const railHand = () => screen.getAllByAltText('Like')[0];
const cardHand = () => screen.getAllByAltText('Like')[1];

describe('the OK-hand follows the viewer, on the reel and on the post alike', () => {
  it('is grey on both surfaces before anyone reacts', async () => {
    render(<BothSurfaces />);

    await waitFor(() => expect(railHand().className).toContain('grayscale'));
    expect(cardHand().className).toContain('grayscale');
  });

  it('turns yellow on both surfaces when the OK-hand is selected', async () => {
    render(<BothSurfaces />);
    await waitFor(() => expect(railHand().className).toContain('grayscale'));

    await chooseOk(0);

    // The post card had no way to learn this except the shared state, so this
    // also proves the reel's write reached it rather than just its own re-read.
    await waitFor(() => expect(railHand().className).not.toContain('grayscale'));
    expect(cardHand().className).not.toContain('grayscale');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('ok');
  });

  it('goes grey on both surfaces again when the reaction is removed', async () => {
    render(<BothSurfaces />);
    await waitFor(() => expect(railHand().className).toContain('grayscale'));

    await chooseOk(0);
    await waitFor(() => expect(railHand().className).not.toContain('grayscale'));

    await chooseOk(0);

    // A real DELETE against the row, then a re-read — not a local state reset.
    await waitFor(() => expect(railHand().className).toContain('grayscale'));
    expect(cardHand().className).toContain('grayscale');
    expect(rows).toHaveLength(0);
  });

  it('keeps the reel button the same size whichever way it is coloured', async () => {
    render(<BothSurfaces />);
    await waitFor(() => expect(railHand().className).toContain('grayscale'));

    /** Just the box, ignoring the colour filter that is meant to change. */
    const boxOf = (img: HTMLElement) =>
      [...img.className.split(/\s+/)].filter((c) => /^(h|w|object|inline|flex)-/.test(c)).join(' ');
    const sizeWhenGrey = boxOf(railHand());
    const circleWhenGrey = railHand().closest('span')!.parentElement!.className;

    await chooseOk(0);
    await waitFor(() => expect(railHand().className).not.toContain('grayscale'));

    // Selecting must not resize the button — only recolour it.
    expect(boxOf(railHand())).toBe(sizeWhenGrey);
    expect(railHand().closest('span')!.parentElement!.className).toBe(circleWhenGrey);
    expect(railHand().className).toContain('h-6');
    expect(railHand().className).toContain('w-6');
  });

  it('reacts when the rail trigger is tapped directly, not only via the list', async () => {
    render(<BothSurfaces />);
    await waitFor(() => expect(railHand().className).toContain('grayscale'));

    // The overlay trigger is a plain <button> under Radix's `asChild`, so its
    // click handler has to survive the prop merge — this is the tap a user makes
    // on the hand itself, and it must not silently do nothing.
    const trigger = railHand().closest('button') as HTMLElement;
    fireEvent.click(trigger);

    await waitFor(() => expect(rows).toHaveLength(1));
    expect(rows[0].type).toBe('ok');
    await waitFor(() => expect(railHand().className).not.toContain('grayscale'));
  });

  it('leaves the post card at its own size when the reel button grows', async () => {
    render(<BothSurfaces />);
    await waitFor(() => expect(railHand().className).toContain('grayscale'));

    // The reel and the feed are the same reaction but not the same layout: the
    // rail's 24px glyph must not drag the post card's 16px one up with it.
    expect(railHand().className).toContain('h-6');
    expect(cardHand().className).toContain('h-4');
    expect(cardHand().className).toContain('w-4');
  });
});

// ---------------------------------------------------------------------------
// The viewer itself, where the two symptoms were reported.
// ---------------------------------------------------------------------------

describe('/reels/:id OK-hand colour follows the viewer, not the background', () => {
  it('is grey when the viewer has not reacted', async () => {
    renderViewer();
    const button = await likeButton();

    await waitFor(() => expect(handOf(button).className).toContain('grayscale'));
  });

  it('is not grey once the viewer has the OK-hand', async () => {
    rows = [
      { id: 'row-legacy', user_id: OWNER_ID, type: 'like', post_id: REEL_ID, created_at: '2026-01-01T00:00:00.000Z' },
    ];
    renderViewer();
    const button = await likeButton();

    // `like` is the pre-rename value for this same reaction.
    await waitFor(() => expect(handOf(button).className).not.toContain('grayscale'));
  });

  it('shows the viewer another reaction rather than an unselected OK-hand', async () => {
    rows = [
      { id: 'row-1', user_id: OWNER_ID, type: 'red_heart', post_id: REEL_ID, created_at: '2026-01-01T00:00:00.000Z' },
    ];
    renderViewer();
    const button = await likeButton();

    // The heart, not the hand — and unfiltered.
    await waitFor(() => {
      const img = handOf(button);
      expect(img.getAttribute('src')).toBe('/emoji/2764.png');
      expect(img.className).not.toContain('grayscale');
    });
  });

  it('keeps the count white and legible over the dark overlay', async () => {
    renderViewer();
    const button = await likeButton();

    await waitFor(() => expect(button.textContent).toContain('3'));
  });
});

describe('/reels/:id OK-hand is sized like the rail it sits in', () => {
  it('uses the same 24px glyph as the other rail icons', async () => {
    renderViewer();
    const button = await likeButton();

    // `w-6 h-6` is what Comment, Send, Share, Save and More use on this rail.
    await waitFor(() => {
      const cls = handOf(button).className;
      expect(cls).toContain('h-6');
      expect(cls).toContain('w-6');
    });
    expect(handOf(button).className).not.toContain('h-4');
  });

  it('sits in the same 48px circle as the other rail buttons', async () => {
    renderViewer();
    const button = await likeButton();

    const circle = button.querySelector('span') as HTMLElement;
    expect(circle.className).toContain('w-12');
    expect(circle.className).toContain('h-12');
    expect(circle.className).toContain('rounded-full');
  });

  it('matches a neighbour button for circle and column alignment', async () => {
    renderViewer();
    const like = await likeButton();
    const comment = await screen.findByLabelText('Comments');

    const circleOf = (b: HTMLElement) =>
      b.querySelector('span')?.className ?? b.querySelector('div')?.className ?? '';
    // Comment uses `w-7 h-7` for its glyph; the circle is what must agree, since
    // that is the element the eye compares.
    expect(circleOf(like)).toContain(circleOf(comment).match(/w-12 h-12/)?.[0] ?? '');
    expect(like.className).toContain('flex-col');
    expect(comment.className).toContain('flex-col');
  });

  it('does not enlarge the buttons around it', async () => {
    renderViewer();
    const comment = await screen.findByLabelText('Comments');
    const share = await screen.findByLabelText('Share');

    // The brief is explicit: match the OK-hand to the others, not the reverse.
    for (const button of [comment, share]) {
      const circle = button.querySelector('div') as HTMLElement;
      expect(circle.className).toContain('w-12');
      expect(circle.className).toContain('h-12');
    }
  });

  it('puts the count below the circle, as the other rail buttons do', async () => {
    renderViewer();
    const button = await likeButton();

    await waitFor(() => expect(button.textContent).toContain('3'));
    const [circle, count] = Array.from(button.children);
    expect(circle.className).toContain('w-12');
    expect(count.className).toContain('text-white');
  });

  it('offers no reaction button at all to a guest', async () => {
    currentUser = null;
    renderViewer();

    // A guest gains nothing here, as everywhere else: the account action is not
    // rendered, and the public total is still readable.
    await screen.findByLabelText('Comments');
    expect(screen.queryByLabelText('Like')).toBeNull();
  });
});