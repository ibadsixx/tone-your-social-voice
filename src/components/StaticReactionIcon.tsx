import { memo } from 'react';
import { STATIC_REACTION_ICONS, getReactionConfig, type ReactionKey } from '@/lib/reactions';

interface StaticReactionIconProps {
  reactionKey: ReactionKey | string | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  count?: number;
  isActive?: boolean;
  onDark?: boolean;
  showZero?: boolean;
}

const imgSizes = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

// Static reaction icon component - no Lottie, just emoji/icon
const StaticReactionIcon = memo(({ 
  reactionKey, 
  size = 'md',
  showLabel = false,
  count,
  isActive = false,
  onDark = false,
  showZero = false,
}: StaticReactionIconProps) => {
  const config = reactionKey ? getReactionConfig(reactionKey) : null;
  const showCount = count !== undefined && (count > 0 || showZero);

  /**
   * The unselected state's appearance.
   *
   * `/emoji/1f44c.png` is a *yellow* hand, so "not selected" has to be painted
   * on or it reads as a selection. Whether it is painted depended on `onDark`,
   * which is a statement about the background, not about the viewer: on the
   * fullscreen reel viewer (`onDark`) the unselected hand therefore rendered
   * yellow — the same reaction, two different colours, on two surfaces of the
   * same post. Grayscale is legible on a dark background, so it is applied
   * regardless; only the extra fade stays light-background-only, since on a dark
   * overlay it would leave this icon dimmer than the white icons beside it.
   */
  const unselectedClass = isActive ? '' : onDark ? 'grayscale' : 'grayscale opacity-60';
  
  // No reaction selected - show default 👌 (ok hand) icon
  if (!config) {
    return (
      <span className="flex items-center gap-1.5">
        <img
          src="/emoji/1f44c.png"
          alt="Like"
          className={`${imgSizes[size]} object-contain ${unselectedClass}`}
          loading="lazy"
          draggable={false}
        />
        {showCount && (
          <span className={`text-xs ${isActive ? 'text-primary' : onDark ? 'text-white' : 'text-muted-foreground'}`}>
            {count}
          </span>
        )}
      </span>
    );
  }

  const iconPath = STATIC_REACTION_ICONS[config.key];

  return (
    <span className="flex items-center gap-1.5">
      <img
        src={iconPath}
        alt={config.label}
        className={`${imgSizes[size]} object-contain`}
        loading="lazy"
        draggable={false}
      />
      {showLabel && (
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span className={`text-xs ${config.color}`}>
          {count}
        </span>
      )}
    </span>
  );
});

StaticReactionIcon.displayName = 'StaticReactionIcon';

export default StaticReactionIcon;
