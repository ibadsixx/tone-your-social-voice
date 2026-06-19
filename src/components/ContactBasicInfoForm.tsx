import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Plus, X, Save, Globe, Users, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateProfileVisibility, sanitizeProfilePayload, formatVisibilityForDb, normalizeVisibilityValue } from '@/utils/profileValidation';

interface ContactBasicInfoFormProps {
  profileId: string;
  isOwnProfile: boolean;
  onSave?: () => void;
}

interface ProfileData {
  email?: string;
  phone_country_code?: string;
  phone_number?: string;
  websites_social_links?: any;
  gender?: string;
  pronouns?: string;
  birth_date?: string;
  birth_year?: number;
  email_visibility?: string;
  phone_visibility?: string;
  websites_visibility?: string;
  gender_visibility?: string;
  pronouns_visibility?: string;
  birth_date_visibility?: string;
  birth_year_visibility?: string;
}

interface WebsiteLink {
  type: string;
  url: string;
  label: string;
}

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe, description: 'Anyone on Tone' },
  { value: 'friends', label: 'Friends', icon: Users, description: 'Your friends only' },
  { value: 'only_me', label: 'Only Me', icon: Lock, description: 'Only you can see this' }
];

const COUNTRY_CODES = [
  { code: '+1', country: 'US', flag: '🇺🇸', name: 'United States' },
  { code: '+44', country: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+33', country: 'FR', flag: '🇫🇷', name: 'France' },
  { code: '+49', country: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: '+39', country: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: '+34', country: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: '+213', country: 'DZ', flag: '🇩🇿', name: 'Algeria' },
  { code: '+212', country: 'MA', flag: '🇲🇦', name: 'Morocco' },
  { code: '+216', country: 'TN', flag: '🇹🇳', name: 'Tunisia' },
  { code: '+20', country: 'EG', flag: '🇪🇬', name: 'Egypt' },
  { code: '+966', country: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+971', country: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: '+91', country: 'IN', flag: '🇮🇳', name: 'India' },
  { code: '+86', country: 'CN', flag: '🇨🇳', name: 'China' },
  { code: '+81', country: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: '+82', country: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: '+61', country: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: '+55', country: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: '+52', country: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: '+7', country: 'RU', flag: '🇷🇺', name: 'Russia' }
];

const GENDER_OPTIONS = [
  'Male',
  'Female', 
  'Other',
  'Prefer not to say'
];

const PRONOUN_OPTIONS = [
  'He/Him',
  'She/Her',
  'They/Them',
  'Custom'
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const PrivacySelector = ({ 
  value, 
  onChange, 
  size = "sm" 
}: { 
  value: string; 
  onChange: (value: string) => void;
  size?: "sm" | "default";
}) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-auto", size === "sm" && "h-8")}>
        <SelectValue>
          {PRIVACY_OPTIONS.find(opt => opt.value === value)?.icon && (
            <div className="flex items-center gap-1">
              {React.createElement(PRIVACY_OPTIONS.find(opt => opt.value === value)!.icon, { 
                className: "w-3 h-3" 
              })}
              <span className="text-xs">{PRIVACY_OPTIONS.find(opt => opt.value === value)?.label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PRIVACY_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              <option.icon className="w-4 h-4" />
              <div>
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const ContactBasicInfoForm: React.FC<ContactBasicInfoFormProps> = ({ 
  profileId, 
  isOwnProfile, 
  onSave 
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ProfileData>({});
  const [websites, setWebsites] = useState<WebsiteLink[]>([]);
  const [newWebsite, setNewWebsite] = useState({ type: 'website', url: '', label: '' });
  const [viewerCanSeeFriend, setViewerCanSeeFriend] = useState(false);

  useEffect(() => {
    loadProfileData();
    if (!isOwnProfile) {
      checkFriendshipStatus();
    }
  }, [profileId, isOwnProfile]);

  const checkFriendshipStatus = async () => {
    if (!user?.id || isOwnProfile) {
      setViewerCanSeeFriend(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('friends')
        .select('status')
        .or(`and(requester_id.eq.${user.id},receiver_id.eq.${profileId}),and(requester_id.eq.${profileId},receiver_id.eq.${user.id})`)
        .eq('status', 'accepted')
        .maybeSingle();

      if (error) throw error;
      setViewerCanSeeFriend(!!data);
    } catch (error) {
      console.error('Error checking friendship:', error);
      setViewerCanSeeFriend(false);
    }
  };

  const loadProfileData = async () => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
          email,
          phone_country_code,
          phone_number,
          websites_social_links,
          gender,
          pronouns,
          birth_date,
          birth_year,
          email_visibility,
          phone_visibility,
          websites_visibility,
          gender_visibility,
          pronouns_visibility,
          birth_date_visibility,
          birth_year_visibility
        `)
        .eq('id', profileId)
        .single();

      if (error) throw error;

      const profileData = {
        ...profile,
        email: user?.email || profile.email,
        // Normalize visibility values on load
        email_visibility: normalizeVisibilityValue(profile.email_visibility) || 'public',
        phone_visibility: normalizeVisibilityValue(profile.phone_visibility) || 'public',
        websites_visibility: normalizeVisibilityValue(profile.websites_visibility) || 'public',
        gender_visibility: normalizeVisibilityValue(profile.gender_visibility) || 'public',
        pronouns_visibility: normalizeVisibilityValue(profile.pronouns_visibility) || 'public',
        birth_date_visibility: normalizeVisibilityValue(profile.birth_date_visibility) || 'public',
        birth_year_visibility: normalizeVisibilityValue(profile.birth_year_visibility) || 'public'
      };

      setFormData(profileData);
      const websitesData = profile.websites_social_links;
      setWebsites(
        Array.isArray(websitesData) 
          ? (websitesData as unknown as WebsiteLink[]).filter((item) => item && item.type && item.url && item.label)
          : []
      );
    } catch (error) {
      console.error('Error loading profile data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load profile data',
        variant: 'destructive'
      });
    }
  };

  const handleSave = async () => {
    if (!isOwnProfile) return;

    setLoading(true);
    try {
      // Build the update data using the sanitizer
      const updateData = {
        ...formData,
        websites_social_links: websites as any,
        phone_number: formData.phone_number?.trim() || null,
        phone_country_code: formData.phone_number?.trim() ? formData.phone_country_code : null,
      };

      // Apply sanitization which handles the proper casing for each field
      const sanitizedData = sanitizeProfilePayload(updateData);

      const { error } = await supabase
        .from('profiles')
        .update(sanitizedData)
        .eq('id', profileId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Contact and basic info updated successfully!'
      });

      onSave?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const addWebsite = () => {
    if (newWebsite.url && newWebsite.label) {
      setWebsites(prev => [...prev, { ...newWebsite }]);
      setNewWebsite({ type: 'website', url: '', label: '' });
    }
  };

  const removeWebsite = (index: number) => {
    setWebsites(prev => prev.filter((_, i) => i !== index));
  };

  const formatBirthDate = (birthDate?: string) => {
    if (!birthDate) return { day: '', month: '' };
    const date = new Date(birthDate);
    return {
      day: date.getDate().toString(),
      month: MONTHS[date.getMonth()]
    };
  };

  const setBirthDate = (day: string, month: string) => {
    if (day && month) {
      const monthIndex = MONTHS.indexOf(month);
      if (monthIndex !== -1) {
        const date = new Date(2000, monthIndex, parseInt(day));
        setFormData(prev => ({ 
          ...prev, 
          birth_date: date.toISOString().split('T')[0] 
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, birth_date: undefined }));
    }
  };

  const birthDateData = formatBirthDate(formData.birth_date);

  const canViewField = (visibility: string) => {
    if (isOwnProfile) return true;
    if (visibility === 'public') return true;
    if (visibility === 'friends') return viewerCanSeeFriend;
    if (visibility === 'only_me') return false;
    return true; // Default to true for public if visibility is not set
  };

  const getPrivacyLabel = (visibility: string) => {
    const option = PRIVACY_OPTIONS.find(opt => opt.value === visibility);
    return option ? `Visible to ${option.label === 'Public' ? 'Everyone' : option.label === 'Only Me' ? 'You Only' : option.label}` : '';
  };

  const hasAnyContactInfo = formData.email || (formData.phone_number && formData.phone_country_code) || websites.length > 0;
  const hasAnyBasicInfo = formData.gender || formData.pronouns || formData.birth_date || formData.birth_year;

  if (!isOwnProfile) {
    // Display mode for viewing other profiles
    return (
      <div className="space-y-4 md:space-y-6">
        {/* Contact Information */}
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4 p-4 md:p-6 pt-0 md:pt-0">
            {formData.email && canViewField(formData.email_visibility || 'public') ? (
              <div>
                <div className="text-xs md:text-sm text-foreground font-medium">Email: {formData.email}</div>
                <div className="text-xs text-muted-foreground">{getPrivacyLabel(formData.email_visibility || 'public')}</div>
              </div>
            ) : !canViewField(formData.email_visibility || 'public') && formData.email ? (
              <div className="text-xs md:text-sm text-muted-foreground">Email is private</div>
            ) : (
              <div className="text-xs md:text-sm text-muted-foreground">Add your email</div>
            )}
            
            {formData.phone_number && formData.phone_country_code && canViewField(formData.phone_visibility || 'public') ? (
              <div>
                <div className="text-xs md:text-sm text-foreground font-medium">
                  Phone: {formData.phone_country_code} {formData.phone_number}
                </div>
                <div className="text-xs text-muted-foreground">{getPrivacyLabel(formData.phone_visibility || 'public')}</div>
              </div>
            ) : !canViewField(formData.phone_visibility || 'public') && formData.phone_number && formData.phone_country_code ? (
              <div className="text-xs md:text-sm text-muted-foreground">Phone number is private</div>
            ) : (
              <div className="text-xs md:text-sm text-muted-foreground">Add your phone number</div>
            )}

            {websites.length > 0 && canViewField(formData.websites_visibility || 'public') ? (
              <div>
                <div className="text-xs md:text-sm text-foreground font-medium mb-1 md:mb-2">Websites and Social Links:</div>
                <div className="space-y-1 md:space-y-2">
                  {websites.map((website, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {website.type}
                      </Badge>
                      <a 
                        href={website.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs md:text-sm text-primary hover:underline break-all"
                      >
                        {website.label}
                      </a>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{getPrivacyLabel(formData.websites_visibility || 'public')}</div>
              </div>
            ) : !canViewField(formData.websites_visibility || 'public') && websites.length > 0 ? (
              <div className="text-xs md:text-sm text-muted-foreground">Websites and social links are private</div>
            ) : (
              <div className="text-xs md:text-sm text-muted-foreground">Add your websites and social links</div>
            )}

            {(!hasAnyContactInfo || (!canViewField(formData.email_visibility || 'public') && !canViewField(formData.phone_visibility || 'public') && !canViewField(formData.websites_visibility || 'public'))) && (
              <div className="text-xs md:text-sm text-muted-foreground italic">
                Add information to your contact and basic info section
              </div>
            )}
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4 p-4 md:p-6 pt-0 md:pt-0">
            {formData.gender && canViewField(formData.gender_visibility || 'public') ? (
              <div>
                <div className="text-xs md:text-sm text-foreground font-medium">Gender: {formData.gender}</div>
                <div className="text-xs text-muted-foreground">{getPrivacyLabel(formData.gender_visibility || 'public')}</div>
              </div>
            ) : !canViewField(formData.gender_visibility || 'public') && formData.gender ? (
              <div className="text-xs md:text-sm text-muted-foreground">Gender is private</div>
            ) : (
              <div className="text-xs md:text-sm text-muted-foreground">Add your gender</div>
            )}

            {formData.pronouns && canViewField(formData.pronouns_visibility || 'public') ? (
              <div>
                <div className="text-xs md:text-sm text-foreground font-medium">System pronouns: {formData.pronouns}</div>
                <div className="text-xs text-muted-foreground">{getPrivacyLabel(formData.pronouns_visibility || 'public')}</div>
              </div>
            ) : !canViewField(formData.pronouns_visibility || 'public') && formData.pronouns ? (
              <div className="text-xs md:text-sm text-muted-foreground">Pronouns are private</div>
            ) : (
              <div className="text-xs md:text-sm text-muted-foreground">Add your pronouns</div>
            )}

            {formData.birth_date && canViewField(formData.birth_date_visibility || 'public') ? (
              <div>
                <div className="text-xs md:text-sm text-foreground font-medium">
                  Birth Date: {birthDateData.day} {birthDateData.month}
                </div>
                <div className="text-xs text-muted-foreground">{getPrivacyLabel(formData.birth_date_visibility || 'public')}</div>
              </div>
            ) : !canViewField(formData.birth_date_visibility || 'public') && formData.birth_date ? (
              <div className="text-xs md:text-sm text-muted-foreground">Birth date is private</div>
            ) : (
              <div className="text-xs md:text-sm text-muted-foreground">Add your birth date</div>
            )}

            {formData.birth_year && canViewField(formData.birth_year_visibility || 'public') ? (
              <div>
                <div className="text-xs md:text-sm text-foreground font-medium">Birth Year: {formData.birth_year}</div>
                <div className="text-xs text-muted-foreground">{getPrivacyLabel(formData.birth_year_visibility || 'public')}</div>
              </div>
            ) : !canViewField(formData.birth_year_visibility || 'public') && formData.birth_year ? (
              <div className="text-xs md:text-sm text-muted-foreground">Birth year is private</div>
            ) : (
              <div className="text-xs md:text-sm text-muted-foreground">Add your birth year</div>
            )}

            {(!hasAnyBasicInfo || (!canViewField(formData.gender_visibility || 'public') && !canViewField(formData.pronouns_visibility || 'public') && !canViewField(formData.birth_date_visibility || 'public') && !canViewField(formData.birth_year_visibility || 'public'))) && (
              <div className="text-xs md:text-sm text-muted-foreground italic">
                Add information to your contact and basic info section
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Contact Information */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-6 p-4 md:p-6 pt-0 md:pt-0">
          {/* Email Field */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Email</Label>
              <PrivacySelector
                value={formData.email_visibility || 'public'}
                onChange={(value) => setFormData(prev => ({ ...prev, email_visibility: value }))}
              />
            </div>
            <Input
              id="email"
              type="email"
              value={formData.email || ''}
              disabled
              className="bg-muted h-9 md:h-10"
              placeholder="Linked to your sign-up email"
            />
            <p className="text-xs text-muted-foreground">
              This email is automatically linked to your account and cannot be changed here.
            </p>
          </div>

          {/* Phone Field */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Phone</Label>
              <PrivacySelector
                value={formData.phone_visibility || 'public'}
                onChange={(value) => setFormData(prev => ({ ...prev, phone_visibility: value }))}
              />
            </div>
            <div className="flex gap-2">
              <Select 
                value={formData.phone_country_code || '+1'} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, phone_country_code: value }))}
              >
                <SelectTrigger className="w-20 md:w-32">
                  <SelectValue>
                    {COUNTRY_CODES.find(c => c.code === (formData.phone_country_code || '+1'))?.flag} {formData.phone_country_code || '+1'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      <div className="flex items-center gap-2">
                        <span>{country.flag}</span>
                        <span>{country.code}</span>
                        <span className="text-muted-foreground text-xs">{country.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Phone number"
                value={formData.phone_number || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                className="flex-1 h-9 md:h-10"
              />
            </div>
          </div>

          {/* Websites and Social Links */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Websites and Social Links</Label>
              <PrivacySelector
                value={formData.websites_visibility || 'public'}
                onChange={(value) => setFormData(prev => ({ ...prev, websites_visibility: value }))}
              />
            </div>
            
            {/* Existing Websites */}
            {websites.length > 0 && (
              <div className="space-y-1 md:space-y-2">
                {websites.map((website, index) => (
                  <div key={index} className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 p-2 border rounded-md">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {website.type}
                      </Badge>
                      <span className="text-xs md:text-sm flex-1">{website.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a 
                        href={website.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline truncate flex-1"
                      >
                        {website.url}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeWebsite(index)}
                        className="h-6 w-6 p-0 shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Website */}
            <div className="space-y-2 p-2 md:p-3 border-2 border-dashed rounded-md">
              <div className="flex flex-col md:flex-row gap-2">
                <Select
                  value={newWebsite.type}
                  onValueChange={(value) => setNewWebsite(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger className="w-full md:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="twitter">Twitter</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Label (e.g., My Blog)"
                  value={newWebsite.label}
                  onChange={(e) => setNewWebsite(prev => ({ ...prev, label: e.target.value }))}
                  className="flex-1 h-9 md:h-10"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="URL (https://...)"
                  value={newWebsite.url}
                  onChange={(e) => setNewWebsite(prev => ({ ...prev, url: e.target.value }))}
                  className="flex-1 h-9 md:h-10"
                />
                <Button onClick={addWebsite} size="sm" className="h-9 md:h-10">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Basic Information */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-6 p-4 md:p-6 pt-0 md:pt-0">
          {/* Gender */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Gender</Label>
              <PrivacySelector
                value={formData.gender_visibility || 'public'}
                onChange={(value) => setFormData(prev => ({ ...prev, gender_visibility: value }))}
              />
            </div>
            <Select
              value={formData.gender || ''}
              onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}
            >
              <SelectTrigger className="h-9 md:h-10">
                <SelectValue placeholder="Select your gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((gender) => (
                  <SelectItem key={gender} value={gender}>
                    {gender}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pronouns */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Pronouns</Label>
              <PrivacySelector
                value={formData.pronouns_visibility || 'public'}
                onChange={(value) => setFormData(prev => ({ ...prev, pronouns_visibility: value }))}
              />
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <Select
                value={formData.pronouns || ''}
                onValueChange={(value) => setFormData(prev => ({ 
                  ...prev, 
                  pronouns: value === 'Custom' ? '' : value 
                }))}
              >
                <SelectTrigger className="w-full md:flex-1 h-9 md:h-10">
                  <SelectValue placeholder="Select pronouns" />
                </SelectTrigger>
                <SelectContent>
                  {PRONOUN_OPTIONS.map((pronoun) => (
                    <SelectItem key={pronoun} value={pronoun}>
                      {pronoun}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(formData.pronouns === '' || !PRONOUN_OPTIONS.includes(formData.pronouns || '')) && (
                <Input
                  placeholder="Custom pronouns"
                  value={formData.pronouns || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, pronouns: e.target.value }))}
                  className="w-full md:flex-1 h-9 md:h-10"
                />
              )}
            </div>
          </div>

          {/* Birth Date */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Birth Date</Label>
              <PrivacySelector
                value={formData.birth_date_visibility || 'public'}
                onChange={(value) => setFormData(prev => ({ ...prev, birth_date_visibility: value }))}
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={birthDateData.day}
                onValueChange={(value) => setBirthDate(value, birthDateData.month)}
              >
                <SelectTrigger className="w-16 md:w-20 h-9 md:h-10">
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <SelectItem key={day} value={day.toString()}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={birthDateData.month}
                onValueChange={(value) => setBirthDate(birthDateData.day, value)}
              >
                <SelectTrigger className="flex-1 h-9 md:h-10">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Birth Year */}
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Birth Year (Optional)</Label>
              <PrivacySelector
                value={formData.birth_year_visibility || 'public'}
                onChange={(value) => setFormData(prev => ({ ...prev, birth_year_visibility: value }))}
              />
            </div>
            <Input
              type="number"
              placeholder="Year (e.g., 1990)"
              min="1900"
              max={new Date().getFullYear()}
              value={formData.birth_year || ''}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                birth_year: e.target.value ? parseInt(e.target.value) : undefined 
              }))}
              className="h-9 md:h-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? (
            <>Loading...</>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
