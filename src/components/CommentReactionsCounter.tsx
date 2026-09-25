import { STATIC_REACTION_ICONS, type ReactionKey, getReactionConfig } from '@/lib/reactions';

interface CommentReaction {
  id: string;
  user_id: string;
  emoji: string;
}

interface ReactionCount {
  key: ReactionKey;
  count: number;
}

interface CommentReactionsCounterProps {
  /** Only ever holds the *viewer's own* rows; never other reactors. */
  reactions?: CommentReaction[];
  /** Server-computed total, independent of the rows above. */
  reactionCount?: number;
  /** Server-computed per-type totals keyed by canonical or legacy value. */
  reactionTypes?: Record<string, number>;
  maxIcons?: number;
  onClick?: () => void;
}

// The comment_reactions.emoji column historically stored raw unicode emoji.
// Those rows must still render an icon and must still count toward the total.
const LEGACY_EMOJI_TO_KEY: Record<string, ReactionKey> = {
  '❤️': 'red_heart',
  '❤': 'red_heart',
  '👍': 'ok',
  '😆': 'laughing',
  '😮': 'astonished',
  '😢': 'cry',
  '😡': 'rage',
};

const toReactionKey = (raw: string): ReactionKey | null => {
  const legacy = LEGACY_EMOJI_TO_KEY[raw];
  if (legacy) return legacy;
  const config = getReactionConfig(raw);
  return config ? config.key : null;
};

const CommentReactionsCounter = ({
  reactions = [],
  reactionCount,
  reactionTypes,
  maxIcons = 3,
  onClick,
}: CommentReactionsCounterProps) => {
  // Prefer the server aggregate. Fall back to the viewer's own rows only when
  // no aggregate is available yet, so the control never shows a wrong total.
  const hasAggregate = typeof reactionCount === 'number' || !!reactionTypes;
  const totalCount = hasAggregate
    ? (reactionCount ?? Object.values(reactionTypes || {}).reduce((sum, n) => sum + (Number(n) || 0), 0))
    : reactions.length;

  if (totalCount <= 0) return null;

  const counts: Record<string, number> = {};
  if (hasAggregate) {
    for (const [rawType, count] of Object.entries(reactionTypes || {})) {
      const key = toReactionKey(rawType);
      if (!key) continue;
      counts[key] = (counts[key] || 0) + (Number(count) || 0);
    }
  } else {
    for (const reaction of reactions) {
      const key = toReactionKey(reaction.emoji);
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
  }

  // Convert to array and sort by count
  const topReactions: ReactionCount[] = Object.entries(counts)
    .map(([key, count]) => ({ key: key as ReactionKey, count }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxIcons);

  const summary = (
    <>
      {/* Stacked reaction icons */}
      <div className="flex items-center">
        {topReactions.map((reaction, index) => (
          <div
            key={reaction.key}
            className="relative w-[18px] h-[18px] rounded-full flex items-center justify-center ring-2 ring-background"
            style={{
              zIndex: topReactions.length - index,
              marginLeft: index === 0 ? 0 : -6,
            }}
          >
            <img
              src={STATIC_REACTION_ICONS[reaction.key]}
              alt=""
              className="w-[18px] h-[18px] object-contain"
              loading="lazy"
            />
          </div>
        ))}
      </div>

      {/* The count itself is the clickable target. It renders even when every
          reaction is a legacy/unknown value with no icon mapping. */}
      <span className="text-xs text-muted-foreground ml-1.5 leading-none">
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

export default CommentReactionsCounter;
