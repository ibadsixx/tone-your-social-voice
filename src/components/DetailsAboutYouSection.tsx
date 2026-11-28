import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AboutYouForm } from './AboutYouForm';
import { NamePronunciationForm } from './NamePronunciationForm';
import { OtherNamesForm } from './OtherNamesForm';
import { useOtherNames } from '@/hooks/useOtherNames';
import { Plus, Eye, Users, Lock, Edit2, Trash2 } from 'lucide-react';
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

import { loadSecureAboutFields, type AboutSecureDataStatus } from '@/api/profileAbout';
import { normalizeProfileVisibility } from '@/lib/profileAboutPrivacy';

interface DetailsAboutYouSectionProps {
  // Use the routed profileId directly. The public useProfile() result can be
  // null while About is still loading, and this section only ever needed the
  // id for its secure reads and writes.
  profileId: string;
  isOwnProfile: boolean;
}

const getVisibilityIcon = (visibility: string) => {
  const normalized = normalizeProfileVisibility(visibility);
  if (normalized === 'public') return Eye;
  if (normalized === 'friends') return Users;
  if (normalized === 'private') return Lock;
  return Lock;
};

const getVisibilityLabel = (visibility: string) => {
  const normalized = normalizeProfileVisibility(visibility);
  if (normalized === 'public') return 'Public';
  if (normalized === 'friends') return 'Friends';
  if (normalized === 'private') return 'Private';
  return 'Private';
};

const formatNameType = (type: string) => {
  switch (type) {
    case 'birth_name': return 'Birth name';
    case 'married_name': return 'Married name';
    case 'nickname': return 'Nickname';
    case 'other': return 'Other';
    default: return type;
  }
};

