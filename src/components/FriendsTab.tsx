import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown, UserPlus, Users, Heart, Settings, Lock, Eye, EyeOff } from 'lucide-react';
import { useFriendsList, type FriendUser } from '@/hooks/useFriendsList';
import { useAuth } from '@/hooks/useAuth';
import { VisibilitySelector, type Visibility } from '@/components/VisibilitySelector';
import { useProfile } from '@/hooks/useProfile';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface FriendsTabProps {
  profileId: string;
  isOwnProfile: boolean;
}

const FriendsTab = ({ profileId, isOwnProfile }: FriendsTabProps) => {
  const [activeSubTab, setActiveSubTab] = useState('friends');
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const { user } = useAuth();
  const { updateProfile } = useProfile();
  const {
    friends,
    following,
    followers,
    friendsCount,
    followingCount,
    followersCount,
    loading,
    unfollowUser,
    followUser,
    unfriendUser,
    blockUser,
    checkIfFollowing,
    canViewFriends,
    canViewFollowing,
    friendsVisibility,
    followingVisibility,
    refetch
  } = useFriendsList(profileId, isOwnProfile);

  const [followingStatuses, setFollowingStatuses] = useState<Record<string, boolean>>({});
  const [friendsVisibilityLocal, setFriendsVisibilityLocal] = useState<Visibility>((friendsVisibility as Visibility) || 'public');
  const [followingVisibilityLocal, setFollowingVisibilityLocal] = useState<boolean>(followingVisibility !== false);

  useEffect(() => {
    setFriendsVisibilityLocal((friendsVisibility as Visibility) || 'public');
    setFollowingVisibilityLocal(followingVisibility !== false);
  }, [friendsVisibility, followingVisibility]);

  const handlePrivacyUpdate = async (field: 'friends_visibility' | 'following_visibility', value: any) => {
    try {
      console.log('Updating privacy setting:', field, 'to:', value);
      
      if (field === 'friends_visibility') {
        setFriendsVisibilityLocal(value as Visibility);
        await updateProfile({ friends_visibility: value });
        console.log('Friends visibility updated successfully');
      }
      if (field === 'following_visibility') {
        setFollowingVisibilityLocal(!!value);
        await updateProfile({ following_visibility: !!value });
        console.log('Following visibility updated successfully');
      }
      
      // Refresh the data to reflect changes
      setTimeout(() => refetch(), 500);
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      // Revert local state on error
      if (field === 'friends_visibility') {
        setFriendsVisibilityLocal((friendsVisibility as Visibility) || 'public');
      }
      if (field === 'following_visibility') {
        setFollowingVisibilityLocal(followingVisibility !== false);
      }
    }
  };

  const PrivacySettings = () => (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Privacy Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-medium">Who can see your friends list</Label>
          <VisibilitySelector
            value={friendsVisibilityLocal}
            onChange={(value) => handlePrivacyUpdate('friends_visibility', value)}
            className="w-full"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Show following list</Label>
            <p className="text-xs text-muted-foreground">Allow others to see who you follow</p>
          </div>
          <Switch
            checked={followingVisibilityLocal}
            onCheckedChange={(checked) => handlePrivacyUpdate('following_visibility', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );

  const PrivacyPlaceholder = ({ type, icon: Icon }: { type: string; icon: any }) => (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 mx-auto bg-muted/50 rounded-full flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        This list is hidden
      </h3>
      <p className="text-muted-foreground">
        {type === 'friends' && 'This user has made their friends list hidden.'}
        {type === 'following' && 'This user has hidden their following list.'}
      </p>
    </div>
  );

  useEffect(() => {
    if (user && followers.length > 0) {
      // Check which followers the current user is already following
      const checkStatuses = async () => {
        const statuses: Record<string, boolean> = {};
        for (const follower of followers) {
          if (follower.id !== user.id) {
            statuses[follower.id] = await checkIfFollowing(follower.id);
          }
        }
        setFollowingStatuses(statuses);
      };
      checkStatuses();
    }
  }, [user, followers]);

  const handleFollowBack = async (userId: string) => {
    await followUser(userId);
    setFollowingStatuses(prev => ({ ...prev, [userId]: true }));
  };

  const handleUnfollow = async (userId: string) => {
    await unfollowUser(userId);
    setFollowingStatuses(prev => ({ ...prev, [userId]: false }));
  };

  const FriendCard = ({ friend, type }: { friend: FriendUser; type: 'friend' | 'following' | 'follower' }) => (
    <div className="flex items-center justify-between p-4 border-b border-border/50 last:border-b-0">
      <div className="flex items-center space-x-3">
        <Avatar className="h-12 w-12">
          <AvatarImage src={friend.profile_pic || ''} alt={friend.display_name} />
          <AvatarFallback>
            {friend.display_name?.charAt(0)?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div>
          <h3 className="font-semibold text-foreground">{friend.display_name}</h3>
          <p className="text-sm text-muted-foreground">@{friend.username}</p>
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        {type === 'friend' && isOwnProfile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4 mr-2" />
                Friends
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => unfriendUser(friend.id)}
              >
                Unfriend
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => blockUser(friend.id)}
              >
                Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        
        {type === 'following' && isOwnProfile && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUnfollow(friend.id)}
          >
            Unfollow
          </Button>
        )}
        
        {type === 'follower' && user && friend.id !== user.id && (
          followingStatuses[friend.id] ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleUnfollow(friend.id)}
            >
              Following
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => handleFollowBack(friend.id)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Follow back
            </Button>
          )
        )}
      </div>
    </div>
  );

  const EmptyState = ({ type, icon: Icon }: { type: string; icon: any }) => (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 mx-auto bg-muted/50 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        No {type} yet
      </h3>
      <p className="text-muted-foreground">
        {type === 'friends' && 'When you connect with people, they\'ll appear here.'}
        {type === 'following' && 'When you follow people, they\'ll appear here.'}
        {type === 'followers' && 'When people follow you, they\'ll appear here.'}
      </p>
    </div>
  );

  const LoadingSkeleton = () => (
    <div className="space-y-4 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-0">
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {isOwnProfile && (
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPrivacySettings(!showPrivacySettings)}
            className="mb-4"
          >
            <Settings className="h-4 w-4 mr-2" />
            Privacy Settings
          </Button>
          {showPrivacySettings && <PrivacySettings />}
        </div>
      )}
      
      <Card>
        <CardContent className="p-0">
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
            <TabsList className="grid w-full grid-cols-3 rounded-none border-b">
              <TabsTrigger value="friends" className="rounded-none">
                Friends ({friendsCount})
              </TabsTrigger>
              {(canViewFollowing || isOwnProfile) && (
                <TabsTrigger value="following" className="rounded-none">
                  Following ({followingCount})
                </TabsTrigger>
              )}
              <TabsTrigger value="followers" className="rounded-none">
                Followers ({followersCount})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="friends" className="mt-0">
              {canViewFriends ? (
                friends.length > 0 ? (
                  <div>
                    {friends.map((friend) => (
                      <FriendCard key={friend.id} friend={friend} type="friend" />
                    ))}
                  </div>
                ) : (
                  <EmptyState type="friends" icon={Users} />
                )
              ) : (
                <PrivacyPlaceholder type="friends" icon={Users} />
              )}
            </TabsContent>
            
            {(canViewFollowing || isOwnProfile) && (
              <TabsContent value="following" className="mt-0">
                {canViewFollowing ? (
                  following.length > 0 ? (
                    <div>
                      {following.map((friend) => (
                        <FriendCard key={friend.id} friend={friend} type="following" />
                      ))}
                    </div>
                  ) : (
                    <EmptyState type="following" icon={UserPlus} />
                  )
                ) : (
                  <PrivacyPlaceholder type="following" icon={UserPlus} />
                )}
              </TabsContent>
            )}
            
            <TabsContent value="followers" className="mt-0">
              {followers.length > 0 ? (
                <div>
                  {followers.map((friend) => (
                    <FriendCard key={friend.id} friend={friend} type="follower" />
                  ))}
                </div>
              ) : (
                <EmptyState type="followers" icon={Heart} />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default FriendsTab;