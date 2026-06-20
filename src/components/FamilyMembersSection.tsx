import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { VisibilitySelector, Visibility } from '@/components/VisibilitySelector';
import { useToast } from '@/hooks/use-toast';
import { useFriends } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
import { Plus, X, Edit, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Friend {
  id: string;
  display_name: string;
  username: string;
  profile_pic: string | null;
}

interface FamilyMember {
  id: string;
  member_id: string;
  relation_type: string;
  visibility: Visibility;
  member_profile: {
    id: string;
    display_name: string;
    username: string;
    profile_pic: string | null;
  };
}

interface FamilyMembersSectionProps {
  profileId: string;
  isOwnProfile: boolean;
  onSave?: () => void;
}

const relationTypes = [
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'grandfather', label: 'Grandfather' },
  { value: 'grandmother', label: 'Grandmother' },
  { value: 'grandson', label: 'Grandson' },
  { value: 'granddaughter', label: 'Granddaughter' },
  { value: 'uncle', label: 'Uncle' },
  { value: 'aunt', label: 'Aunt' },
  { value: 'nephew', label: 'Nephew' },
  { value: 'niece', label: 'Niece' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'husband', label: 'Husband' },
  { value: 'wife', label: 'Wife' },
  { value: 'partner', label: 'Partner' },
  { value: 'stepbrother', label: 'Stepbrother' },
  { value: 'stepsister', label: 'Stepsister' },
  { value: 'stepmother', label: 'Stepmother' },
  { value: 'stepfather', label: 'Stepfather' },
  { value: 'stepson', label: 'Stepson' },
  { value: 'stepdaughter', label: 'Stepdaughter' },
  { value: 'other', label: 'Other' }
];

