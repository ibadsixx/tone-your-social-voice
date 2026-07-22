import { useState, useRef } from 'react';
import { ArrowLeft, X, Check, Paperclip } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface ReelFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Auto-injected metadata (not shown to user)
  postId: string;
  postType: 'reel' | 'video' | 'normal_post';
  postOwnerId: string;
}

const AREA_OPTIONS = [
  { value: 'reels', label: 'Reels' },
  { value: 'videos', label: 'Videos' },
  { value: 'posts', label: 'Posts' },
  { value: 'comments', label: 'Comments' },
  { value: 'sharing', label: 'Sharing' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'other', label: 'Other' },
];

const ReelFeedbackModal = ({ 
  isOpen, 
  onClose,
  postId,
  postType,
  postOwnerId,
}: ReelFeedbackModalProps) => {
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [details, setDetails] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachment(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!selectedArea) {
      toast({
        title: 'Area required',
        description: 'Please select the affected feature.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await gateway.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to submit feedback.',
          variant: 'destructive',
        });
        return;
      }

      let attachmentUrl: string | null = null;

      // Upload attachment if provided
      if (attachment) {
        const fileExt = attachment.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await gateway.storage
          .from('report-evidence')
          .upload(fileName, attachment);

        if (uploadError) {
          console.error('Attachment upload error:', uploadError);
        } else {
          const { data: urlData } = gateway.storage
            .from('report-evidence')
            .getPublicUrl(fileName);
          attachmentUrl = urlData.publicUrl;
        }
      }

      // Generate post_url programmatically based on post type
      const baseUrl = window.location.origin;
      const postUrl = postType === 'reel' 
        ? `${baseUrl}/reels/${postId}`
        : postType === 'video'
          ? `${baseUrl}/videos/${postId}`
          : `${baseUrl}/post/${postId}`;

      // Insert into technical_feedback with auto-injected metadata
      const { error } = await gateway.from('technical_feedback').insert({
        reporter_id: user.id,
        post_id: postId,
        post_type: postType,
        post_url: postUrl,
        post_owner_id: postOwnerId,
        affected_area: selectedArea,
        user_message: details.trim() || null,
        attachment_url: attachmentUrl,
      });

      if (error) throw error;

      console.log('[TECHNICAL_FEEDBACK] submitted:', {
        post_id: postId,
        post_type: postType,
        post_owner_id: postOwnerId,
        affected_area: selectedArea,
      });

      setIsSubmitted(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit feedback. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedArea('');
    setDetails('');
    removeAttachment();
    setIsSubmitted(false);
    onClose();
  };

  if (isSubmitted) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md bg-card border-border p-0">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Thanks for reporting the issue
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Our team will review your feedback to improve the experience.
            </p>
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-card border-border p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <button 
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-accent transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h2 className="text-base font-semibold text-foreground">
            Help us improve this feature
          </h2>
          <button 
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-accent transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Question */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">
              What problem did you experience?
            </h3>
            
            {/* Area Dropdown */}
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger className="w-full bg-secondary border-border">
                <SelectValue placeholder="Select the affected feature" />
              </SelectTrigger>
              <SelectContent>
                {AREA_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Details */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Details
            </label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Please describe what happened and what you expected instead."
              className="min-h-[100px] bg-secondary border-border resize-none"
            />
          </div>

          {/* Attachment */}
          <div>
            {previewUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-border">
                {attachment?.type.startsWith('video/') ? (
                  <video 
                    src={previewUrl} 
                    className="w-full h-32 object-cover"
                    controls
                  />
                ) : (
                  <img 
                    src={previewUrl} 
                    alt="Attachment preview" 
                    className="w-full h-32 object-cover"
                  />
                )}
                <button
                  onClick={removeAttachment}
                  className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-background transition-colors"
                >
                  <X className="w-4 h-4 text-foreground" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary hover:bg-accent transition-colors text-sm text-foreground"
              >
                <Paperclip className="w-4 h-4" />
                <span>Add a Screenshot or Video (recommended)</span>
              </button>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Info Message */}
          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            Your feedback helps us identify and fix technical issues faster. 
            If you need help solving a specific problem, please visit the{' '}
            <a href="#" className="text-primary hover:underline">Help Center</a>.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!selectedArea || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Send Report'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReelFeedbackModal;
