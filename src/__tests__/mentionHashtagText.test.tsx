// `MentionHashtagText` is the renderer the post card was switched to, so these
// pin the two behaviours the fix depends on: `#POV` becomes a link to the route
// that already exists (`/hashtag/:tag`), and `@mention` keeps working. The card
// wiring itself is covered in postBodyHashtags.test.tsx; this is the component.
//
// Run: npx vitest run src/__tests__/mentionHashtagText.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MentionHashtagText } from '@/components/MentionHashtagText';

const renderText = (text: string) =>
  render(
    <MemoryRouter>
      <MentionHashtagText text={text} />
    </MemoryRouter>
  );

// `queryAllByRole`, not `getAllByRole`: several tests below assert that a
// string produces NO links, which is exactly the case that makes `getAll` throw.
const links = () => screen.queryAllByRole('link') as HTMLAnchorElement[];

describe('a hashtag in text becomes a link', () => {
  it('links "#POV" to the lowercased tag route', () => {
    renderText('Hello #POV');

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/hashtag/pov');
    // The visible label keeps the author's original casing; only the href is
    // lowercased, which is what the route and the stored `tag` column use.
    expect(link.textContent).toBe('#POV');
  });

  it('links every hashtag in a mixed sentence', () => {
    renderText('started #POV with #vlog and #POV again');

    expect(links().map(l => l.getAttribute('href'))).toEqual([
      '/hashtag/pov',
      '/hashtag/vlog',
      '/hashtag/pov',
    ]);
  });

  it('still links an @mention', () => {
    // The swap was MentionText -> MentionHashtagText, so the regression risk is
    // that @mentions break. They must not.
    renderText('hey @alice check #POV');

    const hrefs = links().map(l => l.getAttribute('href'));
    expect(hrefs).toContain('/profile/alice');
    expect(hrefs).toContain('/hashtag/pov');
  });

  it('links an @mention alone, exactly as before', () => {
    renderText('hey @alice');

    expect(links()).toHaveLength(1);
    expect(links()[0].getAttribute('href')).toBe('/profile/alice');
    expect(links()[0].textContent).toBe('@alice');
  });

  it('leaves text with no hashtag or mention as plain text', () => {
    const { container } = renderText('just a sentence');

    expect(links()).toHaveLength(0);
    expect(container.textContent).toBe('just a sentence');
  });

  it('keeps surrounding text, line breaks and spacing intact', () => {
    const content = 'first line\n  #POV  spaced\n\nlast @bob';
    const { container } = renderText(content);

    // The container's own text is the plain text; the anchors contribute their
    // text too, so the whole string must come back byte-for-byte.
    expect(container.textContent).toBe(content);
  });

  it('does not treat a bare # or a mid-word # as a hashtag', () => {
    // `/(\w+)/` needs at least one word character, so `#` alone and `a#b` are
    // not hashtags. `a#b` is genuinely ambiguous in every social app; this pins
    // the existing behaviour rather than endorsing it.
    const { container } = renderText('issue # and C# notes');

    expect(links()).toHaveLength(0);
    expect(container.textContent).toBe('issue # and C# notes');
  });

  it('applies the className it was given', () => {
    const { container } = render(
      <MemoryRouter>
        <MentionHashtagText text="Hello #POV" className="text-sm" />
      </MemoryRouter>
    );

    expect(container.firstElementChild?.getAttribute('class')).toBe('text-sm');
  });
});

describe('duplicate hashtags are not deduplicated by the renderer', () => {
  it('renders one link per occurrence', () => {
    // The renderer is not the place that dedupes — `extractHashtags` is, and it
    // de-dupes before a row is written. This test records that the two layers
    // are separate, so nobody "fixes" a duplicate-record bug by editing here.
    renderText('#POV and #POV');

    expect(links().map(l => l.getAttribute('href'))).toEqual([
      '/hashtag/pov',
      '/hashtag/pov',
    ]);
  });
});
