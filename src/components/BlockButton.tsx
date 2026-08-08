import { useState } from 'react';
import { useBlocks } from '@/hooks/useBlocks';
import { useAuth } from '@/hooks/useAuth';
import { blockingApi } from '@/api';
import { Button } from '@/components/ui/button';
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
import { UserX, Shield, MessageSquareOff, EyeOff, VolumeX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BlockButtonProps {
  profileId: string;
  username: string;
  displayName: string;
}

const BlockButton = ({ profileId, username, displayName }: BlockButtonProps) => {
  const { user } = useAuth();
  const { blockStatus, blockUser, unblockUser } = useBlocks(profileId, user?.id);
  const { toast } = useToast();
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showRestrictDialog, setShowRestrictDialog] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [restrictLoading, setRestrictLoading] = useState(false);

  // Check restriction status on mount
  useState(() => {
    if (!user?.id || !profileId) return;
    blockingApi.isRestricted(user.id, profileId).then(isRestricted => {
      if (isRestricted) setIsRestricted(true);
    });
  });

  if (!user || user.id === profileId) return null;

  const handleBlock = async () => {
    await blockUser();
    setShowBlockDialog(false);
  };

  const handleUnblock = async () => {
    await unblockUser();
    setShowBlockDialog(false);
  };

  const handleRestrict = async () => {
    if (!user?.id) return;
    setRestrictLoading(true);
    try {
      const { error } = await blockingApi.restrictUser(user.id, profileId);
      if (error) throw error;
      setIsRestricted(true);
      toast({ title: 'User restricted', description: `${displayName} has been restricted.` });
    } catch (error: any) {
      if (error?.code === '23505') {
        setIsRestricted(true);
        toast({ title: 'Already restricted', description: `${displayName} is already restricted.` });
      } else {
        toast({ title: 'Error', description: 'Failed to restrict user.', variant: 'destructive' });
      }
    } finally {
      setRestrictLoading(false);
      setShowRestrictDialog(false);
    }
  };

  const handleUnrestrict = async () => {
    if (!user?.id) return;
    setRestrictLoading(true);
    try {
      const { error } = await blockingApi.unrestrictUser(user.id, profileId);
      if (error) throw error;
      setIsRestricted(false);
      toast({ title: 'Restriction removed', description: `${displayName} is no longer restricted.` });
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to remove restriction.', variant: 'destructive' });
    } finally {
      setRestrictLoading(false);
      setShowRestrictDialog(false);
    }
  };

  if (blockStatus.loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Shield className="h-4 w-4 mr-2" />
        Loading...
      </Button>
    );
  }

  // If already blocked, show unblock
  if (blockStatus.isBlocked) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive border-destructive/20 hover:bg-destructive/10"
          onClick={() => setShowBlockDialog(true)}
        >
          <UserX className="h-4 w-4 mr-2" />
          Unblock
        </Button>
        <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unblock {displayName}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will allow @{username} to see your profile, posts, and interact with you again.
                They will not be notified that you unblocked them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleUnblock} className="bg-primary hover:bg-primary/90">
                Unblock User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      <div className="w-full space-y-1">
        <button
          onClick={() => setShowRestrictDialog(true)}
          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
        >
          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-muted shrink-0">
            <Shield className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground">
              {isRestricted ? 'Remove restriction' : 'Limit interactions'}
            </span>
            <span className="text-xs text-muted-foreground">
              {isRestricted ? 'Allow full interactions again' : 'Restrict messages & comments from this person'}
            </span>
          </div>
        </button>
        <button
          onClick={() => setShowBlockDialog(true)}
          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
        >
          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-muted shrink-0">
            <UserX className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground">Block</span>
            <span className="text-xs text-muted-foreground">
              Prevent all interactions with this person
            </span>
          </div>
        </button>
      </div>

      {/* Limit Interactions Dialog */}
      <AlertDialog open={showRestrictDialog} onOpenChange={setShowRestrictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRestricted ? `Remove restriction on ${displayName}?` : 'Limit interactions'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {isRestricted ? (
                <p>This will restore full interactions with @{username}. They will not be notified.</p>
              ) : (
                <div className="space-y-3">
                  <p>When you restrict @{username}:</p>
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-start gap-3">
                      <MessageSquareOff className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                      <span>Their messages will be moved to message requests — you won't be notified</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <EyeOff className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                      <span>They won't see when you're active or when you've read their messages</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <VolumeX className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                      <span>Their comments on your posts will only be visible to them</span>
                    </li>
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    {displayName} won't be notified that you've restricted them.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={isRestricted ? handleUnrestrict : handleRestrict}
              disabled={restrictLoading}
              className={isRestricted ? 'bg-primary hover:bg-primary/90' : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'}
            >
              {restrictLoading ? 'Processing...' : isRestricted ? 'Remove Restriction' : 'Restrict'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block Dialog */}
      <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {displayName}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>When you block @{username}, they will no longer be able to:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>See your profile or find it in search</li>
                  <li>View your posts, comments, or reactions</li>
                  <li>Send you messages or friend requests</li>
                  <li>Tag you in posts or comments</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  They will not be notified that you blocked them.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBlock}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Block User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BlockButton;
