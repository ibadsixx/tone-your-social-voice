import { useState, useEffect, useCallback, useRef } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  nextPostActionOrigin,
  subscribePostActions,
  writePostActions,
} from '@/lib/postActionCache';

/**
 * Whether the signed-in viewer has saved a post.
 *
 * A post can be rendered by two surfaces at once — the feed's `Post` card and
 * the fullscreen `/reels/:id` viewer — and both drive the *same*
 * `saved_posts` row through this one hook. They still each held their own
 * `useState`, so saving on one surface left the other showing the old bookmark
 * until it happened to remount, and nothing pushed a correction: the gateway's
 * `postgres_changes` shim stores callbacks without ever opening the stream.
 *
 * `isSaved` is tri-state on purpose. `null` means "not known yet", which is a
 * different fact from `false` ("known, not saved") and changes two decisions:
 * which value to display, and whether a toggle should save or unsave. A surface
 * that has not read yet defers to the shared cache
 * (`postActionCache`) so the two never disagree; once its own read resolves, the
 * server's answer is authoritative.
 */
export const useSavedPosts = (postId: string) => {
  const [isSaved, setIsSaved] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const userId = user?.id;

  const originRef = useRef<string>('');
  if (!originRef.current) originRef.current = nextPostActionOrigin('saved');

  /**
   * Bumped by anything that makes the current server answer out of date: a local
   * toggle, or a write arriving from the other surface.
   *
   * A read issued before a save and resolving after it would publish "not saved"
   * and undo the correction on both surfaces — and, because both surfaces now read
   * the shared value, they would agree on the wrong answer. Such a read is dropped
   * instead.
   */
  const writeSeqRef = useRef(0);

  /**
   * Version of the state this hook last published.
   *
   * Compared with the cache's version to decide what to display. Without it, the
   * surface that just saved would keep showing the other surface's older cached
   * "not saved" — pressing the bookmark and seeing nothing change until something
   * else moved.
   */
  const localVersionRef = useRef(0);

  /** Publish this hook's own settled state and remember its order. */
  const publishLocal = (saved: boolean) => {
    localVersionRef.current = writePostActions(
      userId,
      postId,
      { isSaved: saved },
      originRef.current
    );
  };

  /** The other surface's settled answer for this (viewer, post) pair. */
  const [peer, setPeer] = useState<{ version: number; isSaved: boolean | null } | null>(null);

  useEffect(() => {
    if (!postId) return;
    let seenVersion = -1;
    return subscribePostActions(userId, postId, originRef.current, (state) => {
      // The saved group's order only. A reaction or comment write is not news
      // about this bookmark, and counting it as one would drop a perfectly good
      // in-flight read.
      const version = state.versions.saved;
      if (version !== seenVersion) {
        seenVersion = version;
        writeSeqRef.current += 1;
      }
      setPeer(prev =>
        prev && prev.version === version && prev.isSaved === state.isSaved
          ? prev
          : { version, isSaved: state.isSaved }
      );
    });
  }, [userId, postId]);

  // A sign-out must not leave the previous account's bookmark on screen.
  useEffect(() => {
    if (!user) {
      setIsSaved(null);
      setPeer(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !postId) return;

    let cancelled = false;
    const seqAtStart = writeSeqRef.current;

    const checkIfSaved = async () => {
      try {
        const { data, error } = await gateway
          .from('saved_posts')
          .select('id')
          .eq('user_id', user.id)
          .eq('post_id', postId)
          .maybeSingle();

        if (error) throw error;
        if (cancelled) return;
        // A save or unsave landed while this read was in flight, so its answer
        // describes the past. Publishing it would show both surfaces a bookmark
        // that contradicts what the user just did.
        if (writeSeqRef.current !== seqAtStart) return;
        setIsSaved(!!data);
        publishLocal(!!data);
      } catch (error) {
        console.error('Error checking saved status:', error);
      }
    };

    void checkIfSaved();

    return () => {
      cancelled = true;
    };
  }, [userId, postId, user]);

  /**
   * Whichever of the two states is newer, for the same reason as the reaction
   * hook: both surfaces must show the same bookmark, and a hook that has fallen
   * behind its own newer write is how they stop agreeing.
   */
  const usePeerState = peer !== null && peer.version > localVersionRef.current;
  const settled = usePeerState ? peer!.isSaved : isSaved;

  const toggleSave = useCallback(async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to save posts",
        variant: "destructive"
      });
      return;
    }

    // Resolve through the same value that is displayed, so a toggle on a surface
    // that only holds the cached state still *unsaves* rather than writing a
    // second `saved_posts` row for the same (user, post) pair.
    const currentlySaved = (usePeerState ? peer!.isSaved : isSaved) ?? false;

    // Any read in flight now describes the pre-toggle state.
    writeSeqRef.current += 1;

    setIsLoading(true);
    try {
      if (currentlySaved) {
        const { error } = await gateway
          .from('saved_posts')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId);

        if (error) throw error;

        setIsSaved(false);
        publishLocal(false);
        toast({
          title: "Post unsaved",
          description: "Post removed from your saved items"
        });
      } else {
        const { error } = await gateway
          .from('saved_posts')
          .insert({
            user_id: user.id,
            post_id: postId
          });

        if (error) throw error;

        setIsSaved(true);
        publishLocal(true);
        toast({
          title: "Post saved",
          description: "Post added to your saved items"
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save post",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, isSaved, usePeerState, peer, postId, userId, toast]);

  return {
    isSaved: settled ?? false,
    isLoading,
    toggleSave,
  };
};
