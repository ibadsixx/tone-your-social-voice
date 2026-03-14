import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePhotoUpload } from '@/hooks/usePhotoUpload';
import { supabase } from '@/integrations/supabase/client';
import PhotoUploadDialog from '@/components/PhotoUploadDialog';
import YourInformationAndPermissions from '@/components/YourInformationAndPermissions';
import ProfilesAndPersonalDetails from '@/components/settings/ProfilesAndPersonalDetails';
import AdPreferences from '@/components/AdPreferences';
import PrivacyCheckup from '@/components/PrivacyCheckup';
import QRCode from 'qrcode';
import { 
  User, 
  Shield, 
  Info, 
  Target, 
  Eye, 
  Activity,
  Camera,
  Save,
  Trash2,
  ExternalLink,
  AlertCircle,
  Check,
  EyeOff,
  Copy,
  QrCode,
  Loader2,
  UserX,
  Settings as SettingsIcon,
  Hash
} from 'lucide-react';
import BlockingSettings from '@/components/BlockingSettings';
import { AdminReportsManager } from '@/components/AdminReportsManager';
import { useHashtagNotificationSettings } from '@/hooks/useHashtagNotificationSettings';
import NotificationSettings from '@/components/NotificationSettings';
import ActivityLog from '@/components/ActivityLog';

// Define types for the sidebar menu and form data
type SidebarOption = {
  id: string;
  title: string;
  icon: React.ElementType;
};

type PersonalDetails = {
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  profilePhoto: string;
};

type PasswordData = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type TOTPData = {
  secret: string;
  qr_code: string;
  verification_code: string;
  factor_id?: string;
  challenge_id?: string;
  enabled: boolean;
};

type PasswordVisibility = {
  current: boolean;
  new: boolean;
  confirm: boolean;
};

