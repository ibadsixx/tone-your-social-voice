import { STATIC_REACTION_ICONS, type ReactionKey } from '@/lib/reactions';

interface ReactionCount {
  key: ReactionKey;
  count: number;
}

interface ReactionsCounterProps {
  reactions: ReactionCount[];
  totalCount: number;
  maxIcons?: number;
  onClick?: () => void;
}

/**
 * The aggregate summary is intentionally independent of the rows currently in
 * memory.  The modal receives the post id and fetches only the authorized page
 * of users, so clicking this control never causes the feed to load every
 * reactor.
 */
const ReactionsCounter = ({
  reactions,
  totalCount,
  maxIcons = 3,
  onClick,
}: ReactionsCounterProps) => {
  if (totalCount <= 0) return null;

  // Sort by count descending and take top N.
  const topReactions = [...reactions]
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxIcons);

  const summary = (
    <>
      {/* Stacked reaction icons - Facebook style */}
      <div className="flex items-center">
        {topReactions.map((reaction, index) => (
          <div
            key={reaction.key}
            className="relative w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-background"
            style={{
              zIndex: topReactions.length - index,
              marginLeft: index === 0 ? 0 : -6,
            }}
          >
            <img
              src={STATIC_REACTION_ICONS[reaction.key]}
              alt=""
              className="w-5 h-5 object-contain"
              loading="lazy"
            />
          </div>
        ))}
      </div>

      {/* The count itself is the clickable target, including when a legacy
          reaction has no icon mapping. */}
      <span className="text-[13px] text-muted-foreground ml-1.5 leading-none">
        {totalCount}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex items-center">{summary}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center rounded-md text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`View people who reacted (${totalCount})`}
      title="View people who reacted"
    >
      {summary}
    </button>
  );
};

export default ReactionsCounter;