export const DetailsAboutYouSection = ({
  profileId,
  isOwnProfile
}: DetailsAboutYouSectionProps) => {
  const [aboutYouFormOpen, setAboutYouFormOpen] = useState(false);
  const [pronunciationFormOpen, setPronunciationFormOpen] = useState(false);
  const [otherNamesFormOpen, setOtherNamesFormOpen] = useState(false);
  const [editingOtherName, setEditingOtherName] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [otherNameToDelete, setOtherNameToDelete] = useState<string | null>(null);
  const [secureStatus, setSecureStatus] = useState<AboutSecureDataStatus>('loading');
  const [visibleFields, setVisibleFields] = useState<ReadonlySet<string>>(new Set());
  const [secureFields, setSecureFields] = useState<Record<string, unknown>>({});
  const [visibilitySettings, setVisibilitySettings] = useState<Record<string, string | null>>({});

  const { otherNames, loading, createOtherName, updateOtherName, deleteOtherName } = useOtherNames(profileId);

  const loadSecureFields = async () => {
    setSecureStatus('loading');
    const result = await loadSecureAboutFields(profileId);
    setSecureStatus(result.status);
    setVisibleFields(new Set(result.visibleFields));
    setSecureFields({ ...result.fields });
    setVisibilitySettings({ ...result.visibilitySettings });
  };

  useEffect(() => {
    void loadSecureFields();
  }, [profileId, isOwnProfile]);

  const ready = secureStatus === 'ready';
  const isVisible = (key: string) => ready && visibleFields.has(key);
  const secureText = (key: string): string => {
    const value = secureFields[key];
    return typeof value === 'string' ? value : '';
  };
  const visibilityFor = (column: string) =>
    normalizeProfileVisibility(visibilitySettings[column]) ?? 'private';

  const refreshAfterEdit = () => {
    void loadSecureFields();
  };

  const handleOtherNameSave = async (data: any) => {
    if (editingOtherName) {
      const result = await updateOtherName(editingOtherName.id, {
        ...data,
        user_id: profileId
      });
      if (result.success) {
        setEditingOtherName(null);
        setOtherNamesFormOpen(false);
      }
    } else {
      const result = await createOtherName({ ...data, user_id: profileId });
      if (result.success) setOtherNamesFormOpen(false);
    }
  };

  const handleEditOtherName = (otherName: any) => {
    setEditingOtherName(otherName);
    setOtherNamesFormOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setOtherNameToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (otherNameToDelete) {
      await deleteOtherName(otherNameToDelete);
      setOtherNameToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleCloseOtherNamesForm = () => {
    setOtherNamesFormOpen(false);
    setEditingOtherName(null);
  };

  const renderPrivateText = (key: string, value: string, emptyLabel: string) => {
    if (!isVisible(key)) {
      if (secureStatus === 'unavailable') {
        return (
          <p data-testid="details-secure-data-unavailable" className="text-xs md:text-sm text-muted-foreground">
            Unavailable until the secure field-level read is approved and installed.
          </p>
        );
      }
      if (!ready) return <p className="text-xs md:text-sm text-muted-foreground">Loading...</p>;
      return <p className="text-xs md:text-sm text-muted-foreground">Not visible to you.</p>;
    }
    if (!value) {
      return <p className="text-xs md:text-sm text-muted-foreground">{emptyLabel}</p>;
    }
    return <p className="text-xs md:text-sm text-foreground whitespace-pre-wrap">{value}</p>;
  };

  return (
    <>
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Details About You</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6 pt-0 md:pt-0">
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm md:text-base font-medium">About You</h4>
              {isOwnProfile && ready && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAboutYouFormOpen(true)}
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>
            {isOwnProfile && !ready ? (
              <p data-testid="details-secure-data-unavailable" className="text-xs md:text-sm text-muted-foreground">
                About You is unavailable until the secure field-level read is approved and installed.
              </p>
            ) : isOwnProfile ? (
              renderPrivateText('about_you', secureText('about_you'), 'Write some details about yourself')
            ) : (
              renderPrivateText('about_you', secureText('about_you'), 'No about-you details shared')
            )}
          </div>

          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm md:text-base font-medium">Name Pronunciation</h4>
              {isOwnProfile && ready && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPronunciationFormOpen(true)}
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>
            {isOwnProfile && !ready ? (
              <p className="text-xs md:text-sm text-muted-foreground">
                Name pronunciation is unavailable until the secure field-level read is approved and installed.
              </p>
            ) : isOwnProfile ? (
              renderPrivateText('name_pronunciation', secureText('name_pronunciation'), 'Add a pronunciation of your name')
            ) : (
              renderPrivateText('name_pronunciation', secureText('name_pronunciation'), 'No name pronunciation shared')
            )}
          </div>

          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm md:text-base font-medium">Other Names</h4>
              {isOwnProfile && (
                <Button variant="outline" size="sm" onClick={() => setOtherNamesFormOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              )}
            </div>

            {otherNames.length > 0 ? (
              <div className="space-y-1 md:space-y-2">
                {otherNames.map((otherName) => (
                  <div key={otherName.id} className="flex items-center justify-between p-2 md:p-3 border rounded-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs md:text-sm font-medium">{otherName.name}</span>
                        <Badge variant="secondary" className="text-xs">{formatNameType(otherName.type)}</Badge>
                        {otherName.show_at_top && (
                          <Badge variant="outline" className="text-xs">Top</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {(() => {
                          const Icon = getVisibilityIcon(otherName.visibility);
                          return (
                            <>
                              <Icon className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {getVisibilityLabel(otherName.visibility)}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    {isOwnProfile && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleEditOtherName(otherName)} className="h-8 w-8 p-0">
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(otherName.id)} className="h-8 w-8 p-0">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              !isOwnProfile ? (
                <p className="text-xs md:text-sm text-muted-foreground">No other names added</p>
              ) : (
                <Button
                  variant="ghost"
                  className="text-left justify-start p-0 h-auto font-normal text-xs md:text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setOtherNamesFormOpen(true)}
                >
                  Add a nickname, a birth name...
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      <AboutYouForm
        isOpen={aboutYouFormOpen}
        onClose={() => setAboutYouFormOpen(false)}
        profileId={profileId}
        initialValue={secureText('about_you')}
        initialVisibility={visibilitySettings.about_you_visibility ?? 'private'}
        onUpdate={refreshAfterEdit}
      />
      <NamePronunciationForm
        isOpen={pronunciationFormOpen}
        onClose={() => setPronunciationFormOpen(false)}
        profileId={profileId}
        initialValue={secureText('name_pronunciation')}
        initialVisibility={visibilitySettings.name_pronunciation_visibility ?? 'private'}
        onUpdate={refreshAfterEdit}
      />
      <OtherNamesForm
        isOpen={otherNamesFormOpen}
        onClose={handleCloseOtherNamesForm}
        initialData={editingOtherName}
        onSave={handleOtherNameSave}
      />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete other name?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOtherNameToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
