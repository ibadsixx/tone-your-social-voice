import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useStoryReactions } from '@/hooks/useStoryReactions';
import { motion, AnimatePresence } from 'framer-motion';
import { REACTIONS_LIST, STATIC_REACTION_ICONS, getReactionConfig, type ReactionKey } from '@/lib/reactions';
import AnimatedWebP from '@/components/AnimatedWebP';
import StaticReactionIcon from '@/components/StaticReactionIcon';

interface StoryReactionsProps {
  storyId: string;
}

const StoryReactions = ({ storyId }: StoryReactionsProps) => {
  const { reactions, loading, toggleReaction, getReactionCounts, getUserReactions } = useStoryReactions(storyId);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredReaction, setHoveredReaction] = useState<ReactionKey | null>(null);
  
  const reactionCounts = getReactionCounts();
  const userReactions = getUserReactions();
  // Mirror the Post ReactionPicker trigger: the button's visual state depends on
  // whether THIS viewer has a stored reaction for this story.
  const hasStoryReaction = userReactions.length > 0;
  const currentStoryReaction = userReactions[0]?.emoji || '';
  const activeReactionColor = getReactionConfig(currentStoryReaction)?.color || 'text-primary';

  const handleReaction = (reactionKey: ReactionKey) => {
    toggleReaction(reactionKey);
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Display reaction counts with static icons */}
      <div className="flex items-center gap-1 flex-wrap">
        {Object.entries(reactionCounts).slice(0, 3).map(([reactionKey, count]) => {
          const isUserReaction = userReactions.some(r => r.emoji === reactionKey);
          const iconPath = STATIC_REACTION_ICONS[reactionKey as ReactionKey];
          return (
            <Button
              key={reactionKey}
              variant={isUserReaction ? 'default' : 'secondary'}
              size="sm"
              className="h-8 px-2 text-sm"
              onClick={() => toggleReaction(reactionKey)}
              disabled={loading}
            >
              {iconPath ? (
                <img src={iconPath} alt="" className="w-4 h-4 mr-1 object-contain" />
              ) : (
                <span className="mr-1">{reactionKey}</span>
              )}
              <span className="text-xs">{count}</span>
            </Button>
          );
        })}
      </div>

      {/* Post-style reaction trigger — same visual state logic as Posts:
          gray/inactive ok-hand before reacting, active/colored reaction (the
          viewer's stored reaction) after reacting. Hover/click opens the
          animated picker; clicking the trigger quick-likes with 'ok'. */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`flex items-center space-x-2 transition-colors ${
              hasStoryReaction
                ? activeReactionColor + ' hover:opacity-80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              if (!isOpen) {
                toggleReaction('ok');
              }
            }}
            onMouseEnter={() => setIsOpen(true)}
            title="React to story"
          >
            <StaticReactionIcon
              reactionKey={currentStoryReaction || null}
              size="sm"
              count={reactions.length}
              isActive={hasStoryReaction}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-auto p-2 bg-popover border border-border shadow-lg rounded-full" 
          align="end"
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="flex items-center gap-1">
            <AnimatePresence mode="wait">
              {isOpen && REACTIONS_LIST.map((reaction, index) => {
                const isSelected = userReactions.some(r => r.emoji === reaction.key);
                return (
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
                      isSelected ? 'bg-accent' : ''
                    }`}
                    title={reaction.label}
                    disabled={loading}
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
                );
              })}
            </AnimatePresence>
          </div>
          
          {reactions.length > 0 && (
            <div className="mt-2 pt-2 border-t text-xs text-muted-foreground text-center">
              {reactions.length} reaction{reactions.length !== 1 ? 's' : ''}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default StoryReactions;
