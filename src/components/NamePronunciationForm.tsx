import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dataClient } from '@/lib/supabase/dataClient';
import { useToast } from '@/hooks/use-toast';
import { ProfileFieldVisibilitySelector } from '@/components/profile/ProfileFieldVisibilitySelector';
import {
  normalizeProfileVisibility,
  type ProfileVisibility,
} from '@/lib/profileAboutPrivacy';

interface NamePronunciationFormProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  initialValue?: string;
  initialVisibility?: string;
  onUpdate: () => void;
}

export const NamePronunciationForm = ({
  isOpen,
  onClose,
  profileId,
  initialValue = '',
  initialVisibility = 'private',
  onUpdate
}: NamePronunciationFormProps) => {
  const [pronunciation, setPronunciation] = useState(initialValue);
  const [visibility, setVisibility] = useState<ProfileVisibility>(
    normalizeProfileVisibility(initialVisibility) ?? 'private'
  );
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    setPronunciation(initialValue);
    setVisibility(normalizeProfileVisibility(initialVisibility) ?? 'private');
  }, [isOpen, initialValue, initialVisibility]);

  const handleSave = async () => {
    if (pronunciation.length > 100) {
      toast({
        title: 'Error',
        description: 'Name pronunciation cannot exceed 100 characters',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await dataClient
        .from('profiles')
        .update({
          name_pronunciation: pronunciation.trim(),
          name_pronunciation_visibility: visibility
        })
        .eq('id', profileId);
      if (error) throw error;
      toast({ title: 'Success', description: 'Name pronunciation updated successfully' });
      onUpdate();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update name pronunciation',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPronunciation(initialValue);
    setVisibility(normalizeProfileVisibility(initialVisibility) ?? 'private');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Name Pronunciation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="pronunciation">How do you pronounce your name?</Label>
            <Input
              id="pronunciation"
              placeholder="e.g., JOHN-uh-than"
              value={pronunciation}
              onChange={(e) => setPronunciation(e.target.value)}
              className="mt-2"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground mt-1">{pronunciation.length}/100 characters</p>
          </div>

          <div className="flex items-center justify-between">
            <Label>Who can see this?</Label>
            <ProfileFieldVisibilitySelector
              fieldKey="name_pronunciation_visibility"
              value={visibility}
              onChange={setVisibility}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
