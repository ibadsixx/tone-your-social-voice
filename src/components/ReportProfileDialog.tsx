import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Flag, Loader2, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProfileReports, ReportReason } from '@/hooks/useProfileReports';

interface ReportProfileDialogProps {
  reportedUserId: string;
  reportedUserName: string;
  isAlreadyReported: boolean;
  onReportSubmitted: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REPORT_REASONS: Record<ReportReason, string> = {
  fake_account: 'Fake account',
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate content',
  other: 'Other'
};

export const ReportProfileDialog = ({ 
  reportedUserId, 
  reportedUserName, 
  isAlreadyReported,
  onReportSubmitted,
  open,
  onOpenChange
}: ReportProfileDialogProps) => {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [description, setDescription] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();
  const { submitReport, loading } = useProfileReports();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    
    if (!file) {
      setEvidenceFile(null);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setFileError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      setFileError('File size must be less than 5MB');
      return;
    }

    setEvidenceFile(file);
  };

  const resetForm = () => {
    setReason('');
    setDescription('');
    setEvidenceFile(null);
    setFileError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reason || !user) {
      toast({
        title: 'Error',
        description: 'Please select a reason for the report.',
        variant: 'destructive'
      });
      return;
    }

    const success = await submitReport(
      reportedUserId, 
      reason, 
      description.trim() || undefined, 
      evidenceFile || undefined
    );

    if (success) {
      setOpen(false);
      resetForm();
      onReportSubmitted();
    }
  };

  if (isAlreadyReported) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report Profile</DialogTitle>
          <DialogDescription>
            Report @{reportedUserName} for violating our community guidelines.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Select value={reason} onValueChange={(value: ReportReason) => setReason(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border z-50">
                {Object.entries(REPORT_REASONS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Additional details (optional)</Label>
            <Textarea
              id="description"
              placeholder="Provide additional context about why you're reporting this profile..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="resize-none"
            />
            <div className="text-xs text-muted-foreground text-right">
              {description.length}/500 characters
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evidence">Evidence (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="evidence"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <Label
                htmlFor="evidence"
                className="flex items-center gap-2 px-3 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md cursor-pointer text-sm"
              >
                <Upload className="h-4 w-4" />
                {evidenceFile ? evidenceFile.name : 'Upload image evidence'}
              </Label>
              {evidenceFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEvidenceFile(null);
                    setFileError('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Upload screenshots or other image evidence (JPEG/PNG, max 5MB)
            </p>
            {fileError && (
              <Alert variant="destructive">
                <AlertDescription>{fileError}</AlertDescription>
              </Alert>
            )}
          </div>

          <Alert>
            <AlertDescription>
              False reports may result in action against your account. Only report profiles that violate our community guidelines.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!reason || loading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Report'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};