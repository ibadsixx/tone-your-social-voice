import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { gateway } from '@/lib/gateway';
import type { ReactionContentType, ReactionUser, ReactionUsersPage } from '@/lib/gateway';
import {
  REACTIONS_LIST,
  STATIC_REACTION_ICONS,
  getReactionConfig,
} from '@/lib/reactions';

const ALL_REACTIONS = 'all';
const DEFAULT_PAGE_SIZE = 25;

export interface ReactionUsersModalProps {
  contentType: ReactionContentType;
  contentId: string;
  open?: boolean;
  /** Alias for open for callers that use the existing isOpen/onClose modal API. */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  initialType?: string | null;
  pageSize?: number;
}

type ReactionTab = {
  value: string;
  label: string;
  count: number;
  icon?: string;
};

const normalizeFilter = (value: string | null | undefined): string | null => {
  if (!value || value === ALL_REACTIONS) return null;
  return value;
};

const reactionLabel = (type: string): string => {
  const config = getReactionConfig(type);
  if (config) return config.label;
  return type.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
};

const reactionIcon = (type: string): string | undefined => {
  const config = getReactionConfig(type);
  return config ? STATIC_REACTION_ICONS[config.key] : undefined;
};

const requestKey = (
  contentType: ReactionContentType,
  contentId: string,
  type: string | null
): string => `${contentType}:${contentId}:${type || ALL_REACTIONS}`;

const mergeUsers = (current: ReactionUser[], incoming: ReactionUser[]): ReactionUser[] => {
  const seen = new Set(current.map(user => user.id));
  return [
    ...current,
    ...incoming.filter(user => {
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    }),
  ];
};

/**
 * Displays the authorized, paginated reaction-user projection for a post or
 * comment. Identity data is intentionally accepted only from the dedicated
 * Gateway reaction-user methods; no generic reaction-table read is used here.
 */
export const ReactionUsersModal = ({
  contentType,
  contentId,
  open,
  isOpen: isOpenProp,
  onOpenChange,
  onClose,
  initialType = null,
  pageSize: pageSizeProp = DEFAULT_PAGE_SIZE,
}: ReactionUsersModalProps) => {
  const isOpen = open ?? isOpenProp ?? false;
  const pageSize = Math.max(1, Math.min(100, Math.floor(pageSizeProp) || DEFAULT_PAGE_SIZE));

  const [activeType, setActiveType] = useState<string | null>(normalizeFilter(initialType));
  const [users, setUsers] = useState<ReactionUser[]>([]);
  const [page, setPage] = useState<ReactionUsersPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestGeneration = useRef(0);
  const requestInFlight = useRef(false);

  const clearData = useCallback(() => {
    setUsers([]);
    setPage(null);
    setError(null);
    setPermissionDenied(false);
    setHasMore(false);
    setNextOffset(null);
    setLoadedKey(null);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  const fetchPage = useCallback(
    async (type: string | null, offset: number, replace: boolean) => {
      const generation = ++requestGeneration.current;
      requestInFlight.current = true;

      if (replace) {
        setUsers([]);
        setPage(null);
        setLoadedKey(null);
        setHasMore(false);
        setNextOffset(null);
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const key = requestKey(contentType, contentId, type);
      const options = {
        includeUsers: true,
        limit: pageSize,
        offset,
        ...(type ? { type } : {}),
      };

      try {
        const result = await (contentType === 'post'
          ? gateway.postReactionUsers(contentId, options)
          : gateway.commentReactionUsers(contentId, options));

        // A newer request (filter change, close, or a different target) started
        // while this one was in flight; drop the stale response.
        if (generation !== requestGeneration.current) return;

        if (result.error || !result.data) {
          // In particular, never retain a previous page after a 403/404 or any
          // other failed authorization request.
          setUsers([]);
          setPage(null);
          setLoadedKey(null);
          setHasMore(false);
          setNextOffset(null);
          const status = result.error?.code;
          const denied = status === '403' || status === '404';
          setPermissionDenied(denied);
          setError(
            denied
              ? 'Reaction users are not available for this content.'
              : 'Unable to load reaction users right now.'
          );
          return;
        }

        setPermissionDenied(false);
        const data = result.data;
        const continuationOffset = data.next_offset ?? (
          data.has_more ? offset + data.users.length : null
        );
        const canContinue = data.has_more
          && continuationOffset !== null
          && continuationOffset > offset;

        setPage(data);
        setUsers(previous => replace ? data.users : mergeUsers(previous, data.users));
        setHasMore(canContinue);
        setNextOffset(canContinue ? continuationOffset : null);
        setLoadedKey(key);
      } catch {
        if (generation !== requestGeneration.current) return;
        setUsers([]);
        setPage(null);
        setLoadedKey(null);
        setHasMore(false);
        setNextOffset(null);
        setPermissionDenied(false);
        setError('Unable to load reaction users right now.');
      } finally {
        if (generation === requestGeneration.current) {
          setLoading(false);
          setLoadingMore(false);
          requestInFlight.current = false;
        }
      }
    },
    [contentId, contentType, pageSize]
  );

  // Reset immediately when the target, filter seed, or open state changes.
  // The generation guard also prevents a late response from a closed/target
  // that is no longer being viewed from becoming visible.
  useEffect(() => {
    if (!isOpen) {
      requestGeneration.current += 1;
      requestInFlight.current = false;
      clearData();
      return;
    }

    const filter = normalizeFilter(initialType);
    setActiveType(filter);
    void fetchPage(filter, 0, true);

    return () => {
      requestGeneration.current += 1;
      requestInFlight.current = false;
    };
  }, [clearData, contentId, contentType, fetchPage, initialType, isOpen]);

  const handleTypeChange = useCallback(
    (value: string) => {
      const filter = normalizeFilter(value);
      requestGeneration.current += 1;
      requestInFlight.current = false;
      setActiveType(filter);
      void fetchPage(filter, 0, true);
    },
    [fetchPage]
  );

  const loadMore = useCallback(() => {
    if (
      !isOpen
      || loading
      || loadingMore
      || !hasMore
      || nextOffset === null
      || requestInFlight.current
    ) {
      return;
    }
    void fetchPage(activeType, nextOffset, false);
  }, [activeType, fetchPage, hasMore, isOpen, loading, loadingMore, nextOffset]);

  useEffect(() => {
    if (!isOpen || !hasMore || loading || loadingMore || !sentinelRef.current) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) loadMore();
      },
      { rootMargin: '240px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isOpen, loadMore, loading, loadingMore, users.length]);

  const visibleKey = requestKey(contentType, contentId, activeType);
  const visiblePage = loadedKey === visibleKey ? page : null;
  const visibleUsers = loadedKey === visibleKey ? users : [];

  const tabs = useMemo<ReactionTab[]>(() => {
    const counts = visiblePage?.reaction_types || {};
    const typeEntries = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => {
        const leftIndex = REACTIONS_LIST.findIndex(reaction => reaction.key === left);
        const rightIndex = REACTIONS_LIST.findIndex(reaction => reaction.key === right);
        if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      });

    return [
      {
        value: ALL_REACTIONS,
        label: 'All',
        count: visiblePage?.reaction_count || 0,
      },
      ...typeEntries.map(([type, count]) => ({
        value: type,
        label: reactionLabel(type),
        count,
        icon: reactionIcon(type),
      })),
    ];
  }, [visiblePage]);

  const selectedCount = activeType
    ? visiblePage?.filtered_reaction_count || 0
    : visiblePage?.reaction_count || 0;
  const tabValue = visiblePage ? activeType || ALL_REACTIONS : ALL_REACTIONS;

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        requestGeneration.current += 1;
        requestInFlight.current = false;
        clearData();
      }

      if (onOpenChange) {
        onOpenChange(nextOpen);
      } else if (!nextOpen) {
        onClose?.();
      }
    },
    [clearData, onClose, onOpenChange]
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 px-5 pb-3 pt-5 pr-12">
          <DialogTitle>Reactions</DialogTitle>
          <DialogDescription>
            {visiblePage
              ? `${selectedCount} ${selectedCount === 1 ? 'reaction' : 'reactions'}`
              : 'People who reacted to this content'}
          </DialogDescription>
        </DialogHeader>

        <div className="border-y px-3 py-2">
          <Tabs value={tabValue} onValueChange={handleTypeChange}>
            <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
              {tabs.map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="shrink-0 gap-1.5 px-2.5 py-1.5 text-xs"
                  aria-label={`${tab.label}: ${tab.count}`}
                >
                  {tab.icon && (
                    <img
                      src={tab.icon}
                      alt=""
                      aria-hidden="true"
                      className="h-4 w-4 object-contain"
                      loading="lazy"
                    />
                  )}
                  <span>{tab.label}</span>
                  <span className="text-[11px] text-muted-foreground">{tab.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={tabValue} forceMount className="mt-0 min-h-0">
              <ScrollArea className="h-[min(55vh,28rem)]">
                <div className="space-y-1 p-3" aria-live="polite">
                  {error ? (
                    <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-4 text-center">
                      <p className="text-sm text-muted-foreground">{error}</p>
                      {/* A 403/404 is an authorization decision, not a transient
                          failure, so do not offer a retry that cannot succeed. */}
                      {!permissionDenied && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void fetchPage(activeType, 0, true)}
                        >
                          Try again
                        </Button>
                      )}
                    </div>
                  ) : loading && visibleUsers.length === 0 ? (
                    <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading reactions...
                    </div>
                  ) : visibleUsers.length === 0 ? (
                    <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                      No reactions to show.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {visibleUsers.map(user => {
                          const config = getReactionConfig(user.reaction_type);
                          const label = config?.label || reactionLabel(user.reaction_type);
                          const profilePath = `/profile/${encodeURIComponent(user.username)}`;

                          return (
                            <div
                              key={`${user.id}:${user.user_id}`}
                              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
                            >
                              <Link
                                to={profilePath}
                                className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                onClick={() => {
                                  if (!isOpen) return;
                                  handleDialogOpenChange(false);
                                }}
                              >
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={user.profile_pic || undefined} alt="" />
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {user.display_name.charAt(0) || user.username.charAt(0) || '?'}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-foreground">
                                    {user.display_name}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    @{user.username}
                                  </span>
                                </span>
                              </Link>
                              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" aria-label={`${label} reaction`}>
                                {config && (
                                  <img
                                    src={STATIC_REACTION_ICONS[config.key]}
                                    alt=""
                                    aria-hidden="true"
                                    className="h-4 w-4 object-contain"
                                    loading="lazy"
                                  />
                                )}
                                <span className="hidden sm:inline">{label}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div ref={sentinelRef} className="h-1" aria-hidden="true" />
                      {loadingMore && (
                        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground" role="status">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          Loading more...
                        </div>
                      )}
                      {hasMore && !loadingMore && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={loadMore}
                        >
                          Load more
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReactionUsersModal;
