import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { motion, AnimatePresence } from 'framer-motion';
import { REACTIONS_LIST, STATIC_REACTION_ICONS, getReactionConfig, type ReactionKey } from '@/lib/reactions';
import StaticReactionIcon from '@/components/StaticReactionIcon';
import AnimatedWebP from '@/components/AnimatedWebP';

interface ReactionPickerProps {
  isLiked: boolean;
  selectedReaction?: ReactionKey | string | null;
  likesCount: number;
  onDark?: boolean;
  /**
   * How the trigger is drawn.
   *
   * `inline` is the post card's action row. `overlay` is the fullscreen viewer's
   * right-hand rail, where this button sits in a column beside Comment, Send,
   * Share and Save and has to be the same size as all of them.
   *
   * Only the trigger's presentation differs. The reaction state, the set of
   * reactions offered, and what choosing one does are identical in both — which
   * is why this is a variant of the one picker rather than a reel-only button.
   */
  variant?: 'inline' | 'overlay';
  onReact: (reactionKey: ReactionKey) => void;
  onLike: () => void;
}

/**
 * The rail's own measurements, so this component matches the buttons it sits
 * beside rather than the other way round. `w-12 h-12` circle over a `w-6 h-6`
 * glyph is what Comment, Send, Share, Save and More already use on `/reels/:id`
 * and in the explore viewer; do.md asks for this button to match them, not for
 * them to grow.
 */
const RAIL_TRIGGER =
  'flex flex-col items-center gap-1 transition-transform active:scale-90';
const RAIL_CIRCLE =
  'w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center';
const RAIL_COUNT = 'text-white text-xs font-semibold drop-shadow-lg';

const ReactionPicker = ({
  isLiked,
  selectedReaction,
  likesCount,
  onDark = false,
  variant = 'inline',
  onReact,
  onLike,
}: ReactionPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredReaction, setHoveredReaction] = useState<ReactionKey | null>(null);

  const currentReaction = selectedReaction ? getReactionConfig(selectedReaction) : null;
  const isActive = isLiked || !!currentReaction;

  const handleReaction = (reactionKey: ReactionKey) => {
    onReact(reactionKey);
    setIsOpen(false);
  };

  const openOnHover = { onMouseEnter: () => setIsOpen(true) };
  const reactIfClosed = {
    onClick: () => {
      if (!isOpen) onLike();
    },
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {variant === 'overlay' ? (
          <button
            type="button"
            aria-label="Like"
            className={RAIL_TRIGGER}
            {...reactIfClosed}
            {...openOnHover}
          >
            <span className={RAIL_CIRCLE}>
              <StaticReactionIcon
                reactionKey={selectedReaction || null}
                size="lg"
                isActive={isActive}
                onDark={onDark}
              />
            </span>
            <span className={RAIL_COUNT}>{likesCount > 0 ? likesCount.toLocaleString() : ''}</span>
          </button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={`flex items-center space-x-2 transition-colors ${
              isActive
                ? (currentReaction?.color || 'text-primary') + ' hover:opacity-80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            {...reactIfClosed}
            {...openOnHover}
          >
            <StaticReactionIcon
              reactionKey={selectedReaction || null}
              size="sm"
              count={likesCount}
              isActive={isActive}
              onDark={onDark}
            />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-2 bg-popover border border-border shadow-lg rounded-full"
        side="top"
        align="start"
        sideOffset={8}
        onMouseLeave={() => setIsOpen(false)}
      >
        <div className="flex items-center gap-1">
          <AnimatePresence mode="wait">
            {isOpen && REACTIONS_LIST.map((reaction, index) => (
              <motion.button
                key={reaction.key}
                initial={{ scale: 0, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0, y: 10 }}
                transition={{ 
                  delay: index * 0.03,
                  type: "spring",
                  stiffness: 500,
                  damping: 25
                }}
                whileHover={{ scale: 1.3, y: -8 }}
                onHoverStart={() => setHoveredReaction(reaction.key)}
                onHoverEnd={() => setHoveredReaction(null)}
                onClick={() => handleReaction(reaction.key)}
                className={`relative p-1 rounded-full hover:bg-accent transition-colors cursor-pointer ${
                  selectedReaction === reaction.key ? 'bg-accent' : ''
                }`}
                title={reaction.label}
              >
                <AnimatedWebP 
                  webpPath={reaction.webpPath}
                  fallbackPath={STATIC_REACTION_ICONS[reaction.key]}
                  size={36}
                  alt={reaction.label}
                />
                
                {/* Label tooltip on hover */}
                <AnimatePresence>
                  {hoveredReaction === reaction.key && (
                    <motion.span
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="absolute -top-7 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
                    >
                      {reaction.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ReactionPicker;
