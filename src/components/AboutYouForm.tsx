import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { Eye, Users, Lock } from 'lucide-react';

interface AboutYouFormProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  initialValue?: string;
  initialVisibility?: string;
  onUpdate: () => void;
}

const visibilityOptions = [
  { value: 'public', label: 'Public', icon: Eye },
  { value: 'friends', label: 'Friends', icon: Users },
  { value: 'private', label: 'Private', icon: Lock },
];

export const AboutYouForm = ({ 
  isOpen, 
  onClose, 
  profileId, 
  initialValue = '', 
  initialVisibility = 'friends',
  onUpdate 
}: AboutYouFormProps) => {
  const [aboutYou, setAboutYou] = useState(initialValue);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

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
      const { error } = await gateway
        .from('profiles')
        .update({ 
          about_you: aboutYou.trim(),
          about_you_visibility: visibility
        })
        .eq('id', profileId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'About you updated successfully'
      });
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
    setVisibility(initialVisibility);
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
            <p className="text-xs text-muted-foreground mt-1">
              {aboutYou.length}/500 characters
            </p>
          </div>

          <div>
            <Label>Who can see this?</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {visibilityOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {option.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={handleClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};