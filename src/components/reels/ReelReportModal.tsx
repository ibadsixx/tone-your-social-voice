import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useHiddenContent } from '@/hooks/useHiddenContent';

interface ReelReportModalProps {
  reelId: string;
  reelOwnerId?: string;
  postType?: 'reel' | 'video' | 'normal_post';
  isOpen: boolean;
  onClose: () => void;
}

// STRICT MAIN REASONS as specified
const MAIN_REASONS = [
  { id: 'MINORS', label: 'Content involving minors' },
  { id: 'HARASSMENT', label: 'Harassment or harmful behavior' },
  { id: 'SELF_HARM', label: 'Self-harm or dangerous behavior' },
  { id: 'VIOLENCE', label: 'Violent or disturbing content' },
  { id: 'ILLEGAL_PRODUCTS', label: 'Illegal or restricted products' },
  { id: 'ADULT_CONTENT', label: 'Explicit or adult material' },
  { id: 'SCAM_FRAUD', label: 'Scam, misinformation, or fraud' },
  { id: 'INTELLECTUAL_PROPERTY', label: 'Copyright or ownership issue' },
  { id: 'DONT_WANT_TO_SEE', label: "I don't want to see this content" },
];

// SUB REASONS - exact keys as specified
const SUB_REASONS: Record<string, { id: string; label: string }[]> = {
  MINORS: [
    { id: 'THREATS_PRIVATE_MEDIA', label: 'Threatening a minor with private images' },
    { id: 'SEXUAL_EXPLOITATION', label: 'Sexual exploitation involving a minor' },
    { id: 'SHARING_PRIVATE_MEDIA', label: 'Sharing private images of a minor' },
    { id: 'HARASSMENT_OR_INTIMIDATION', label: 'Harassment or intimidation' },
    { id: 'PHYSICAL_ABUSE', label: 'Physical harm or abuse' },
  ],
  HARASSMENT: [
    { id: 'THREATS', label: 'Threats to expose private or sensitive images' },
    { id: 'SEXUAL_COERCION', label: 'Sexual exploitation or coercion' },
    { id: 'HUMAN_TRAFFICKING', label: 'Exploitation involving forced control or trafficking' },
    { id: 'BULLYING', label: 'Ongoing harassment, intimidation, or bullying' },
  ],
  SELF_HARM: [
    { id: 'SUICIDE', label: 'Content showing suicide or intentional self-harm' },
    { id: 'EATING_DISORDER', label: 'Content promoting or glorifying eating disorders' },
  ],
  VIOLENCE: [
    { id: 'CREDIBLE_THREAT', label: "A serious or believable threat to people's safety" },
    { id: 'TERRORISM', label: 'Content that appears to support or reference terrorism' },
    { id: 'CALLS_FOR_VIOLENCE', label: 'Encouraging or calling for acts of violence' },
    { id: 'ORGANIZED_CRIME', label: 'Content related to organized or criminal activity' },
    { id: 'HATE_CONTENT', label: 'Promoting hatred or discrimination against others' },
    { id: 'GRAPHIC_VIOLENCE', label: 'Graphic or disturbing scenes of violence, death, or serious injury' },
    { id: 'ANIMAL_ABUSE', label: 'Violence or cruelty toward animals' },
  ],
  ILLEGAL_PRODUCTS: [
    { id: 'DRUGS', label: 'Illegal drugs or controlled substances' },
    { id: 'WEAPONS', label: 'Weapons, firearms, or harmful devices' },
    { id: 'ANIMALS', label: 'Illegal sale or trade of animals' },
  ],
  ADULT_CONTENT: [
    { id: 'THREATS_PRIVATE_MEDIA', label: 'Threats involving the sharing of private images' },
    { id: 'PROSTITUTION', label: 'Content suggesting sexual services or solicitation' },
    { id: 'NON_CONSENSUAL_MEDIA', label: 'Private or intimate images shared without consent' },
    { id: 'SEXUAL_EXPLOITATION', label: 'Possible sexual exploitation or coercion' },
    { id: 'NUDITY', label: 'Explicit nudity or sexual acts' },
  ],
  SCAM_FRAUD: [
    { id: 'SCAM', label: 'Deceptive schemes or fraudulent activity' },
    { id: 'FALSE_INFORMATION', label: 'Misleading or inaccurate information' },
    { id: 'SPAM', label: 'Repetitive, unsolicited, or low-quality content' },
    { id: 'IMPERSONATION', label: 'Impersonating a legitimate business or organization' },
  ],
};

