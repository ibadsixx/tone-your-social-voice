import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Bug, Lightbulb, MessageSquare, MessageSquareWarning, Loader2, Send } from 'lucide-react';

const FEEDBACK_TYPES = [
  { value: 'bug', label: 'Bug Report', icon: Bug },
  { value: 'feature', label: 'Feature Request', icon: Lightbulb },
  { value: 'general', label: 'General Feedback', icon: MessageSquare },
] as const;

const FeedbackPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [feedbackType, setFeedbackType] = useState<string>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !subject.trim() || !message.trim()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('user_feedback').insert({
        user_id: user.id,
        feedback_type: feedbackType,
        subject: subject.trim(),
        message: message.trim(),
      });

      if (error) throw error;

      toast({
        title: 'Feedback sent',
        description: 'Thank you for your feedback!',
      });

      navigate(-1);
    } catch (error: any) {
      toast({
        title: 'Failed to send feedback',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const TypeIcon = FEEDBACK_TYPES.find(t => t.value === feedbackType)?.icon || MessageSquare;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background border-b px-4 h-12 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1 -ml-1 rounded-full hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-semibold text-base flex items-center gap-2">
          <MessageSquareWarning className="w-5 h-5" />
          Give feedback
        </h1>
      </header>

      <main className="flex-1 p-4">
        <p className="text-sm text-muted-foreground mb-6">
          Help us improve Tone. Share a bug report, feature request, or general feedback.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="feedback-type">Type</Label>
            <Select value={feedbackType} onValueChange={setFeedbackType}>
              <SelectTrigger id="feedback-type" className="h-14 border-0 bg-accent/50">
                <SelectValue placeholder="Select feedback type" />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_TYPES.map(({ value, label, icon: Icon }) => (
                  <SelectItem key={value} value={value}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      {label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-subject">Subject</Label>
            <Input
              id="feedback-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of your feedback"
              required
              maxLength={100}
              className="h-14 border-0 bg-accent/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message">Message</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your feedback in detail..."
              required
              rows={5}
              maxLength={2000}
              className="min-h-[120px] border-0 bg-accent/50 resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/2000</p>
          </div>

          <Button type="submit" className="w-full h-11" disabled={submitting || !subject.trim() || !message.trim()}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send feedback
              </>
            )}
          </Button>
        </form>
      </main>
    </div>
  );
};

export default FeedbackPage;
