import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RelationshipSelector } from '@/components/RelationshipSelector';
import { FamilyMembersSection } from '@/components/FamilyMembersSection';
import { VisibilitySelector, Visibility } from '@/components/VisibilitySelector';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeProfilePayload, normalizeVisibilityValue } from '@/utils/profileValidation';
import { Save, X, Edit, Users2 } from 'lucide-react';

interface FamilyAndRelationshipsProps {
  profileId: string;
  isOwnProfile: boolean;
}

interface RelationshipData {
  relationship_status?: string;
  relationship_visibility?: string;
}

export const FamilyAndRelationships: React.FC<FamilyAndRelationshipsProps> = ({
  profileId,
  isOwnProfile
}) => {
  const { toast } = useToast();
  const [relationshipData, setRelationshipData] = useState<RelationshipData>({});
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    relationship_status: '',
    relationship_visibility: 'friends' as Visibility
  });
  const [viewerCanSeeFriend, setViewerCanSeeFriend] = useState(false);

  useEffect(() => {
    loadRelationshipData();
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

  const loadRelationshipData = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('relationship_status, relationship_visibility')
        .eq('id', profileId)
        .single();

      if (error) throw error;

      const relationshipInfo = {
        relationship_status: data.relationship_status,
        relationship_visibility: normalizeVisibilityValue(data.relationship_visibility) || 'friends'
      };

      setRelationshipData(relationshipInfo);
      setEditForm({
        relationship_status: data.relationship_status || '',
        relationship_visibility: (normalizeVisibilityValue(data.relationship_visibility) || 'friends') as Visibility
      });
    } catch (error: any) {
      console.error('Error loading relationship data:', error);
    }
  };

  const handleSaveRelationship = async () => {
    if (!isOwnProfile) return;

    try {
      setLoading(true);

      const updateData = {
        relationship_status: editForm.relationship_status || null,
        relationship_visibility: editForm.relationship_visibility
      };

      // Apply sanitization for proper database format
      const sanitizedData = sanitizeProfilePayload(updateData);

      const { error } = await supabase
        .from('profiles')
        .update(sanitizedData)
        .eq('id', profileId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Relationship status updated successfully'
      });

      setIsEditing(false);
      await loadRelationshipData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to update relationship status',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({
      relationship_status: relationshipData.relationship_status || '',
      relationship_visibility: (normalizeVisibilityValue(relationshipData.relationship_visibility) || 'friends') as Visibility
    });
  };

  const canViewRelationship = () => {
    if (isOwnProfile) return true;
    const visibility = relationshipData.relationship_visibility;
    if (visibility === 'public') return true;
    if (visibility === 'friends') return viewerCanSeeFriend;
    if (visibility === 'private') return false;
    return true; // Default to true for public if visibility is not set
  };

  const getRelationshipStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'single': 'Single',
      'in_relationship': 'In a relationship',
      'engaged': 'Engaged',
      'married': 'Married',
      'divorced': 'Divorced',
      'widowed': 'Widowed'
    };
    return statusMap[status] || status;
  };

  const getPrivacyLabel = (visibility: string) => {
    const visibilityMap: Record<string, string> = {
      'public': 'Everyone',
      'friends': 'Friends',
      'private': 'You Only'
    };
    return `Visible to ${visibilityMap[visibility] || 'Everyone'}`;
  };

  if (!isOwnProfile) {
    // Display mode for viewing other profiles
    return (
      <div className="space-y-4 md:space-y-6">
        {/* Relationship Status */}
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Users2 className="h-5 w-5 text-primary shrink-0" />
              Relationship Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
            {relationshipData.relationship_status && canViewRelationship() ? (
              <div>
                <div className="text-xs md:text-sm font-medium">
                  {getRelationshipStatusLabel(relationshipData.relationship_status)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {getPrivacyLabel(relationshipData.relationship_visibility || 'friends')}
                </div>
              </div>
            ) : !canViewRelationship() && relationshipData.relationship_status ? (
              <div className="text-xs md:text-sm text-muted-foreground">Relationship status is private</div>
            ) : (
              <div className="text-xs md:text-sm text-muted-foreground">No relationship status shared</div>
            )}
          </CardContent>
        </Card>

        {/* Family Members */}
        <FamilyMembersSection profileId={profileId} isOwnProfile={isOwnProfile} />
      </div>
    );
  }

  // Edit mode for own profile
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Relationship Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Users2 className="h-5 w-5 text-primary shrink-0" />
            Relationship Status
          </CardTitle>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Edit className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden md:inline">Edit</span>
              <span className="md:hidden">Edit</span>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          {isEditing ? (
            <div className="space-y-4">
              <RelationshipSelector
                value={editForm.relationship_status}
                visibility={editForm.relationship_visibility}
                onValueChange={(value) =>
                  setEditForm(prev => ({ ...prev, relationship_status: value }))
                }
                onVisibilityChange={(visibility) =>
                  setEditForm(prev => ({ ...prev, relationship_visibility: visibility }))
                }
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSaveRelationship} disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {relationshipData.relationship_status ? (
                <div>
                  <div className="text-xs md:text-sm font-medium mb-1">
                    {getRelationshipStatusLabel(relationshipData.relationship_status)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {getPrivacyLabel(relationshipData.relationship_visibility || 'friends')}
                  </div>
                </div>
              ) : (
                <div className="text-xs md:text-sm text-muted-foreground">
                  Add your relationship status to let people know your current status
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Family Members */}
      <FamilyMembersSection profileId={profileId} isOwnProfile={isOwnProfile} />
    </div>
  );
};