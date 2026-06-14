import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
}

const ProfileHeader = ({ 
  profile, 
  isOwnProfile, 
  onProfileUpdate
}: ProfileHeaderProps) => {
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

  const formatNameType = (type: string) => {
    switch (type) {
      case 'birth_name':
        return 'Birth name';
      case 'married_name':
        return 'Married name';
      case 'nickname':
        return 'Nickname';
      case 'other':
        return 'Other';
      default:
        return type;
    }
  };

  const renderFriendshipButton = () => {
    if (isOwnProfile || blockStatus.isBlocked || blockStatus.isBlockedBy) return null;

    if (friendship.loading) {
      return <Button variant="outline" disabled>Loading...</Button>;
    }

    if (!friendship.status) {
      return (
        <Button onClick={sendRequest}>
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
        <Button onClick={sendRequest}>
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
      {/* Cover Photo */}
      <CoverPhotoEditor
        profile={profile}
        isOwnProfile={isOwnProfile}
        onProfileUpdate={onProfileUpdate}
      />

      {/* Profile Info */}
      <div className="relative px-6 pb-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between -mt-16 md:-mt-20">
          {/* Avatar */}
          <div className="relative mb-4 md:mb-0">
            {hasActiveStories ? (
              <div className="p-[3px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
                <Avatar className="h-32 w-32 border-4 border-background shadow-lg ring-0">
                  <AvatarImage src={profile.profile_pic || ''} />
                  <AvatarFallback className="text-4xl bg-muted">
                    {profile.display_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            ) : (
              <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
                <AvatarImage src={profile.profile_pic || ''} />
                <AvatarFallback className="text-4xl bg-muted">
                  {profile.display_name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            {isOwnProfile && (
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
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {isOwnProfile ? (
              <EditBioDialog
                currentBio={profile.bio}
                userId={profile.id}
                onBioUpdate={() => onProfileUpdate?.()}
              />
            ) : (
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
            )}
          </div>
        </div>

        {/* Profile Details */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold">{profile.display_name}</h1>
            {!isOwnProfile && friendship.status === 'ACCEPTED' && !blockStatus.isBlocked && !blockStatus.isBlockedBy && (
              <Badge variant="secondary">Friends</Badge>
            )}
            {!isOwnProfile && followStatus.isFollowing && !blockStatus.isBlocked && !blockStatus.isBlockedBy && (
              <Badge variant="outline">Following</Badge>
            )}
            {!isOwnProfile && blockStatus.isBlockedBy && (
              <Badge variant="destructive">Blocked you</Badge>
            )}
            {!isOwnProfile && blockStatus.isBlocked && (
              <Badge variant="outline" className="text-muted-foreground">Blocked</Badge>
            )}
          </div>
          
          {/* Other Names shown at top */}
          {topOtherNames.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {topOtherNames.map((otherName) => (
                <Badge key={otherName.id} variant="outline" className="text-xs">
                  {otherName.name} • {formatNameType(otherName.type)}
                </Badge>
              ))}
            </div>
          )}
          
          <p className="text-muted-foreground">@{profile.username}</p>
          {profile.bio && (
            <p className="text-sm max-w-2xl">{profile.bio}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Joined {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProfileHeader;