import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { dataClient } from '@/lib/supabase/dataClient';
import { useToast } from '@/hooks/use-toast';
import { ProfileFieldVisibilitySelector } from '@/components/profile/ProfileFieldVisibilitySelector';
import {
  normalizeProfileVisibility,
  type ProfileVisibility,
} from '@/lib/profileAboutPrivacy';

interface AboutYouFormProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  initialValue?: string;
  initialVisibility?: string;
  onUpdate: () => void;
}

export const AboutYouForm = ({
  isOpen,
  onClose,
  profileId,
  initialValue = '',
  initialVisibility = 'private',
  onUpdate
}: AboutYouFormProps) => {
  const [aboutYou, setAboutYou] = useState(initialValue);
  const [visibility, setVisibility] = useState<ProfileVisibility>(
    normalizeProfileVisibility(initialVisibility) ?? 'private'
  );
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    setAboutYou(initialValue);
    setVisibility(normalizeProfileVisibility(initialVisibility) ?? 'private');
  }, [isOpen, initialValue, initialVisibility]);

  const handleSave = async () => {
    if (aboutYou.length > 500) {
      toast({
        title: 'Error',
        description: 'About you text cannot exceed 500 characters',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await dataClient
        .from('profiles')
        .update({
          about_you: aboutYou.trim(),
          about_you_visibility: visibility
        })
        .eq('id', profileId);

      if (error) throw error;
      toast({ title: 'Success', description: 'About you updated successfully' });
      onUpdate();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update about you',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAboutYou(initialValue);
    setVisibility(normalizeProfileVisibility(initialVisibility) ?? 'private');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>About You</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="about-you">Tell people about yourself</Label>
            <Textarea
              id="about-you"
              placeholder="Write some details about yourself..."
              value={aboutYou}
              onChange={(e) => setAboutYou(e.target.value)}
              className="mt-2 min-h-[120px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">{aboutYou.length}/500 characters</p>
          </div>

          <div className="flex items-center justify-between">
            <Label>Who can see this?</Label>
            <ProfileFieldVisibilitySelector
              fieldKey="about_you_visibility"
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
