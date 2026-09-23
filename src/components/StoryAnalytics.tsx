import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useStoryAnalytics } from '@/hooks/useStoryAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import StaticReactionIcon from '@/components/StaticReactionIcon';
import { getReactionConfig } from '@/lib/reactions';

interface StoryAnalyticsProps {
  storyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Owner-only analytics (do.md sections 4-6/10): total views (counted from the
// existing story_views tracking — a view counts even when the viewer never
// reacted) and total reactions with the EXACT reaction each user selected.
// Ordinary viewers are never shown this dialog (StoryViewer only renders it
// for the owner) and the Gateway refuses to serve the underlying rows to them.
const StoryAnalytics = ({ storyId, open, onOpenChange }: StoryAnalyticsProps) => {
  const { views, reactions, loading } = useStoryAnalytics(storyId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Story Analytics
          </DialogTitle>
        </DialogHeader>

        {/* Total views and total reactions — kept independent: views != reactions */}
        <div className="grid grid-cols-2 gap-3 pb-1">
          <div className="rounded-lg bg-muted p-3 text-center">
            <p className="text-2xl font-bold">{views.length}</p>
            <p className="text-xs text-muted-foreground">Views</p>
          </div>
          <div className="rounded-lg bg-muted p-3 text-center">
            <p className="text-2xl font-bold">{reactions.length}</p>
            <p className="text-xs text-muted-foreground">Reactions</p>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Reaction list: which user reacted + which reaction they selected */}
              <section>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Reactions ({reactions.length})
                </h4>
                {reactions.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>No reactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reactions.map((reaction) => (
                      <div
                        key={reaction.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={reaction.user?.profile_pic || undefined} />
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {reaction.user?.display_name?.[0]?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {reaction.user?.display_name || 'Unknown User'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(reaction.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {/* The exact reaction this user selected */}
                        {getReactionConfig(reaction.emoji) ? (
                          <StaticReactionIcon reactionKey={reaction.emoji} size="md" />
                        ) : (
                          <span className="text-2xl">{reaction.emoji}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* View list: everyone who watched, reacting or not */}
              <section>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Viewed by ({views.length})
                </h4>
                {views.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Eye className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No views yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {views.map((view) => (
                      <div
                        key={view.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={view.viewer?.profile_pic || undefined} />
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {view.viewer?.display_name?.[0]?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {view.viewer?.display_name || 'Unknown User'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(view.viewed_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StoryAnalytics;