export const FamilyMembersSection: React.FC<FamilyMembersSectionProps> = ({
  profileId,
  isOwnProfile,
  onSave
}) => {
  const { toast } = useToast();
  const { friends, loading: friendsLoading } = useFriends(profileId);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [selectedRelationType, setSelectedRelationType] = useState('');
  const [selectedVisibility, setSelectedVisibility] = useState<Visibility>('friends');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewerCanSeeFriend, setViewerCanSeeFriend] = useState(false);

  useEffect(() => {
    loadFamilyMembers();
    if (!isOwnProfile) {
      checkFriendshipStatus();
    }
  }, [profileId, isOwnProfile]);

  const checkFriendshipStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || isOwnProfile) {
        setViewerCanSeeFriend(false);
        return;
      }

      const { data, error } = await supabase
        .from('friends')
        .select('status')
        .or(`and(requester_id.eq.${user.id},receiver_id.eq.${profileId}),and(requester_id.eq.${profileId},receiver_id.eq.${user.id})`)
        .eq('status', 'accepted')
        .maybeSingle();

      if (error) throw error;
      setViewerCanSeeFriend(!!data);
    } catch (error) {
      console.error('Error checking friendship:', error);
      setViewerCanSeeFriend(false);
    }
  };

  const loadFamilyMembers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('family_relationships')
        .select(`
          *,
          member_profile:profiles!family_relationships_member_id_fkey(
            id,
            display_name,
            username,
            profile_pic
          )
        `)
        .eq('user_id', profileId);

      if (error) throw error;

      // Type cast the visibility field from string to Visibility
      const typedData = (data || []).map(item => ({
        ...item,
        visibility: item.visibility as Visibility
      }));
      setFamilyMembers(typedData);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load family members',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddFamilyMember = async () => {
    if (!selectedFriend || !selectedRelationType || !isOwnProfile) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('family_relationships')
        .insert({
          user_id: profileId,
          member_id: selectedFriend.id,
          relation_type: selectedRelationType,
          visibility: selectedVisibility
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Error',
            description: 'This person is already in your family',
            variant: 'destructive'
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: 'Success',
        description: 'Family member added successfully'
      });

      setShowAddForm(false);
      setSelectedFriend(null);
      setSelectedRelationType('');
      setSelectedVisibility('friends');
      setSearchQuery('');
      await loadFamilyMembers();
      onSave?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to add family member',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateFamilyMember = async (id: string, relationType: string, visibility: Visibility) => {
    if (!isOwnProfile) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('family_relationships')
        .update({
          relation_type: relationType,
          visibility: visibility
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Family relationship updated successfully'
      });

      setEditingId(null);
      await loadFamilyMembers();
      onSave?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to update family relationship',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFamilyMember = async (id: string) => {
    if (!isOwnProfile) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('family_relationships')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Family member removed successfully'
      });

      await loadFamilyMembers();
      onSave?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to remove family member',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const canViewFamilyMember = (visibility: string) => {
    if (isOwnProfile) return true;
    if (visibility === 'public') return true;
    if (visibility === 'friends') return viewerCanSeeFriend;
    if (visibility === 'private') return false;
    return true; // Default to true for public if visibility is not set
  };

  const filteredFriends = friends.filter(friend =>
    friend.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const availableFriends = filteredFriends.filter(friend =>
    !familyMembers.some(member => member.member_id === friend.id)
  );

  if (!isOwnProfile) {
    // Display mode for viewing other profiles
    return (
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Family Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 md:p-6 pt-0 md:pt-0">
          {loading ? (
            <div className="text-center text-muted-foreground text-xs md:text-sm">Loading...</div>
          ) : familyMembers.length > 0 ? (
            <div className="space-y-2 md:space-y-3">
              {familyMembers
                .filter(member => canViewFamilyMember(member.visibility))
                .map((member) => (
                  <div key={member.id} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg border">
                    <Avatar className="h-8 w-8 md:h-10 md:w-10">
                      <AvatarImage src={member.member_profile.profile_pic || undefined} />
                      <AvatarFallback className="text-xs md:text-sm">
                        {member.member_profile.display_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-medium text-xs md:text-sm">
                        {member.member_profile.display_name}
                      </div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">
                        @{member.member_profile.username}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] md:text-xs">
                      {relationTypes.find(rt => rt.value === member.relation_type)?.label || member.relation_type}
                    </Badge>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-xs md:text-sm text-muted-foreground text-center py-4 md:py-6">
              No family members added yet
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Edit mode for own profile
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 md:pb-6">
        <CardTitle>Family Members</CardTitle>
        {!showAddForm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="gap-1 h-14 border-0 text-xs md:text-sm"
          >
            <Plus className="h-4 w-4" />
            <span className="md:inline">Add Family Member</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4">
        {showAddForm && (
          <Card className="border-dashed">
            <CardContent className="p-3 md:p-4 space-y-3 md:space-y-4">
              <div>
                <Input
                  placeholder="Search friends..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="mb-2 h-14 border-0"
                />
                {searchQuery && availableFriends.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border rounded-md">
                    {availableFriends.slice(0, 5).map((friend) => (
                      <div
                        key={friend.id}
                        className={cn(
                          "flex items-center gap-2 p-2 cursor-pointer hover:bg-accent",
                          selectedFriend?.id === friend.id && "bg-primary/10"
                        )}
                        onClick={() => setSelectedFriend(friend)}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={friend.profile_pic || undefined} />
                          <AvatarFallback className="text-xs">
                            {friend.display_name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-sm">{friend.display_name}</div>
                          <div className="text-xs text-muted-foreground">@{friend.username}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedFriend && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-2 bg-accent/50 rounded-md">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={selectedFriend.profile_pic || undefined} />
                      <AvatarFallback className="text-xs">
                        {selectedFriend.display_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{selectedFriend.display_name}</span>
                  </div>

                  <div className="flex flex-col md:flex-row gap-1.5 md:gap-2">
                    <Select value={selectedRelationType} onValueChange={setSelectedRelationType}>
                      <SelectTrigger className="flex-1 h-14 border-0">
                        <SelectValue placeholder="Select relationship" />
                      </SelectTrigger>
                      <SelectContent>
                        {relationTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <VisibilitySelector
                      value={selectedVisibility}
                      onChange={setSelectedVisibility}
                      className="w-full md:w-[140px] h-14"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-1.5 md:gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedFriend(null);
                    setSelectedRelationType('');
                    setSearchQuery('');
                  }}
                  className="h-14 border-0 text-xs md:text-sm"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddFamilyMember}
                  disabled={!selectedFriend || !selectedRelationType || loading}
                  className="h-14 border-0 text-xs md:text-sm"
                >
                  Add Member
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && !showAddForm ? (
          <div className="text-center text-muted-foreground">Loading...</div>
        ) : familyMembers.length > 0 ? (
          <div className="space-y-3">
            {familyMembers.map((member) => (
              <div key={member.id} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg border">
                <Avatar className="h-8 w-8 md:h-10 md:w-10">
                  <AvatarImage src={member.member_profile.profile_pic || undefined} />
                  <AvatarFallback className="text-xs md:text-sm">
                    {member.member_profile.display_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-medium text-sm">
                    {member.member_profile.display_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    @{member.member_profile.username}
                  </div>
                </div>

                {editingId === member.id ? (
                  <EditFamilyMemberForm
                    member={member}
                    onSave={(relationType, visibility) =>
                      handleUpdateFamilyMember(member.id, relationType, visibility)
                    }
                    onCancel={() => setEditingId(null)}
                    loading={loading}
                  />
                ) : (
                  <div className="flex items-center gap-1 md:gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px] md:text-xs whitespace-nowrap">
                      {relationTypes.find(rt => rt.value === member.relation_type)?.label || member.relation_type}
                    </Badge>
                    <VisibilitySelector
                      value={member.visibility}
                      onChange={(visibility) =>
                        handleUpdateFamilyMember(member.id, member.relation_type, visibility)
                      }
                      className="w-[80px] md:w-[120px] h-14"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(member.id)}
                      className="h-14 w-14 p-0"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFamilyMember(member.id)}
                      className="h-14 w-14 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : !showAddForm ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            No family members added yet. Click "Add Family Member" to get started.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

interface EditFamilyMemberFormProps {
  member: FamilyMember;
  onSave: (relationType: string, visibility: Visibility) => void;
  onCancel: () => void;
  loading: boolean;
}

const EditFamilyMemberForm: React.FC<EditFamilyMemberFormProps> = ({
  member,
  onSave,
  onCancel,
  loading
}) => {
  const [relationType, setRelationType] = useState(member.relation_type);
  const [visibility, setVisibility] = useState<Visibility>(member.visibility);

  return (
    <div className="flex items-center gap-1 md:gap-2">
      <Select value={relationType} onValueChange={setRelationType}>
        <SelectTrigger className="w-[100px] md:w-[140px] h-14 border-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {relationTypes.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <VisibilitySelector
        value={visibility}
        onChange={setVisibility}
        className="w-[80px] md:w-[120px] h-14"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSave(relationType, visibility)}
        disabled={loading}
        className="h-14 w-14 p-0"
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="h-14 w-14 p-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};