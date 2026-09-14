import { memo } from 'react';
import { STATIC_REACTION_ICONS, getReactionConfig, type ReactionKey } from '@/lib/reactions';

interface StaticReactionIconProps {
  reactionKey: ReactionKey | string | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  count?: number;
  isActive?: boolean;
  onDark?: boolean;
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
}: StaticReactionIconProps) => {
  const config = reactionKey ? getReactionConfig(reactionKey) : null;
  
  // No reaction selected - show default 👌 (ok hand) icon
  if (!config) {
    return (
      <span className="flex items-center gap-1.5">
        <img
          src="/emoji/1f44c.png"
          alt="Like"
          className={`${imgSizes[size]} object-contain ${!isActive && !onDark ? 'grayscale opacity-60' : ''}`}
          loading="lazy"
          draggable={false}
        />
        {count !== undefined && count > 0 && (
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
