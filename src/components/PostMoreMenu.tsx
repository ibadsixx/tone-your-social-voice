import { useState } from 'react';
import { Bookmark, Link2, BellOff, BellRing, Flag, VolumeX, Trash2, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSavedPosts } from '@/hooks/useSavedPosts';
import { useMutedUsers } from '@/hooks/useMutedUsers';
import { usePostNotifications } from '@/hooks/usePostNotifications';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { postsApi } from '@/api';
import { EditPostDialog } from '@/components/EditPostDialog';
import { ReportPostDialog } from '@/components/ReportPostDialog';

/**
 * An entry this surface contributes to the shared menu.
 *
 * Used for the reel viewer's reel-only affordances (See less, Embed, …) so they
 * can join the shared menu without those actions being reimplemented — and
 * without the post menu growing items it never had.
 */
export interface PostMoreMenuExtraItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void | Promise<void>;
  destructive?: boolean;
  disabled?: boolean;
}

interface PostMoreMenuProps {
  postId: string;
  /** The post/reel's author. Drives the owner-only Edit / Delete entries. */
  postOwnerId: string;
  /** Display name used in the "Mute <name>" entry. */
  ownerDisplayName?: string | null;
  /**
   * The post's text. Passed to the edit dialog so opening it pre-fills the
   * existing content instead of proposing to replace it with nothing.
   */
  postContent?: string | null;
  /**
   * Replaces the default trigger. Lets a surface supply a button styled for its
   * own context (the feed card's ghost button, the reel viewer's overlay
   * circle) without the menu owning that presentation.
   */
  trigger?: React.ReactNode;
  /** Called after the owner deletes the post, so the surface can navigate away. */
  onDeleted?: () => void;
  extraItems?: PostMoreMenuExtraItem[];
}

/**
 * The post's options menu — one implementation, shared by every surface that
 * renders a post.
 *
 * This was extracted verbatim from `Post.tsx`, where it was inline JSX. The
 * reel viewer (`/reels/:id`) previously had its own menu (`ReelMoreMenu`) with a
 * different item set and, importantly, its own permission handling: it was not
 * gated on the viewer being signed in, and its `isPublic` flag was passed as a
 * hardcoded `true`, so a friends-only reel still offered Embed. Sharing this
 * component is what makes those checks identical rather than merely similar.
 *
 * Every permission rule here is the one the post menu already enforced:
 * Save and notification toggles require a session, Edit/Delete require
 * ownership, and Mute/Report require a session and a non-owner.
 */
const PostMoreMenu = ({
  postId,
  postOwnerId,
  ownerDisplayName,
  postContent,
  trigger,
  onDeleted,
  extraItems = [],
}: PostMoreMenuProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isSaved, isLoading: isSaveLoading, toggleSave } = useSavedPosts(postId);
  const { isMuted, isLoading: isMuteLoading, toggleMute } = useMutedUsers(postOwnerId);
  const { isEnabled: notificationsEnabled, isLoading: isNotifLoading, toggleNotifications } =
    usePostNotifications(postId);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);

  const isOwner = !!user && user.id === postOwnerId;

  const handleCopyLink = async () => {
    const postUrl = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(postUrl);
      toast({
        title: 'Link copied',
        description: 'Post link copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy link to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleDeletePost = async () => {
    try {
      const { error } = await postsApi.deletePost(postId);

      if (error) throw error;

      toast({
        title: 'Post deleted',
        description: 'Your post has been deleted successfully',
      });
      setShowDeleteDialog(false);
      onDeleted?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete post',
        variant: 'destructive',
      });
    }
  };

  const handlePostUpdated = () => {
    onDeleted?.();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link2 className="h-4 w-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {user && (
            <DropdownMenuItem onClick={toggleSave} disabled={isSaveLoading}>
              <Bookmark className="mr-2 h-4 w-4" />
              <span>{isSaved ? 'Unsave post' : 'Save post'}</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={handleCopyLink}>
            <Link2 className="mr-2 h-4 w-4" />
            <span>Copy link</span>
          </DropdownMenuItem>

          {user && (
            <DropdownMenuItem onClick={toggleNotifications} disabled={isNotifLoading}>
              {notificationsEnabled ? (
                <BellOff className="mr-2 h-4 w-4" />
              ) : (
                <BellRing className="mr-2 h-4 w-4" />
              )}
              <span>
                {notificationsEnabled ? 'Turn off notifications' : 'Turn on notifications'}
              </span>
            </DropdownMenuItem>
          )}

          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                <Edit3 className="mr-2 h-4 w-4" />
                <span>Edit post</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete post</span>
              </DropdownMenuItem>
            </>
          )}

          {!isOwner && user && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleMute} disabled={isMuteLoading}>
                <VolumeX className="mr-2 h-4 w-4" />
                <span>{isMuted ? 'Unmute' : 'Mute'} {ownerDisplayName || 'Unknown'}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setShowReportDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Flag className="mr-2 h-4 w-4" />
                <span>Report post</span>
              </DropdownMenuItem>
            </>
          )}

          {extraItems.length > 0 && <DropdownMenuSeparator />}

          {extraItems.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => void item.onSelect()}
              disabled={item.disabled}
              className={item.destructive ? 'text-destructive focus:text-destructive' : undefined}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Your post will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePost}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Post Dialog */}
      <EditPostDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        post={{ id: postId, content: postContent || '' }}
        onPostUpdated={handlePostUpdated}
      />

      {/* Report Post Dialog */}
      <ReportPostDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        postId={postId}
      />
    </>
  );
};

export default PostMoreMenu;
