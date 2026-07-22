import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export type ReportReason = 'fake_account' | 'harassment' | 'inappropriate_content' | 'other';

interface ProfileReport {
  id: string;
  reported_user_id: string;
  reporter_user_id: string;
  reason: ReportReason;
  description: string | null;
  image_url?: string | null;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
  updated_at: string;
}

export const useProfileReports = (reportedUserId?: string) => {
  const [hasReported, setHasReported] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const uploadReportEvidence = async (file: File, reporterUserId: string) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${reporterUserId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await gateway.storage
        .from('report-evidence')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = gateway.storage
        .from('report-evidence')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading evidence:', error);
      throw error;
    }
  };

  const submitReport = async (
    targetUserId: string,
    reason: ReportReason,
    description?: string,
    evidenceFile?: File
  ) => {
    if (!user) return false;

    setLoading(true);
    try {
      // Check for existing pending report first
      const { data: existingReport } = await gateway
        .from('profile_reports')
        .select('id, status')
        .eq('reported_user_id', targetUserId)
        .eq('reporter_user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingReport) {
        toast({
          title: "Report already exists",
          description: "You already reported this profile. Our team is reviewing it.",
          variant: "destructive"
        });
        return false;
      }

      let imageUrl;
      if (evidenceFile) {
        imageUrl = await uploadReportEvidence(evidenceFile, user.id);
      }

      const { error } = await gateway
        .from('profile_reports')
        .insert({
          reported_user_id: targetUserId,
          reporter_user_id: user.id,
          reason,
          description: description?.trim() || null,
          image_url: imageUrl
        });

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          toast({
            title: 'Already Reported',
            description: 'You have already reported this profile. Our team is reviewing it.',
            variant: 'destructive'
          });
        } else {
          throw error;
        }
        return false;
      }

      toast({
        title: 'Thank you',
        description: 'Your report has been submitted. Our team will review it shortly.'
      });

      setHasReported(true);
      return true;
    } catch (error: any) {
      console.error('Error submitting report:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit report. Please try again.',
        variant: 'destructive'
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const checkExistingReport = async () => {
    if (!user || !reportedUserId) return;

    setLoading(true);
    try {
      const { data, error } = await gateway
        .from('profile_reports')
        .select('id, status')
        .eq('reported_user_id', reportedUserId)
        .eq('reporter_user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
        throw error;
      }

      setHasReported(!!data);
    } catch (error: any) {
      console.error('Error checking existing report:', error);
      toast({
        title: 'Error',
        description: 'Failed to check report status.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshReportStatus = () => {
    checkExistingReport();
  };

  useEffect(() => {
    if (reportedUserId && user) {
      checkExistingReport();
    }
  }, [reportedUserId, user?.id]);

  return {
    hasReported,
    loading,
    refreshReportStatus,
    submitReport
  };
};

export const useAdminReports = () => {
  const [reports, setReports] = useState<ProfileReport[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchAllReports = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await gateway
        .from('profile_reports')
        .select(`
          *,
          reported_profile:reported_user_id(username, display_name),
          reporter_profile:reporter_user_id(username, display_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setReports(data || []);
    } catch (error: any) {
      console.error('Error fetching reports:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch reports.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const updateReportStatus = async (reportId: string, status: 'reviewed' | 'resolved') => {
    try {
      const { error } = await gateway
        .from('profile_reports')
        .update({ status })
        .eq('id', reportId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Report marked as ${status}.`
      });

      // Refresh the reports list
      fetchAllReports();
    } catch (error: any) {
      console.error('Error updating report:', error);
      toast({
        title: 'Error',
        description: 'Failed to update report status.',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    if (user) {
      fetchAllReports();
    }
  }, [user?.id]);

  return {
    reports,
    loading,
    fetchAllReports,
    updateReportStatus
  };
};