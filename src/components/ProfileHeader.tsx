import { ReactNode, useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Camera, UserPlus, UserMinus, MessageCircle, Edit3, UserCheck, Clock, ChevronDown, MoreHorizontal, UserX, Flag, Link, Settings, Users, UserCheck2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PhotoUploadDialog from './PhotoUploadDialog';
import { usePhotoUpload } from '@/hooks/usePhotoUpload';
import EditBioDialog from './EditBioDialog';
import { useOtherNames } from '@/hooks/useOtherNames';
import CoverPhotoEditor from './cover/CoverPhotoEditor';
import { useFriendship } from '@/hooks/useFriendship';
import { useFollow } from '@/hooks/useFollow';
import { useBlocks } from '@/hooks/useBlocks';
import { ReportProfileDialog } from './ReportProfileDialog';
import { useProfileReports } from '@/hooks/useProfileReports';
import { useHasActiveStories } from '@/hooks/useHasActiveStories';
import BlockButton from './BlockButton';
import { MessageButton } from './MessageButton';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  profile_pic: string | null;
  cover_pic: string | null;
  cover_position_y?: number;
  created_at: string;
}

interface ProfileHeaderProps {
  profile: Profile;
  isOwnProfile: boolean;
  onProfileUpdate?: () => void;
  /**
   * 'person' (default) keeps the personal-profile header exactly as it is.
   * 'page' reuses the identical template for a Page, which supplies its own
   * cover editor, avatar editor and action buttons through the slots below
   * (page identity/actions differ, the visual template does not).
   */
  profileKind?: 'person' | 'page';
  /** Cover area. Defaults to the personal CoverPhotoEditor; pages pass their own. */
  cover?: ReactNode;
  /** Avatar edit control shown to the owner. Defaults to the photo upload dialog. */
  avatarEditor?: ReactNode;
  /** Action button cluster. Person builds its own; pages pass their own. */
  actions?: ReactNode;
  /** Replaces the `@username` line (pages show category/followers here). */
  subtitle?: ReactNode;
  /** Extra detail rows rendered after the joined date (pages show description etc.). */
  extraDetails?: ReactNode;
  /** Suppress the bio line. */
  hideBio?: boolean;
  /** Suppress the "Joined …" line. */
  hideJoined?: boolean;
  /** Suppress the owner "Edit bio" control. */
  hideEditBio?: boolean;
}

