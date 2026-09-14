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
  onReact: (reactionKey: ReactionKey) => void;
  onLike: () => void;
}

const ReactionPicker = ({ isLiked, selectedReaction, likesCount, onDark = false, onReact, onLike }: ReactionPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredReaction, setHoveredReaction] = useState<ReactionKey | null>(null);

  const currentReaction = selectedReaction ? getReactionConfig(selectedReaction) : null;

  const handleReaction = (reactionKey: ReactionKey) => {
    onReact(reactionKey);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`flex items-center space-x-2 transition-colors ${
            isLiked || currentReaction 
              ? (currentReaction?.color || 'text-primary') + ' hover:opacity-80' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={(e) => {
            if (!isOpen) {
              onLike();
            }
          }}
          onMouseEnter={() => setIsOpen(true)}
        >
          <StaticReactionIcon 
            reactionKey={selectedReaction || null}
            size="sm"
            count={likesCount}
            isActive={isLiked || !!currentReaction}
            onDark={onDark}
          />
        </Button>
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
