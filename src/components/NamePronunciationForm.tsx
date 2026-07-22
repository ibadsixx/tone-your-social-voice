import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { Eye, Users, Lock } from 'lucide-react';

interface NamePronunciationFormProps {
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

export const NamePronunciationForm = ({ 
  isOpen, 
  onClose, 
  profileId, 
  initialValue = '', 
  initialVisibility = 'friends',
  onUpdate 
}: NamePronunciationFormProps) => {
  const [pronunciation, setPronunciation] = useState(initialValue);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

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
      const { error } = await gateway
        .from('profiles')
        .update({ 
          name_pronunciation: pronunciation.trim(),
          name_pronunciation_visibility: visibility
        })
        .eq('id', profileId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Name pronunciation updated successfully'
      });
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
    setVisibility(initialVisibility);
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
            <p className="text-xs text-muted-foreground mt-1">
              {pronunciation.length}/100 characters
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