const Settings = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { uploadPhoto, uploading } = usePhotoUpload();
  const { enabled: hashtagNotificationsEnabled, loading: hashtagNotifLoading, toggleNotifications: toggleHashtagNotifications } = useHashtagNotificationSettings();
  
  // State for active sidebar option
  const [activeSection, setActiveSection] = useState('personal');
  
  // Check if user is admin (simple check - you can enhance this with proper role system)
  const [isAdmin, setIsAdmin] = useState(false);
  
  // State for personal details form
  const [personalDetails, setPersonalDetails] = useState<PersonalDetails>({
    firstName: '',
    lastName: '',
    email: '',
    bio: '',
    profilePhoto: ''
  });

  // Load user data on component mount
  useEffect(() => {
    if (user) {
      loadUserData();
      checkAdminStatus();
    }
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user?.id) return;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('bio, display_name')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      // Simple admin check - you can enhance this with proper role system
      const isUserAdmin = profile.bio?.toLowerCase().includes('admin') || 
                         profile.display_name?.toLowerCase().includes('admin');
      setIsAdmin(isUserAdmin);
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const loadUserData = async () => {
    if (!user?.id) return;

    try {
      // Get profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      // Split display name into first and last name
      const nameParts = profile.display_name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      setPersonalDetails({
        firstName,
        lastName,
        email: user.email || '',
        bio: profile.bio || '',
        profilePhoto: profile.profile_pic || ''
      });
    } catch (error) {
      console.error('Error loading user data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load user data',
        variant: 'destructive'
      });
    }
  };
  
  // State for password form
  const [passwordData, setPasswordData] = useState<PasswordData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // State for password visibility toggles
  const [passwordVisibility, setPasswordVisibility] = useState<PasswordVisibility>({
    current: false,
    new: false,
    confirm: false
  });
  
  // State for TOTP/2FA
  const [totpData, setTotpData] = useState<TOTPData>({
    secret: '',
    qr_code: '',
    verification_code: '',
    factor_id: undefined,
    challenge_id: undefined,
    enabled: false
  });
  
  // Loading states
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpSetupLoading, setTotpSetupLoading] = useState(false);
  
  // State for privacy settings
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: true,
    postsVisibility: true,
    activityStatus: false,
    dataCollection: true
  });

  const sidebarOptions: SidebarOption[] = [
    { id: 'personal', title: 'Personal details', icon: User },
    { id: 'security', title: 'Password and security', icon: Shield },
    { id: 'permissions', title: 'Your information and permissions', icon: Info },
    { id: 'ads', title: 'Ad preferences', icon: Target },
    { id: 'privacy', title: 'Privacy Checkup', icon: Eye },
    { id: 'activity', title: 'Your activity', icon: Activity },
    { id: 'notifications', title: 'Notification Settings', icon: Hash },
    { id: 'blocked', title: 'Blocked Users', icon: UserX },
    ...(isAdmin ? [{ id: 'admin', title: 'Admin Reports', icon: SettingsIcon }] : [])
  ];

  // Handle form submissions with validation
  const handlePersonalDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personalDetails.firstName || !personalDetails.lastName || !personalDetails.email) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
        variant: 'destructive'
      });
      return;
    }

    if (!user?.id) return;

    try {
      // Update profile in database
      const displayName = `${personalDetails.firstName} ${personalDetails.lastName}`.trim();
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          bio: personalDetails.bio
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Update email in auth if changed
      if (personalDetails.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: personalDetails.email
        });

        if (emailError) throw emailError;
      }
      
      toast({
        title: 'Success',
        description: 'Personal details updated successfully!'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update personal details',
        variant: 'destructive'
      });
    }
  };

  const handlePhotoUpload = async (file: File, customText?: string) => {
    if (!user?.id) return;
    
    try {
      const publicUrl = await uploadPhoto(file, 'profile', user.id, customText);
      setPersonalDetails(prev => ({ ...prev, profilePhoto: publicUrl }));
    } catch (error) {
      // Error handled in the hook
    }
  };

  // Check for existing MFA factors on component mount
  useEffect(() => {
    if (user) {
      checkExistingMFA();
    }
  }, [user]);

  const checkExistingMFA = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const totpFactor = data.totp.find(factor => factor.status === 'verified');
      if (totpFactor) {
        setTotpData(prev => ({
          ...prev,
          enabled: true,
          factor_id: totpFactor.id
        }));
      }
    } catch (error: any) {
      console.error('Error checking MFA status:', error);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);

    try {
      // Validate form data
      if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
        throw new Error('Please fill in all password fields');
      }

      if (passwordData.newPassword !== passwordData.confirmPassword) {
        throw new Error('New password and confirmation do not match');
      }

      if (passwordData.newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      // Check password strength
      const hasUppercase = /[A-Z]/.test(passwordData.newPassword);
      const hasLowercase = /[a-z]/.test(passwordData.newPassword);
      const hasNumbers = /\d/.test(passwordData.newPassword);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(passwordData.newPassword);

      if (!hasUppercase || !hasLowercase || !hasNumbers || !hasSpecial) {
        throw new Error('Password must contain uppercase, lowercase, numbers, and special characters');
      }

      // First verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: passwordData.currentPassword
      });

      if (signInError) {
        throw new Error('Current password is incorrect');
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (updateError) throw updateError;

      toast({
        title: 'Success',
        description: 'Password updated successfully!'
      });

      // Reset form
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordVisibility({ current: false, new: false, confirm: false });

    } catch (error: any) {
      toast({
        title: 'Password Update Failed',
        description: error.message || 'Failed to update password',
        variant: 'destructive'
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const togglePasswordVisibility = (field: keyof PasswordVisibility) => {
    setPasswordVisibility(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const setupTOTP = async () => {
    setTotpSetupLoading(true);
    
    try {
      // Step 1: Enroll a new TOTP factor
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Tone Authenticator'
      });

      if (error) throw error;

      // Generate QR code from the URI
      const qrCodeDataUrl = await QRCode.toDataURL(data.totp.uri);

      setTotpData(prev => ({
        ...prev,
        secret: data.totp.secret,
        qr_code: qrCodeDataUrl,
        factor_id: data.id
      }));

    } catch (error: any) {
      toast({
        title: 'TOTP Setup Failed',
        description: error.message || 'Failed to setup two-factor authentication',
        variant: 'destructive'
      });
    } finally {
      setTotpSetupLoading(false);
    }
  };

  const verifyTOTP = async () => {
    if (!totpData.verification_code || !totpData.factor_id) return;
    
    setTotpLoading(true);

    try {
      // Step 2: Challenge the factor
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpData.factor_id
      });

      if (challengeError) throw challengeError;

      // Step 3: Verify the TOTP code
      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpData.factor_id,
        challengeId: challengeData.id,
        code: totpData.verification_code
      });

      if (verifyError) throw verifyError;

      setTotpData(prev => ({
        ...prev,
        enabled: true,
        verification_code: '',
        challenge_id: challengeData.id
      }));

      toast({
        title: 'Success',
        description: 'Two-factor authentication enabled successfully!'
      });

    } catch (error: any) {
      toast({
        title: 'Verification Failed',
        description: error.message || 'Invalid verification code',
        variant: 'destructive'
      });
    } finally {
      setTotpLoading(false);
    }
  };

  const disableTOTP = async () => {
    if (!totpData.factor_id) return;

    setTotpLoading(true);

    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: totpData.factor_id
      });

      if (error) throw error;

      setTotpData({
        secret: '',
        qr_code: '',
        verification_code: '',
        factor_id: undefined,
        challenge_id: undefined,
        enabled: false
      });

      toast({
        title: 'Success',
        description: 'Two-factor authentication disabled'
      });

    } catch (error: any) {
      toast({
        title: 'Disable Failed',
        description: error.message || 'Failed to disable two-factor authentication',
        variant: 'destructive'
      });
    } finally {
      setTotpLoading(false);
    }
  };

  const copySecretToClipboard = () => {
    navigator.clipboard.writeText(totpData.secret);
    toast({
      title: 'Copied',
      description: 'Secret copied to clipboard'
    });
  };

  const handlePrivacyUpdate = (setting: string, value: boolean) => {
    setPrivacySettings(prev => ({ ...prev, [setting]: value }));
    toast({
      title: 'Privacy Settings Updated',
      description: `${setting} has been ${value ? 'enabled' : 'disabled'}.`
    });
  };

  // Render content based on active section
  const renderContent = () => {
    switch (activeSection) {
      case 'personal':
        return <ProfilesAndPersonalDetails />;

      case 'security':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Password and Security</h2>
              <p className="text-muted-foreground">Keep your account secure with a strong password and multi-factor authentication.</p>
            </div>
            
            {/* Password Change Section */}
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Change Password
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password *</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={passwordVisibility.current ? "text" : "password"}
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                        className="focus:ring-primary pr-10"
                        placeholder="Enter your current password"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility('current')}
                      >
                        {passwordVisibility.current ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password *</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={passwordVisibility.new ? "text" : "password"}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                        className="focus:ring-primary pr-10"
                        placeholder="Enter your new password"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility('new')}
                      >
                        {passwordVisibility.new ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must be at least 8 characters with uppercase, lowercase, numbers, and special characters
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password *</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={passwordVisibility.confirm ? "text" : "password"}
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        className="focus:ring-primary pr-10"
                        placeholder="Confirm your new password"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility('confirm')}
                      >
                        {passwordVisibility.confirm ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="bg-primary hover:bg-primary/90" 
                    disabled={passwordLoading}
                  >
                    {passwordLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating Password...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Update Password
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </form>

            {/* Two-Factor Authentication Section */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <QrCode className="w-5 h-5" />
                  Two-Factor Authentication (TOTP)
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Add an extra layer of security using an authenticator app like Google Authenticator, Authy, or 1Password.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {!totpData.enabled && !totpData.qr_code && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Authenticator App (TOTP)</p>
                        <p className="text-sm text-muted-foreground">Use Google Authenticator, Authy, or similar apps</p>
                      </div>
                      <Button 
                        onClick={setupTOTP}
                        disabled={totpSetupLoading}
                        variant="outline"
                      >
                        {totpSetupLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Setting up...
                          </>
                        ) : (
                          'Enable'
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {totpData.qr_code && !totpData.enabled && (
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <h4 className="font-medium mb-3">Setup Instructions</h4>
                      
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-3">
                            1. Scan this QR code with your authenticator app:
                          </p>
                          <div className="flex justify-center p-4 bg-white rounded-lg">
                            <img src={totpData.qr_code} alt="TOTP QR Code" className="w-48 h-48" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            2. Or manually enter this secret in your app:
                          </p>
                          <div className="flex items-center gap-2">
                            <Input
                              value={totpData.secret}
                              readOnly
                              className="font-mono text-xs"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={copySecretToClipboard}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            3. Enter the 6-digit code from your authenticator app:
                          </p>
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              maxLength={6}
                              placeholder="000000"
                              value={totpData.verification_code}
                              onChange={(e) => setTotpData(prev => ({ 
                                ...prev, 
                                verification_code: e.target.value.replace(/\D/g, '') 
                              }))}
                              className="font-mono text-center text-lg w-32"
                            />
                            <Button
                              onClick={verifyTOTP}
                              disabled={totpLoading || totpData.verification_code.length !== 6}
                              className="bg-primary hover:bg-primary/90"
                            >
                              {totpLoading ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Verifying...
                                </>
                              ) : (
                                <>
                                  <Check className="w-4 h-4 mr-2" />
                                  Verify & Enable
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {totpData.enabled && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 border-green-200">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <Check className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-green-900">Two-Factor Authentication Enabled</p>
                          <p className="text-sm text-green-700">Your account is protected with TOTP authentication</p>
                        </div>
                      </div>
                      <Button 
                        onClick={disableTOTP}
                        disabled={totpLoading}
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                      >
                        {totpLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Disabling...
                          </>
                        ) : (
                          'Disable'
                        )}
                      </Button>
                    </div>

                    <div className="p-4 border rounded-lg bg-yellow-50 border-yellow-200">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-yellow-900">Backup Codes</p>
                          <p className="text-sm text-yellow-700 mt-1">
                            Make sure to save your recovery codes in a safe place. You'll need them to access your account if you lose your authenticator device.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'permissions':
        return <YourInformationAndPermissions />;

      case 'ads':
        return <AdPreferences />;

      case 'privacy':
        return <PrivacyCheckup />;

      case 'activity':
        return <ActivityLog />;

      case 'blocked':
        return <BlockedUsersManager />;

      case 'notifications':
        return <NotificationSettings />;

      case 'admin':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Admin Reports</h2>
              <p className="text-muted-foreground">Manage and review reported profiles from the community.</p>
            </div>
            <AdminReportsManager />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar */}
          <div className="lg:col-span-1">
            <Card className="border-border/50 sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg">Settings</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <nav className="space-y-1">
                  {sidebarOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = activeSection === option.id;
                    
                    return (
                      <button
                        key={option.id}
                        onClick={() => setActiveSection(option.id)}
                        className={`w-full flex items-center space-x-3 px-4 py-3 text-left text-sm font-medium transition-all duration-200 rounded-none first:rounded-t-none last:rounded-b-lg ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{option.title}</span>
                      </button>
                    );
                  })}
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Right Content Area */}
          <div className="lg:col-span-3">
            <div className="transition-all duration-300 ease-in-out">
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;