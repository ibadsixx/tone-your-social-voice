import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RelationshipSelector } from '@/components/RelationshipSelector';
import { FamilyMembersSection } from '@/components/FamilyMembersSection';
import { useToast } from '@/hooks/use-toast';
import { dataClient } from '@/lib/supabase/dataClient';
import { sanitizeProfilePayload } from '@/utils/profileValidation';
import { Save, X, Edit, Users2 } from 'lucide-react';
import { loadSecureAboutFields, type AboutSecureDataStatus } from '@/api/profileAbout';
import { normalizeProfileVisibility, type ProfileVisibility } from '@/lib/profileAboutPrivacy';

interface FamilyAndRelationshipsProps {
  profileId: string;
  isOwnProfile: boolean;
}

export const FamilyAndRelationships: React.FC<FamilyAndRelationshipsProps> = ({
  profileId,
  isOwnProfile
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [secureStatus, setSecureStatus] = useState<AboutSecureDataStatus>('loading');
  const [visibleFields, setVisibleFields] = useState<ReadonlySet<string>>(new Set());
  const [relationshipStatus, setRelationshipStatus] = useState<string>('');
  const [visibilitySetting, setVisibilitySetting] = useState<ProfileVisibility>('private');
  const [editForm, setEditForm] = useState({
    relationship_status: '',
    relationship_visibility: 'private' as ProfileVisibility
  });

  const loadRelationshipData = async () => {
    setSecureStatus('loading');
    const result = await loadSecureAboutFields(profileId);
    const status = typeof result.fields.relationship_status === 'string'
      ? result.fields.relationship_status
      : '';
    const visibility = normalizeProfileVisibility(result.visibilitySettings.relationship_visibility) ?? 'private';

    setSecureStatus(result.status);
    setVisibleFields(new Set(result.visibleFields));
    setRelationshipStatus(status);
    setVisibilitySetting(visibility);
    setEditForm({ relationship_status: status, relationship_visibility: visibility });
  };

  useEffect(() => {
    void loadRelationshipData();
  }, [profileId, isOwnProfile]);

  const ready = secureStatus === 'ready';
  const isVisible = ready && visibleFields.has('relationship_status');

  const handleSaveRelationship = async () => {
    if (!isOwnProfile || !ready) return;

    try {
      setLoading(true);
      const updateData = {
        relationship_status: editForm.relationship_status || null,
        relationship_visibility: editForm.relationship_visibility
      };
      const sanitizedData = sanitizeProfilePayload(updateData);
      const { error } = await dataClient
        .from('profiles')
        .update(sanitizedData)
        .eq('id', profileId);
      if (error) throw error;

      toast({ title: 'Success', description: 'Relationship status updated successfully' });
      setIsEditing(false);
      await loadRelationshipData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update relationship status',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({ relationship_status: relationshipStatus, relationship_visibility: visibilitySetting });
  };

  const getRelationshipStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      single: 'Single',
      in_relationship: 'In a relationship',
      engaged: 'Engaged',
      married: 'Married',
      divorced: 'Divorced',
      widowed: 'Widowed'
    };
    return statusMap[status] || status;
  };

  const renderRelationshipStatus = () => {
    if (secureStatus === 'unavailable') {
      return (
        <div data-testid="family-secure-data-unavailable" className="text-xs md:text-sm text-muted-foreground">
          Relationship status is unavailable until the secure field-level read is approved and installed. This does not mean it is empty.
        </div>
      );
    }
    if (!ready) return <div className="text-xs md:text-sm text-muted-foreground">Loading...</div>;
    if (!isVisible) {
      return <div className="text-xs md:text-sm text-muted-foreground">Relationship status is not visible to you.</div>;
    }
    if (!relationshipStatus) {
      return <div className="text-xs md:text-sm text-muted-foreground">No relationship status shared</div>;
    }
    return <div className="text-xs md:text-sm font-medium">{getRelationshipStatusLabel(relationshipStatus)}</div>;
  };

  if (!isOwnProfile) {
    return (
      <div className="space-y-4 md:space-y-6">
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Users2 className="h-5 w-5 text-primary shrink-0" />
              Relationship Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
            {renderRelationshipStatus()}
          </CardContent>
        </Card>
        <FamilyMembersSection profileId={profileId} isOwnProfile={isOwnProfile} />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
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
              disabled={!ready}
              className="h-8 border-0 text-xs md:text-sm"
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
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
              <div className="flex gap-2">
                <Button onClick={handleSaveRelationship} disabled={loading} className="flex-1">
                  <Save className="h-4 w-4 mr-1" />
                  {loading ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" onClick={handleCancelEdit} disabled={loading} className="flex-1">
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            renderRelationshipStatus()
          )}
        </CardContent>
      </Card>
      <FamilyMembersSection profileId={profileId} isOwnProfile={isOwnProfile} />
    </div>
  );
};
