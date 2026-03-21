import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

interface GroupNotificationSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GroupNotificationSettings = ({ open, onOpenChange }: GroupNotificationSettingsProps) => {
  const { toast } = useToast();
  const [inApp, setInApp] = useState<'all' | 'highlights' | 'friends' | 'off'>('highlights');
  const [push, setPush] = useState<'highlights' | 'off'>('highlights');
  const [memberRequests, setMemberRequests] = useState(true);

  const handleSave = () => {
    toast({ title: 'Saved', description: 'Notification settings updated.' });
    onOpenChange(false);
  };

  const RadioOption = ({
    selected,
    onSelect,
    label,
    description,
  }: {
    selected: boolean;
    onSelect: () => void;
    label: string;
    description: string;
  }) => (
    <button
      onClick={onSelect}
      className="w-full flex items-center justify-between py-2 text-left"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div
        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected ? 'border-primary bg-primary' : 'border-muted-foreground'
        }`}
      >
        {selected && <div className="h-2 w-2 rounded-full bg-primary-foreground" />}
      </div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notification settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* In-app notifications */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">In-app notifications</h3>
            <div className="space-y-1">
              <RadioOption
                selected={inApp === 'all'}
                onSelect={() => setInApp('all')}
                label="All posts"
                description="Every post in the group"
              />
              <RadioOption
                selected={inApp === 'highlights'}
                onSelect={() => setInApp('highlights')}
                label="Highlights"
                description="Friends' posts and suggested posts"
              />
              <RadioOption
                selected={inApp === 'friends'}
                onSelect={() => setInApp('friends')}
                label="Friends' posts"
                description="Only your friends' posts"
              />
              <RadioOption
                selected={inApp === 'off'}
                onSelect={() => setInApp('off')}
                label="Off"
                description="Only mentions and important updates to group settings or privacy"
              />
            </div>
          </div>

          <Separator />

          {/* Push notifications */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Push notifications</h3>
            <div className="space-y-1">
              <RadioOption
                selected={push === 'highlights'}
                onSelect={() => setPush('highlights')}
                label="Highlights"
                description="Suggested posts"
              />
              <RadioOption
                selected={push === 'off'}
                onSelect={() => setPush('off')}
                label="Off"
                description="Only mentions and important updates to group settings or privacy"
              />
            </div>
          </div>

          <Separator />

          {/* Member request notifications */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Member request notifications</p>
              <p className="text-xs text-muted-foreground">Get notifications when friends ask to join</p>
            </div>
            <Switch checked={memberRequests} onCheckedChange={setMemberRequests} />
          </div>
        </div>

        <DialogFooter className="flex-row justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GroupNotificationSettings;
