import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import {
  Shield, User, Bell, AlertTriangle, CheckCircle, XCircle,
  MessageSquare, Lock, Eye, ChevronRight, Gift, Mail
} from 'lucide-react';

const SettingsLanding: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [blockCount, setBlockCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      checkMFA(),
      fetchBlockCount(),
      fetchReportCount(),
    ]).finally(() => setLoading(false));
  }, [user]);

  const checkMFA = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!error) {
        const verified = data.totp.some(f => f.status === 'verified');
        setMfaEnabled(verified);
      }
    } catch (e) { console.warn('MFA check failed', e); }
  };

  const fetchBlockCount = async () => {
    const { count } = await supabase
      .from('blocks')
      .select('*', { count: 'exact', head: true })
      .eq('blocker_id', user?.id);
    setBlockCount(count || 0);
  };

  const fetchReportCount = async () => {
    const { count } = await supabase
      .from('profile_reports')
      .select('*', { count: 'exact', head: true })
      .eq('reported_user_id', user?.id);
    setReportCount(count || 0);
  };

  const birthdaySet = !!profile?.birthday;
  const emailVerified = user?.email_confirmed_at || false;

  const pendingItems: { label: string; icon: React.ElementType; done: boolean; action: string; section: string }[] = [
    { label: 'Birthday set', icon: Gift, done: birthdaySet, action: 'Set your birthday', section: 'personal' },
    { label: 'Two-factor authentication', icon: Shield, done: mfaEnabled, action: 'Enable 2FA', section: 'security' },
    { label: 'Email verified', icon: Mail, done: emailVerified, action: 'Verify your email', section: 'personal' },
  ];

  const pendingCount = pendingItems.filter(i => !i.done).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome to your account settings</h2>
        <p className="text-muted-foreground">
          Manage your profile, security, privacy, and more.
        </p>
      </div>

      {pendingCount > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
              <Badge variant="secondary" className="ml-auto text-xs">{pendingCount} pending</Badge>
            </div>
            <Separator />
            {pendingItems.map((item) => (
              !item.done && (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{item.action}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate(item.section === 'security' ? '/settings/security' : '/settings/details')}>
                    Go <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              )
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-foreground">Account status</h3>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
              {mfaEnabled ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
              <span className="text-xs text-muted-foreground">2FA {mfaEnabled ? 'enabled' : 'not set up'}</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{blockCount} user{blockCount !== 1 ? 's' : ''} blocked</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Messaging: active</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Posting: active</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Commenting: active</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
              {reportCount > 0 ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <CheckCircle className="w-4 h-4 text-green-500" />}
              <span className="text-xs text-muted-foreground">{reportCount > 0 ? `${reportCount} report${reportCount !== 1 ? 's' : ''}` : 'No violations'}</span>
            </div>
          </div>
          {reportCount > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              You have {reportCount} report{reportCount !== 1 ? 's' : ''} filed against your account.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-0">
          <button onClick={() => navigate('/settings/details')} className="w-full flex items-center justify-between px-4 py-4 hover:bg-accent/50 transition-colors text-left">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground text-sm">Personal details</p>
                <p className="text-xs text-muted-foreground">Profile, name, birthday, contact info</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
          <Separator />
          <button onClick={() => navigate('/settings/security')} className="w-full flex items-center justify-between px-4 py-4 hover:bg-accent/50 transition-colors text-left">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground text-sm">Password and security</p>
                <p className="text-xs text-muted-foreground">Change password, two-factor authentication</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsLanding;
