import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getPoll, vote, PollData } from '@/hooks/useChannelPolls';
import { supabase } from '@/integrations/supabase/client';
import { Check, BarChart3 } from 'lucide-react';

interface PollMessageProps {
  messageId: string;
  currentUserId: string;
}

export const PollMessage: React.FC<PollMessageProps> = ({ messageId, currentUserId }) => {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [voting, setVoting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPoll(messageId).then(setPoll);
  }, [messageId]);

  // Real-time subscription to poll vote changes
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!poll?.poll_id) return;

    const channel = supabase
      .channel(`poll-votes-${poll.poll_id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'message_poll_votes', filter: `poll_id=eq.${poll.poll_id}` },
        () => { getPoll(messageId).then(setPoll); }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [poll?.poll_id, messageId]);

  const handleVote = async (optionIndex: number) => {
    if (!poll || poll.user_vote !== null) return;
    setVoting(optionIndex);
    setError(null);
    const success = await vote(poll.poll_id, optionIndex);
    if (success) {
      getPoll(messageId).then(setPoll);
    } else {
      setError('Failed to vote. Try again.');
    }
    setVoting(null);
  };

  if (!poll) {
    return (
      <div className="mt-1 p-3 rounded-lg bg-muted/30 animate-pulse">
        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
        <div className="h-8 bg-muted rounded mb-1" />
        <div className="h-8 bg-muted rounded mb-1" />
        <div className="h-8 bg-muted rounded" />
      </div>
    );
  }

  const hasVoted = poll.user_vote !== null;

  return (
    <div className="mt-1.5 p-3 rounded-lg bg-muted/40 border border-border/50">
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 className="h-4 w-4 text-orange-500" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Poll</span>
      </div>

      <p className="text-sm font-medium mb-2.5">{poll.question}</p>

      <div className="space-y-1.5">
        {poll.options.map((option, index) => {
          const count = poll.vote_counts[index] || 0;
          const percentage = poll.total_votes > 0 ? Math.round((count / poll.total_votes) * 100) : 0;
          const isSelected = poll.user_vote === index;

          return (
            <button
              key={index}
              onClick={() => handleVote(index)}
              disabled={hasVoted || voting === index}
              className={cn(
                "relative w-full text-left px-3 py-2 rounded-md text-sm transition-all overflow-hidden",
                hasVoted
                  ? "cursor-default"
                  : "cursor-pointer hover:bg-accent",
                isSelected
                  ? "bg-primary/15 border border-primary/30"
                  : "bg-muted border border-border hover:border-primary/30"
              )}
            >
              {/* Vote progress bar */}
              {hasVoted && (
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-md transition-all duration-500",
                    isSelected ? "bg-primary/10" : "bg-muted-foreground/5"
                  )}
                  style={{ width: `${percentage}%` }}
                />
              )}

              <div className="relative flex items-center justify-between">
                <span className={cn("font-medium", isSelected && "text-primary")}>
                  {option}
                </span>
                <div className="flex items-center gap-1.5">
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                  {hasVoted && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {count} ({percentage}%)
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-muted-foreground">
          {poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}
          {hasVoted && ' · You voted'}
        </p>
        {!hasVoted && (
          <p className="text-[10px] text-muted-foreground/60">Tap to vote</p>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  );
};
