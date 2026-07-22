import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Hash } from 'lucide-react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChannelCreated: (conversationId: string) => void;
}

export const CreateChannelDialog: React.FC<CreateChannelDialogProps> = ({
  open,
  onOpenChange,
  onChannelCreated,
}) => {
  const { toast } = useToast();
  const [channelName, setChannelName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setChannelName('');
      setDescription('');
    }
  }, [open]);

  const handleCreate = async () => {
    const trimmedName = channelName.trim();
    if (!trimmedName) {
      toast({ title: 'Error', description: 'Please enter a channel name', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await gateway.rpc('create_channel_conversation', {
        p_name: trimmedName,
        p_description: description.trim() || null,
      });
      if (error) throw error;
      if (!data) throw new Error('Failed to create channel');

      toast({ title: 'Channel created', description: `"${trimmedName}" is ready` });
      onOpenChange(false);
      onChannelCreated(data);
    } catch (error) {
      console.error('Error creating channel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create channel',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Hash className="h-5 w-5 text-muted-foreground" />
            Create Channel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Channel name</Label>
            <Input
              id="channel-name"
              placeholder="e.g. announcements, general, random"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-description">Description (optional)</Label>
            <Textarea
              id="channel-description"
              placeholder="What is this channel about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
