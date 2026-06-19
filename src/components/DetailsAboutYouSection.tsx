import { useState } from 'react';
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

interface Profile {
  id: string;
  about_you?: string;
  about_you_visibility?: string;
  name_pronunciation?: string;
  name_pronunciation_visibility?: string;
}

interface DetailsAboutYouSectionProps {
  profile: Profile;
  isOwnProfile: boolean;
  onProfileUpdate: () => void;
}

const getVisibilityIcon = (visibility: string) => {
  switch (visibility) {
    case 'public':
      return Eye;
    case 'friends':
      return Users;
    case 'private':
      return Lock;
    default:
      return Eye;
  }
};

const getVisibilityLabel = (visibility: string) => {
  switch (visibility) {
    case 'public':
      return 'Public';
    case 'friends':
      return 'Friends';
    case 'private':
      return 'Private';
    default:
      return 'Public';
  }
};

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

export const DetailsAboutYouSection = ({ 
  profile, 
  isOwnProfile, 
  onProfileUpdate 
}: DetailsAboutYouSectionProps) => {
  const [aboutYouFormOpen, setAboutYouFormOpen] = useState(false);
  const [pronunciationFormOpen, setPronunciationFormOpen] = useState(false);
  const [otherNamesFormOpen, setOtherNamesFormOpen] = useState(false);
  const [editingOtherName, setEditingOtherName] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [otherNameToDelete, setOtherNameToDelete] = useState<string | null>(null);

  const { otherNames, loading, createOtherName, updateOtherName, deleteOtherName } = useOtherNames(profile.id);

  const handleOtherNameSave = async (data: any) => {
    if (editingOtherName) {
      const result = await updateOtherName(editingOtherName.id, {
        ...data,
        user_id: profile.id
      });
      if (result.success) {
        setEditingOtherName(null);
        setOtherNamesFormOpen(false);
      }
    } else {
      const result = await createOtherName({
        ...data,
        user_id: profile.id
      });
      if (result.success) {
        setOtherNamesFormOpen(false);
      }
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

  return (
    <>
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Details About You</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6 pt-0 md:pt-0">
          {/* About You Section */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm md:text-base font-medium">About You</h4>
              {profile.about_you && (
                <div className="flex items-center gap-1">
                  {(() => {
                    const Icon = getVisibilityIcon(profile.about_you_visibility || 'friends');
                    return <Icon className="h-3 w-3 text-muted-foreground" />;
                  })()}
                </div>
              )}
            </div>
            
            {profile.about_you ? (
              <div className="space-y-1 md:space-y-2">
                <p className="text-xs md:text-sm text-foreground">{profile.about_you}</p>
                {isOwnProfile && (
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
            ) : (
              isOwnProfile && (
                <Button
                  variant="ghost"
                  className="text-left justify-start p-0 h-auto font-normal text-xs md:text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setAboutYouFormOpen(true)}
                >
                  Write some details about yourself
                </Button>
              )
            )}
          </div>

          {/* Name Pronunciation Section */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm md:text-base font-medium">Name Pronunciation</h4>
              {profile.name_pronunciation && (
                <div className="flex items-center gap-1">
                  {(() => {
                    const Icon = getVisibilityIcon(profile.name_pronunciation_visibility || 'friends');
                    return <Icon className="h-3 w-3 text-muted-foreground" />;
                  })()}
                </div>
              )}
            </div>
            
            {profile.name_pronunciation ? (
              <div className="space-y-1 md:space-y-2">
                <p className="text-xs md:text-sm text-foreground">{profile.name_pronunciation}</p>
                {isOwnProfile && (
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
            ) : (
              isOwnProfile && (
                <Button
                  variant="ghost"
                  className="text-left justify-start p-0 h-auto font-normal text-xs md:text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setPronunciationFormOpen(true)}
                >
                  Add a pronunciation of your name
                </Button>
              )
            )}
          </div>

          {/* Other Names Section */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm md:text-base font-medium">Other Names</h4>
              {isOwnProfile && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOtherNamesFormOpen(true)}
                >
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
                        <Badge variant="secondary" className="text-xs">
                          {formatNameType(otherName.type)}
                        </Badge>
                        {otherName.show_at_top && (
                          <Badge variant="outline" className="text-xs">
                            Top
                          </Badge>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditOtherName(otherName)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(otherName.id)}
                          className="h-8 w-8 p-0"
                        >
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

      {/* Forms */}
      <AboutYouForm
        isOpen={aboutYouFormOpen}
        onClose={() => setAboutYouFormOpen(false)}
        profileId={profile.id}
        initialValue={profile.about_you || ''}
        initialVisibility={profile.about_you_visibility || 'friends'}
        onUpdate={onProfileUpdate}
      />

      <NamePronunciationForm
        isOpen={pronunciationFormOpen}
        onClose={() => setPronunciationFormOpen(false)}
        profileId={profile.id}
        initialValue={profile.name_pronunciation || ''}
        initialVisibility={profile.name_pronunciation_visibility || 'friends'}
        onUpdate={onProfileUpdate}
      />

      <OtherNamesForm
        isOpen={otherNamesFormOpen}
        onClose={handleCloseOtherNamesForm}
        onSave={handleOtherNameSave}
        initialData={editingOtherName}
        loading={loading}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Other Name</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this other name? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