const ProfileHeader = ({ 
  profile, 
  isOwnProfile, 
  onProfileUpdate,
  profileKind = 'person',
  cover,
  avatarEditor,
  actions,
  subtitle,
  extraDetails,
  hideBio = false,
  hideJoined = false,
  hideEditBio = false,
}: ProfileHeaderProps) => {
  const isPage = profileKind === 'page';
  const { user } = useAuth();
  const { toast } = useToast();
  const { uploadPhoto, uploading } = usePhotoUpload();
  const { otherNames } = useOtherNames(profile.id);
  const { friendship, sendRequest, cancelRequest, acceptRequest, rejectRequest, unfriend } = useFriendship(profile.id, user?.id);
  const { followStatus, follow, unfollow } = useFollow(profile.id, user?.id);
  const { blockStatus, blockUser, unblockUser } = useBlocks(profile.id, user?.id);
  const { hasReported, refreshReportStatus } = useProfileReports(isOwnProfile ? undefined : profile.id);
  const hasActiveStories = useHasActiveStories(profile.id);

  // Filter other names that should show at top
  const topOtherNames = otherNames.filter(name => name.show_at_top);

  const handleSendFriendRequest = async () => {
    await sendRequest();
    followStatus.refetch();
  };

  const renderFriendshipButton = () => {
    if (isOwnProfile || blockStatus.isBlocked || blockStatus.isBlockedBy) return null;

    if (friendship.loading) {
      return <Button variant="outline" disabled>Loading...</Button>;
    }

    if (!friendship.status) {
      return (
        <Button onClick={handleSendFriendRequest}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Friend
        </Button>
      );
    }

    if (friendship.status === 'PENDING') {
      if (friendship.isSender) {
        return (
          <Button variant="outline" onClick={cancelRequest}>
            <Clock className="h-4 w-4 mr-2" />
            Cancel Request
          </Button>
        );
      } else {
        return (
          <div className="flex gap-2">
            <Button onClick={acceptRequest}>
              <UserCheck className="h-4 w-4 mr-2" />
              Accept
            </Button>
            <Button variant="outline" onClick={rejectRequest}>
              <UserX className="h-4 w-4 mr-2" />
              Decline
            </Button>
          </div>
        );
      }
    }

    if (friendship.status === 'ACCEPTED') {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <UserCheck className="h-4 w-4 mr-2" />
              Friends
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={unfriend}>
              <UserMinus className="h-4 w-4 mr-2" />
              Unfriend
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    if (friendship.status === 'REJECTED') {
      return (
        <Button onClick={handleSendFriendRequest}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Friend
        </Button>
      );
    }

    return null;
  };

  const renderFollowButton = () => {
    if (isOwnProfile || blockStatus.isBlocked || blockStatus.isBlockedBy) return null;

    if (followStatus.loading) {
      return <Button variant="outline" disabled>Loading...</Button>;
    }

    if (followStatus.isFollowing) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <UserCheck2 className="h-4 w-4 mr-2" />
              Following
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={unfollow}>
              <UserMinus className="h-4 w-4 mr-2" />
              Unfollow
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return (
      <Button variant="outline" onClick={follow}>
        <Users className="h-4 w-4 mr-2" />
        Follow
      </Button>
    );
  };

  const copyProfileLink = () => {
    const profileUrl = `${window.location.origin}/profile/${profile.username}`;
    navigator.clipboard.writeText(profileUrl);
    toast({
      title: 'Success',
      description: 'Profile link copied to clipboard'
    });
  };

  const handlePhotoUpload = async (file: File, type: 'profile' | 'cover', customText?: string) => {
    if (!user?.id) return;
    
    try {
      await uploadPhoto(file, type, user.id, customText);
      onProfileUpdate?.();
    } catch (error) {
      // Error is handled in the hook
    }
  };

  return (
    <div className="relative">
      {/* Cover Photo — the personal editor by default; a Page supplies its own
          cover editor through the `cover` slot so the template is shared. A
          Page must NEVER fall back to the personal editor: it writes the
          viewer's own `profiles.cover_pic` and posts a `cover_photo_update`
          authored by that user, which is how a Page change used to land on the
          owner's personal profile. */}
      {cover ?? (isPage ? null : (
        <CoverPhotoEditor
          profile={profile}
          isOwnProfile={isOwnProfile}
          onProfileUpdate={onProfileUpdate}
        />
      ))}

      {/* Profile Info */}
      <div className="relative px-6 pb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex flex-row items-start gap-4 min-w-0">
            {/* Avatar — the negative top margin lives on the avatar alone, so it
                keeps its overlap with the cover while the name block beside it
                starts under the cover's bottom edge instead of on top of it. */}
            <div className="relative flex-shrink-0 -mt-16 md:-mt-20">
              {!isPage && hasActiveStories ? (
                <div className="inline-flex p-[3px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 overflow-hidden">
                  <Avatar className="h-20 w-20 sm:h-24 sm:w-24 md:h-32 md:w-32 border-4 border-background ring-0">
                    <AvatarImage src={profile.profile_pic || ''} />
                    <AvatarFallback className="text-2xl sm:text-3xl md:text-4xl bg-muted">
                      {profile.display_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              ) : (
                <Avatar className="h-20 w-20 sm:h-24 sm:w-24 md:h-32 md:w-32 border-4 border-background shadow-lg">
                  <AvatarImage src={profile.profile_pic || ''} />
                  <AvatarFallback className="text-2xl sm:text-3xl md:text-4xl bg-muted">
                    {profile.display_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              {isOwnProfile && (
                avatarEditor !== undefined ? (
                  avatarEditor
                ) : isPage ? null : (
                  // Personal profiles only. On a Page a missing editor must
                  // render NOTHING rather than the personal upload dialog: that
                  // dialog writes the viewer's own `profiles.profile_pic` and
                  // creates a `profile_picture_update` authored by the viewer,
                  // which is how a Page avatar change used to publish to (and
                  // overwrite) the owner's personal profile.
                  <div className="absolute bottom-0 right-0">
                    <PhotoUploadDialog
                      type="profile"
                      onUpload={(file, text) => handlePhotoUpload(file, 'profile', text)}
                      isUploading={uploading}
                    >
                      <Button 
                        size="sm" 
                        className="rounded-full h-10 w-10 p-0"
                        disabled={uploading}
                      >
                        <Camera className="h-4 w-4" />
                      </Button>
                    </PhotoUploadDialog>
                  </div>
                )
              )}
            </div>

            {/* Name and profile information */}
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={`font-bold text-foreground ${(() => {
                  const words = profile.display_name.trim().split(/\s+/);
                  if (words.length === 1) return 'text-2xl md:text-3xl';
                  if (words.length === 2) return 'text-xl md:text-2xl';
                  return 'text-lg md:text-xl';
                })()}`}>{profile.display_name}</h1>
                {/* Other Names — inline beside the primary name (same horizontal
                    line), with no type/category label. The value comes straight
                    from the same `other_names` rows the other-names dialog reads
                    and edits; when nothing is flagged `show_at_top`, no separator
                    or blank space is rendered. `text-[11px]` below `sm` and the
                    separator sitting flush against the value (do.md's `•Badsi`)
                    keep the pair narrow enough to stay on the SAME line as the
                    name at phone widths; both step up from `sm` on. */}
                {!isPage && topOtherNames.length > 0 && (
                  <span className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] sm:text-sm font-normal text-muted-foreground">
                    {topOtherNames.map((otherName) => (
                      <span key={otherName.id} className="whitespace-nowrap">
                        {/* Separator between the primary name and the Other Name */}
                        <span aria-hidden="true" className="select-none">•</span>
                        {otherName.name}
                      </span>
                    ))}
                  </span>
                )}
                {!isPage && !isOwnProfile && friendship.status === 'ACCEPTED' && !blockStatus.isBlocked && !blockStatus.isBlockedBy && (
                  <Badge variant="secondary">Friends</Badge>
                )}
                {!isPage && !isOwnProfile && followStatus.isFollowing && !blockStatus.isBlocked && !blockStatus.isBlockedBy && (
                  <Badge variant="outline">Following</Badge>
                )}
                {!isPage && !isOwnProfile && blockStatus.isBlockedBy && (
                  <Badge variant="destructive">Blocked you</Badge>
                )}
                {!isPage && !isOwnProfile && blockStatus.isBlocked && (
                  <Badge variant="outline" className="text-muted-foreground">Blocked</Badge>
                )}
              </div>
              
              {subtitle ?? <p className="text-muted-foreground">@{profile.username}</p>}
              {!hideJoined && (
                <p className="text-xs text-muted-foreground">
                  Joined {new Date(profile.created_at).toLocaleDateString()}
                </p>
              )}
              {extraDetails}
            </div>
          </div>

          {/* Action Buttons — guests see public profile content only (do.md):
              no Add Friend / Follow / Message / Report / more-menu for an
              unauthenticated visitor; buttons are simply not rendered.
              A Page supplies its own action cluster through `actions`. */}
          <div className="flex flex-wrap gap-2 md:self-start">
            {actions !== undefined ? actions : (!isPage && !isOwnProfile && user && (
              <>
                {/* Friendship Button */}
                {renderFriendshipButton()}
                
                {/* Follow Button */}
                {renderFollowButton()}
                
                {/* Message Button - Hidden if blocked */}
                {!blockStatus.isBlocked && !blockStatus.isBlockedBy && (
                  <MessageButton 
                    targetUserId={profile.id}
                    targetUsername={profile.username}
                    targetDisplayName={profile.display_name}
                    disabled={blockStatus.isBlocked || blockStatus.isBlockedBy}
                  />
                )}

                {/* Report Button */}
                <ReportProfileDialog
                  reportedUserId={profile.id}
                  reportedUserName={profile.username}
                  isAlreadyReported={hasReported}
                  onReportSubmitted={refreshReportStatus}
                />

                {/* More Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-background border-border z-50">
                    <DropdownMenuItem onClick={copyProfileLink}>
                      <Link className="h-4 w-4 mr-2" />
                      Copy profile link
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {blockStatus.isBlocked ? (
                      <DropdownMenuItem onClick={unblockUser}>
                        <UserCheck className="h-4 w-4 mr-2" />
                        Unblock {profile.display_name}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem className="text-destructive" onClick={() => blockUser('full')}>
                        <UserX className="h-4 w-4 mr-2" />
                        Block {profile.display_name}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ))}
          </div>
        </div>

        {/* Bio — its own readable section under the avatar. The owner's edit
            pencil lives here beside the bio, not beside the primary name. */}
        {!hideBio && (profile.bio || (isOwnProfile && !hideEditBio)) && (
          <div className="mt-4 flex items-start gap-2">
            <p className="text-sm text-muted-foreground max-w-2xl whitespace-pre-wrap">
              {profile.bio || 'No bio yet.'}
            </p>
            {isOwnProfile && !hideEditBio && (
              <EditBioDialog
                currentBio={profile.bio}
                userId={profile.id}
                onBioUpdate={() => onProfileUpdate?.()}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileHeader;