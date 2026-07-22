import { useState } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface ReportData {
  reelId: string;
  reelOwnerId?: string;
  mainReason: string;
  subReason?: string;
  detailedReason?: string;
  description?: string;
}

interface ReportResult {
  success: boolean;
  error?: string;
}

/**
 * Hook for submitting reel reports with multi-step reason tracking.
 * Follows Facebook-like report flow with main reason, sub-reason, and detailed reason.
 */
export const useReelReport = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const submitReport = async (data: ReportData): Promise<ReportResult> => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to report content.',
        variant: 'destructive',
      });
      return { success: false, error: 'Not authenticated' };
    }

    setIsSubmitting(true);

    try {
      // Construct the reason string for legacy compatibility
      const reason = data.subReason || data.mainReason;

      console.log('[REPORT] Submitting:', {
        reel_id: data.reelId,
        main_reason: data.mainReason,
        sub_reason: data.subReason,
        detailed_reason: data.detailedReason,
      });

      const { error } = await gateway.from('reel_reports').insert({
        reel_id: data.reelId,
        reel_owner_id: data.reelOwnerId || null,
        reported_by: user.id,
        reason: reason,
        post_type: 'reel',
        main_reason: data.mainReason,
        sub_reason: data.subReason || null,
        detailed_reason: data.detailedReason || null,
        description: data.description || null,
        status: 'pending',
      });

      if (error) throw error;

      toast({
        title: 'Report submitted',
        description: 'Thank you for helping keep our community safe.',
      });

      return { success: true };
    } catch (error: any) {
      console.error('[REPORT] Error submitting report:', error);
      
      toast({
        title: 'Error',
        description: 'Failed to submit report. Please try again.',
        variant: 'destructive',
      });

      return { success: false, error: error.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if user has already reported this reel
  const hasReported = async (reelId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await gateway
        .from('reel_reports')
        .select('id')
        .eq('reel_id', reelId)
        .eq('reported_by', user.id)
        .limit(1);

      if (error) throw error;
      return (data?.length || 0) > 0;
    } catch (error) {
      console.error('[REPORT] Error checking report status:', error);
      return false;
    }
  };

  return {
    submitReport,
    hasReported,
    isSubmitting,
  };
};

/**
 * Hook for submitting post reports with multi-step reason tracking.
 */
export const usePostReport = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const submitReport = async (data: {
    postId: string;
    postOwnerId?: string;
    postType: 'normal_post' | 'video' | 'story';
    mainReason: string;
    subReason?: string;
    detailedReason?: string;
    description?: string;
  }): Promise<ReportResult> => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to report content.',
        variant: 'destructive',
      });
      return { success: false, error: 'Not authenticated' };
    }

    setIsSubmitting(true);

    try {
      const reason = data.subReason || data.mainReason;

      console.log('[REPORT] Submitting post report:', {
        post_id: data.postId,
        post_type: data.postType,
        main_reason: data.mainReason,
        sub_reason: data.subReason,
      });

      const { error } = await gateway.from('reported_posts').insert({
        post_id: data.postId,
        post_owner_id: data.postOwnerId || null,
        reported_by: user.id,
        reason: reason,
        post_type: data.postType,
        main_reason: data.mainReason,
        sub_reason: data.subReason || null,
        detailed_reason: data.detailedReason || null,
        description: data.description || null,
        status: 'pending',
      });

      if (error) throw error;

      toast({
        title: 'Report submitted',
        description: 'Thank you for helping keep our community safe.',
      });

      return { success: true };
    } catch (error: any) {
      console.error('[REPORT] Error submitting post report:', error);
      
      toast({
        title: 'Error',
        description: 'Failed to submit report. Please try again.',
        variant: 'destructive',
      });

      return { success: false, error: error.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    submitReport,
    isSubmitting,
  };
};
