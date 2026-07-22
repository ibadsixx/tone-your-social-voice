import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface FriendUser {
  id: string;
  display_name: string;
  username: string;
  profile_pic: string | null;
  created_at: string;
}

export interface FriendsData {
  friends: FriendUser[];
  following: FriendUser[];
  followers: FriendUser[];
  friendsCount: number;
  followingCount: number;
  followersCount: number;
  canViewFriends: boolean;
  canViewFollowing: boolean;
  friendsVisibility: string;
  followingVisibility: boolean;
}

export const useFriendsList = (profileId: string, isOwnProfile: boolean) => {
  const [data, setData] = useState<FriendsData>({
    friends: [],
    following: [],
    followers: [],
    friendsCount: 0,
    followingCount: 0,
    followersCount: 0,
    canViewFriends: false,
    canViewFollowing: false,
    friendsVisibility: 'public',
    followingVisibility: true,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchFriends = async () => {
    try {
      // First get the friendship records
      const { data: friendsData, error } = await gateway
        .from('friends')
        .select('created_at, requester_id, receiver_id')
        .or(`requester_id.eq.${profileId},receiver_id.eq.${profileId}`)
        .eq('status', 'accepted');

      if (error) throw error;

      if (!friendsData || friendsData.length === 0) {
        return [];
      }

      // Get the friend IDs (the other person in each friendship)
      const friendIds = friendsData.map((friendship: any) => {
        return friendship.requester_id === profileId 
          ? friendship.receiver_id 
          : friendship.requester_id;
      });

      // Fetch the profiles for all friends
      const { data: profilesData, error: profilesError } = await gateway
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', friendIds);

      if (profilesError) throw profilesError;

      // Combine the data
      const friends = friendsData.map((friendship: any) => {
        const friendId = friendship.requester_id === profileId 
          ? friendship.receiver_id 
          : friendship.requester_id;
        
        const friendProfile = profilesData?.find(profile => profile.id === friendId);
        
        return {
          id: friendProfile?.id || friendId,
          display_name: friendProfile?.display_name || 'Unknown User',
          username: friendProfile?.username || 'unknown',
          profile_pic: friendProfile?.profile_pic || null,
          created_at: friendship.created_at
        };
      }).filter(friend => friend.id !== profileId); // Ensure we don't include the user themselves

      return friends;
    } catch (error: any) {
      console.error('Error fetching friends:', error);
      return [];
    }
  };

  const fetchFollowing = async () => {
    try {
      console.log('Fetching following for profile:', profileId);
      // Get following records from followers table (standardized)
      const { data: followingData, error } = await gateway
        .from('followers')
        .select('created_at, following_id')
        .eq('follower_id', profileId);

      if (error) throw error;
      console.log('Following data:', followingData);

      if (!followingData || followingData.length === 0) {
        return [];
      }

      // Get profile data for followed users
      const followingIds = followingData.map(follow => follow.following_id);
      const { data: profilesData, error: profilesError } = await gateway
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', followingIds);

      if (profilesError) throw profilesError;

      const following = followingData.map((follow: any) => {
        const profile = profilesData?.find(p => p.id === follow.following_id);
        return {
          id: profile?.id || follow.following_id,
          display_name: profile?.display_name || 'Unknown User',
          username: profile?.username || 'unknown',
          profile_pic: profile?.profile_pic || null,
          created_at: follow.created_at
        };
      }) || [];

      return following;
    } catch (error: any) {
      console.error('Error fetching following:', error);
      return [];
    }
  };

  const fetchFollowers = async () => {
    try {
      console.log('Fetching followers for profile:', profileId);
      // Get follower records from followers table (standardized)
      const { data: followersData, error } = await gateway
        .from('followers')
        .select('created_at, follower_id')
        .eq('following_id', profileId);

      if (error) throw error;
      console.log('Followers data:', followersData);

      if (!followersData || followersData.length === 0) {
        return [];
      }

      // Get profile data for followers
      const followerIds = followersData.map(follow => follow.follower_id);
      const { data: profilesData, error: profilesError } = await gateway
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', followerIds);

      if (profilesError) throw profilesError;

      const followers = followersData.map((follow: any) => {
        const profile = profilesData?.find(p => p.id === follow.follower_id);
        return {
          id: profile?.id || follow.follower_id,
          display_name: profile?.display_name || 'Unknown User',
          username: profile?.username || 'unknown',
          profile_pic: profile?.profile_pic || null,
          created_at: follow.created_at
        };
      }) || [];

      return followers;
    } catch (error: any) {
      console.error('Error fetching followers:', error);
      return [];
    }
  };

  const checkPrivacySettings = async () => {
    try {
      // Get the profile's privacy settings
      const { data: profileData, error } = await gateway
        .from('profiles')
        .select('friends_visibility, following_visibility')
        .eq('id', profileId)
        .maybeSingle();

      if (error) throw error;

      const friendsVisibility = profileData?.friends_visibility || 'public';
      const followingVisibility = profileData?.following_visibility ?? true;

      // Determine if current user can view friends list
      let canViewFriends = false;
      if (isOwnProfile) {
        canViewFriends = true;
      } else {
        if (friendsVisibility === 'public') {
          canViewFriends = true;
        } else if (friendsVisibility === 'friends' && user) {
          // Check if viewer is friends with profile owner
          const { data: friendshipData } = await gateway
            .from('friends')
            .select('id')
            .or(`and(requester_id.eq.${user.id},receiver_id.eq.${profileId}),and(requester_id.eq.${profileId},receiver_id.eq.${user.id})`)
            .eq('status', 'accepted')
            .maybeSingle();
          canViewFriends = !!friendshipData;
        } else if (friendsVisibility === 'only_me' || friendsVisibility === 'private') {
          canViewFriends = false;
        }
      }

      // Determine if current user can view following list
      const canViewFollowing = isOwnProfile || followingVisibility;

      return {
        canViewFriends,
        canViewFollowing,
        friendsVisibility,
        followingVisibility
      };
    } catch (error) {
      console.error('Error checking privacy settings:', error);
      return {
        canViewFriends: isOwnProfile,
        canViewFollowing: isOwnProfile,
        friendsVisibility: 'public',
        followingVisibility: true
      };
    }
  };

  const fetchAllData = async () => {
    if (!profileId) {
      console.log('No profileId provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('Fetching data for profile:', profileId);
      
      const privacySettings = await checkPrivacySettings();
      
      const [friends, following, followers] = await Promise.all([
        privacySettings.canViewFriends ? fetchFriends() : [],
        privacySettings.canViewFollowing ? fetchFollowing() : [],
        fetchFollowers() // Followers are always visible
      ]);

      console.log('Fetched data:', { 
        friends: friends.length, 
        following: following.length, 
        followers: followers.length 
      });

      setData({
        friends,
        following,
        followers,
        friendsCount: friends.length,
        followingCount: following.length,
        followersCount: followers.length,
        canViewFriends: privacySettings.canViewFriends,
        canViewFollowing: privacySettings.canViewFollowing,
        friendsVisibility: privacySettings.friendsVisibility,
        followingVisibility: privacySettings.followingVisibility,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load friends data',
        variant: 'destructive'
      });
      console.error('Error fetching friends data:', error);
    } finally {
      setLoading(false);
    }
  };

  const unfollowUser = async (userId: string) => {
    if (!user) return;

    try {
      const { error } = await gateway
        .from('followers')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Unfollowed successfully'
      });

      // Refresh data
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to unfollow user',
        variant: 'destructive'
      });
    }
  };

  const followUser = async (userId: string) => {
    if (!user) return;

    try {
      const { error } = await gateway
        .from('followers')
        .insert({
          follower_id: user.id,
          following_id: userId
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Now following user'
      });

      // Refresh data
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to follow user',
        variant: 'destructive'
      });
    }
  };

  const unfriendUser = async (userId: string) => {
    if (!user) return;

    try {
      const { error } = await gateway
        .from('friends')
        .delete()
        .or(`and(requester_id.eq.${user.id},receiver_id.eq.${userId}),and(requester_id.eq.${userId},receiver_id.eq.${user.id})`)
        .eq('status', 'accepted');

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Friend removed successfully'
      });

      // Refresh data
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to remove friend',
        variant: 'destructive'
      });
    }
  };

  const blockUser = async (userId: string) => {
    if (!user) return;

    try {
      // First remove any existing friendship
      await unfriendUser(userId);
      
      // Then block via RPC (uses blocks table)
      const { error } = await gateway.rpc('block_user', {
        p_blocker: user.id,
        p_blocked: userId,
        p_block_type: 'full'
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User blocked successfully'
      });

      // Refresh data
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to block user',
        variant: 'destructive'
      });
    }
  };

  const checkIfFollowing = async (userId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await gateway
        .from('followers')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', userId)
        .maybeSingle();

      return !!data;
    } catch (error) {
      return false;
    }
  };

  // Set up real-time subscriptions
  useEffect(() => {
    fetchAllData();

    // Subscribe to changes in friends table
    const friendsChannel = gateway
      .channel('friends-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friends',
          filter: `or(requester_id.eq.${profileId},receiver_id.eq.${profileId})`
        },
        () => {
          fetchAllData();
        }
      )
      .subscribe();

    // Subscribe to changes in followers table
    const followersChannel = gateway
      .channel('followers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'followers',
          filter: `or(follower_id.eq.${profileId},following_id.eq.${profileId})`
        },
        () => {
          fetchAllData();
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(friendsChannel);
      gateway.removeChannel(followersChannel);
    };
  }, [profileId]);

  return {
    ...data,
    loading,
    refetch: fetchAllData,
    unfollowUser,
    followUser,
    unfriendUser,
    blockUser,
    checkIfFollowing
  };
};