// Actions for "don't want to see" - NO DB report insert
const DONT_WANT_ACTIONS = [
  { id: 'hide-post', label: 'Hide this post', description: "You won't see this specific post anymore." },
  { id: 'hide-all', label: 'Hide all content from this creator', description: "You won't see any content from this account." },
  { id: 'block-creator', label: 'Block this creator', description: 'You and this creator will no longer be able to see or interact with each other.' },
];

type Step = 'main' | 'sub' | 'review' | 'copyright' | 'dont-want' | 'success';

const ReelReportModal = ({ 
  reelId, 
  reelOwnerId, 
  postType = 'reel',
  isOpen, 
  onClose 
}: ReelReportModalProps) => {
  const [mainReason, setMainReason] = useState<string | null>(null);
  const [subReason, setSubReason] = useState<string | null>(null);
  const [detailedReason, setDetailedReason] = useState('');
  const [currentStep, setCurrentStep] = useState<Step>('main');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedOwnerId, setResolvedOwnerId] = useState<string | undefined>(reelOwnerId);
  const { toast } = useToast();
  const { hideContent, hideProfile } = useHiddenContent();

  useEffect(() => {
    setResolvedOwnerId(reelOwnerId);
  }, [reelOwnerId]);

  // If the owner isn't provided by the caller, resolve it from existing post data.
  // This is auto-captured and never shown to the reporting user.
  useEffect(() => {
    if (!isOpen) return;
    if (resolvedOwnerId) return;

    let cancelled = false;

    (async () => {
      console.log('[REPORT] resolving post owner', { post_id: reelId, post_type: postType });

      const { data, error } = await gateway
        .from('posts')
        .select('user_id')
        .eq('id', reelId)
        .maybeSingle();

      if (error) {
        console.error('[REPORT] ERROR: failed to resolve post owner', error);
        return;
      }

      const ownerId = (data as any)?.user_id as string | undefined;
      if (!ownerId) {
        console.error('[REPORT] ERROR: post owner not found', { post_id: reelId, post_type: postType });
        return;
      }

      if (!cancelled) setResolvedOwnerId(ownerId);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, reelId, postType, resolvedOwnerId]);

  const getMainReasonLabel = (id: string) => MAIN_REASONS.find(r => r.id === id)?.label || id;
  const getSubReasonLabel = (id: string, mainId: string) => 
    SUB_REASONS[mainId]?.find(r => r.id === id)?.label || id;

  const handleMainReasonClick = (reasonId: string) => {
    setMainReason(reasonId);
    setSubReason(null);
    
    if (reasonId === 'INTELLECTUAL_PROPERTY') {
      // Redirect to external form - no DB insert
      setCurrentStep('copyright');
    } else if (reasonId === 'DONT_WANT_TO_SEE') {
      // Hide/block actions - no report insert
      setCurrentStep('dont-want');
    } else if (SUB_REASONS[reasonId]) {
      // Has sub-reasons
      setCurrentStep('sub');
    } else {
      // Direct to review (shouldn't happen with current config)
      setCurrentStep('review');
    }
  };

  const handleSubReasonClick = (subReasonId: string) => {
    setSubReason(subReasonId);
    setCurrentStep('review');
  };

  const handleBack = () => {
    if (currentStep === 'review') {
      if (subReason && mainReason && SUB_REASONS[mainReason]) {
        setSubReason(null);
        setCurrentStep('sub');
      } else {
        setMainReason(null);
        setCurrentStep('main');
      }
    } else if (currentStep === 'sub' || currentStep === 'copyright' || currentStep === 'dont-want') {
      setMainReason(null);
      setCurrentStep('main');
    }
  };

  // Handle "don't want to see" actions - NO REPORT INSERT
  const handleDontWantAction = async (actionId: string) => {
    if (!resolvedOwnerId && (actionId === 'hide-all' || actionId === 'block-creator')) {
      toast({
        title: 'Error',
        description: 'Unable to identify the content creator.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (actionId === 'hide-post') {
        // Insert into hidden_content
        console.log(`[HIDE] Hiding single post content_id=${reelId} type=${postType}`);
        await hideContent(reelId, postType === 'normal_post' ? 'normal_post' : postType as 'reel' | 'video' | 'normal_post');
        toast({
          title: 'Content hidden',
          description: "You won't see this content anymore.",
        });
      } else if (actionId === 'hide-all') {
        // Insert profile into hidden_content
        console.log(`[HIDE] Hiding all content from profile_id=${resolvedOwnerId}`);
        await hideProfile(resolvedOwnerId!);
        toast({
          title: 'Creator hidden',
          description: "You won't see content from this creator anymore.",
        });
      } else if (actionId === 'block-creator') {
        // Insert into blocks table
        console.log(`[BLOCK] Blocking user_id=${resolvedOwnerId}`);
        const { data: { user } } = await gateway.auth.getUser();
        if (!user) throw new Error('Not logged in');

        const { error } = await gateway.from('blocks').insert({
          blocker_id: user.id,
          blocked_id: resolvedOwnerId!,
        });

        if (error && error.code !== '23505') throw error;

        toast({
          title: 'Creator blocked',
          description: 'You and this creator can no longer see or interact with each other.',
        });
      }

      setCurrentStep('success');
    } catch (error) {
      console.error('[DONT_WANT] Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to complete action. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate post URL based on post type (auto-captured, never shown to user)
  const generatePostUrl = (): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    switch (postType) {
      case 'reel':
        return `${origin}/reels/${reelId}`;
      case 'video':
        return `${origin}/video/${reelId}`;
      case 'normal_post':
      default:
        return `${origin}/post/${reelId}`;
    }
  };

  // Submit actual report to reported_posts table
  const handleSubmitReport = async () => {
    if (!mainReason) return;

    // VALIDATION: post_owner_id must exist
    if (!resolvedOwnerId) {
      console.error('[REPORT] ERROR: post_owner_id is missing - cannot submit report');
      toast({
        title: 'Error',
        description: 'Unable to identify content owner. Report cannot be submitted.',
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
          description: 'You must be logged in to report content.',
          variant: 'destructive',
        });
        return;
      }

      // VALIDATION: Cannot report own content
      if (user.id === resolvedOwnerId) {
        console.error('[REPORT] ERROR: Cannot report your own content');
        toast({
          title: 'Error',
          description: 'You cannot report your own content.',
          variant: 'destructive',
        });
        return;
      }

      // Auto-generate post_url (never shown to user)
      const postUrl = generatePostUrl();
      if (!postUrl || !postUrl.startsWith('http')) {
        console.error('[REPORT] ERROR: post_url is invalid - cannot submit report', { postUrl });
        toast({
          title: 'Error',
          description: 'Unable to generate a valid post URL. Report cannot be submitted.',
          variant: 'destructive',
        });
        return;
      }

      const reportPayload = {
        post_id: reelId,
        reported_by: user.id,
        post_owner_id: resolvedOwnerId, // Required, validated above
        post_url: postUrl, // Auto-generated, never shown to user
        post_type: postType,
        main_reason: mainReason,
        sub_reason: subReason || null,
        detailed_reason: detailedReason.trim() || null,
        reason: subReason || mainReason, // Legacy field
        status: 'pending',
      };

      console.log('[REPORT] submitting report', {
        post_id: reportPayload.post_id,
        post_owner_id: reportPayload.post_owner_id,
        post_url: reportPayload.post_url,
        main_reason: reportPayload.main_reason,
        sub_reason: reportPayload.sub_reason,
      });

      const { data, error } = await gateway
        .from('reported_posts')
        .insert(reportPayload)
        .select('id')
        .single();

      if (error) {
        // Handle duplicate report error
        if (error.code === '23505') {
          console.warn('[REPORT] Duplicate report detected');
          toast({
            title: 'Already reported',
            description: 'You have already reported this content.',
            variant: 'destructive',
          });
          return;
        }
        throw error;
      }

      console.log(`[REPORT] success id=${data.id}`);
      setCurrentStep('success');
    } catch (error: any) {
      console.error('[REPORT] Error submitting report:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setMainReason(null);
    setSubReason(null);
    setDetailedReason('');
    setCurrentStep('main');
    onClose();
  };

  // SUCCESS STATE
  if (currentStep === 'success') {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md bg-card">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {mainReason === 'DONT_WANT_TO_SEE' 
                ? 'Your feedback has been received'
                : 'Thank you for helping us improve the community'}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {mainReason === 'DONT_WANT_TO_SEE'
                ? 'Your input helps us improve your experience.'
                : 'Your report has been submitted and will be reviewed shortly.'}
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
      <DialogContent className="sm:max-w-md bg-card max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground text-center flex items-center justify-center gap-2">
            {currentStep !== 'main' && (
              <button 
                onClick={handleBack}
                className="absolute left-4 p-1 rounded-full hover:bg-accent"
              >
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </button>
            )}
            Report
          </DialogTitle>
        </DialogHeader>
        
        {/* STEP 1: Main Reasons */}
        {currentStep === 'main' && (
          <div className="space-y-1 mt-2">
            <h3 className="text-base font-semibold text-foreground">
              What's the issue with this content?
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Your report helps us keep the community safe.
            </p>
            
            {MAIN_REASONS.map((reason) => (
              <button
                key={reason.id}
                onClick={() => handleMainReasonClick(reason.id)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors bg-secondary hover:bg-accent border border-transparent"
              >
                <span className="text-sm font-medium text-foreground">{reason.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* STEP 2: Sub Reasons */}
        {currentStep === 'sub' && mainReason && SUB_REASONS[mainReason] && (
          <div className="space-y-1 mt-2">
            <h3 className="text-base font-semibold text-foreground">
              What best explains the issue?
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Select the option that best describes the problem.
            </p>
            
            {SUB_REASONS[mainReason].map((reason) => (
              <button
                key={reason.id}
                onClick={() => handleSubReasonClick(reason.id)}
                disabled={isSubmitting}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors bg-secondary hover:bg-accent border border-transparent disabled:opacity-50"
              >
                <span className="text-sm font-medium text-foreground">{reason.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* COPYRIGHT - External redirect, no DB insert */}
        {currentStep === 'copyright' && (
          <div className="space-y-4 mt-2">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Reporting a copyright or ownership concern
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                To proceed with this report, additional information is required through our Help Center form.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Please copy the reference code below before continuing.
              </p>
            </div>
            
            <div className="bg-secondary rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-2">Reference code</p>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm font-mono text-foreground flex-1 break-all">
                  {reelId}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(reelId);
                    toast({
                      title: 'Copied',
                      description: 'Reference code copied to clipboard',
                    });
                  }}
                  className="flex items-center gap-1"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </Button>
              </div>
            </div>
            
            <Button 
              onClick={() => {
                window.open('/help/copyright-form', '_blank');
                handleClose();
              }}
              className="w-full flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Proceed to report
            </Button>
          </div>
        )}

        {/* DON'T WANT TO SEE - Hide/Block actions, NO report insert */}
        {currentStep === 'dont-want' && (
          <div className="space-y-4 mt-2">
            <div className="flex flex-col items-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2 text-center">
                Your feedback has been received
              </h3>
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Your input helps us improve your experience.
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">
                Additional actions you may consider
              </h4>
              <div className="space-y-2">
                {DONT_WANT_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleDontWantAction(action.id)}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors bg-secondary hover:bg-accent border border-transparent disabled:opacity-50"
                  >
                    <div className="text-left">
                      <span className="text-sm font-medium text-foreground block">{action.label}</span>
                      <span className="text-xs text-muted-foreground">{action.description}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
            
            <Button variant="outline" onClick={handleClose} className="w-full mt-4">
              Done
            </Button>
          </div>
        )}

        {/* REVIEW & SUBMIT - Writes to reported_posts */}
        {currentStep === 'review' && (
          <div className="space-y-4 mt-2">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Review your report
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Reports are reviewed according to our platform rules.
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Report details</h4>
              <div className="space-y-2">
                <div className="bg-secondary rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground">Main reason</p>
                  <p className="text-sm font-medium text-foreground">
                    {mainReason ? getMainReasonLabel(mainReason) : '-'}
                  </p>
                </div>
                
                {subReason && mainReason && (
                  <div className="bg-secondary rounded-lg px-4 py-3">
                    <p className="text-xs text-muted-foreground">Specific issue</p>
                    <p className="text-sm font-medium text-foreground">
                      {getSubReasonLabel(subReason, mainReason)}
                    </p>
                  </div>
                )}

                <div className="bg-secondary rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground">Content type</p>
                  <p className="text-sm font-medium text-foreground capitalize">
                    {postType.replace('_', ' ')}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Additional details (optional)
              </label>
              <Textarea
                value={detailedReason}
                onChange={(e) => setDetailedReason(e.target.value)}
                placeholder="Provide any additional context..."
                className="min-h-[80px] resize-none"
                disabled={isSubmitting}
              />
            </div>
            
            <Button 
              onClick={handleSubmitReport} 
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Submitting...' : 'Submit report'}
            </Button>
          </div>
        )}

        {/* Cancel button on main step */}
        {currentStep === 'main' && (
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReelReportModal;
