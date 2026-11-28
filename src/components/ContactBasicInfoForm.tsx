import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { dataClient } from '@/lib/supabase/dataClient';
import { Plus, X, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeProfilePayload } from '@/utils/profileValidation';
import {
  loadSecureAboutFields,
  type AboutSecureDataStatus,
} from '@/api/profileAbout';
import { normalizeProfileVisibility } from '@/lib/profileAboutPrivacy';
import { ProfileFieldVisibilitySelector } from '@/components/profile/ProfileFieldVisibilitySelector';

interface ContactBasicInfoFormProps {
  profileId: string;
  isOwnProfile: boolean;
  onSave?: () => void;
}

interface ProfileData {
  email?: string;
  phone_country_code?: string;
  phone_number?: string;
  websites_social_links?: WebsiteLink[];
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

const OWNER_VISIBILITY_COLUMNS = [
  'email_visibility',
  'phone_visibility',
  'websites_visibility',
  'gender_visibility',
  'pronouns_visibility',
  'birth_date_visibility',
  'birth_year_visibility',
] as const;

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

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const PRONOUN_OPTIONS = ['He/Him', 'She/Her', 'They/Them', 'Custom'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function asWebsiteLinks(value: unknown): WebsiteLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): WebsiteLink[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const link = entry as Record<string, unknown>;
    if (typeof link.url !== 'string') return [];
    return [{
      type: typeof link.type === 'string' ? link.type : 'website',
      url: link.url,
      label: typeof link.label === 'string' ? link.label : link.url,
    }];
  });
}

function asEmail(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const addresses = value.filter((entry): entry is string => typeof entry === 'string');
    return addresses.length > 0 ? addresses.join(', ') : undefined;
  }
  return undefined;
}

function SecureDataNotice({ status }: { status: AboutSecureDataStatus }) {
  if (status !== 'unavailable' && status !== 'denied') return null;
  const unavailable = status === 'unavailable';
  return (
    <div
      data-testid={unavailable ? 'contact-secure-data-unavailable' : 'contact-secure-data-denied'}
      className="mb-4 rounded-md border border-muted bg-muted/40 px-4 py-3 text-xs text-muted-foreground"
    >
      {unavailable
        ? 'Contact and basic details are unavailable until the secure field-level read is approved and installed. This does not mean they are empty.'
        : 'Some contact and basic details are not visible to you.'}
    </div>
  );
}

export const ContactBasicInfoForm: React.FC<ContactBasicInfoFormProps> = ({
  profileId,
  isOwnProfile,
  onSave
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ProfileData>({});
  const [websites, setWebsites] = useState<WebsiteLink[]>([]);
  const [newWebsite, setNewWebsite] = useState({ type: 'website', url: '', label: '' });
  const [birthDateParts, setBirthDateParts] = useState<{ day: string; month: string }>({ day: '', month: '' });
  const [secureStatus, setSecureStatus] = useState<AboutSecureDataStatus>('loading');
  const [visibleFields, setVisibleFields] = useState<ReadonlySet<string>>(new Set());
  const [visibilitySettings, setVisibilitySettings] = useState<Record<string, string | null>>({});

  const canWriteSecureFields = secureStatus === 'ready';

  useEffect(() => {
    let active = true;
    const load = async () => {
      setSecureStatus('loading');
      const secure = await loadSecureAboutFields(profileId);
      if (!active) return;

      setSecureStatus(secure.status);
      setVisibleFields(new Set(secure.visibleFields));
      setVisibilitySettings({ ...secure.visibilitySettings });
      setFormData({
        email: asEmail(secure.fields.email),
        phone_country_code: typeof secure.fields.phone_country_code === 'string'
          ? secure.fields.phone_country_code
          : undefined,
        phone_number: typeof secure.fields.phone_number === 'string'
          ? secure.fields.phone_number
          : undefined,
        websites_social_links: asWebsiteLinks(secure.fields.websites_social_links),
        gender: typeof secure.fields.gender === 'string' ? secure.fields.gender : undefined,
        pronouns: typeof secure.fields.pronouns === 'string' ? secure.fields.pronouns : undefined,
        birth_date: typeof secure.fields.birth_date === 'string'
          ? secure.fields.birth_date
          : typeof secure.fields.birthday === 'string'
            ? secure.fields.birthday
            : undefined,
        birth_year: typeof secure.fields.birth_year === 'number' ? secure.fields.birth_year : undefined,
      });
      setWebsites(asWebsiteLinks(secure.fields.websites_social_links));
    };
    void load();
    return () => { active = false; };
  }, [profileId, isOwnProfile]);

  const visibilityValue = (column: (typeof OWNER_VISIBILITY_COLUMNS)[number]) =>
    normalizeProfileVisibility(visibilitySettings[column]) ?? 'private';

  const isFieldVisible = (key: string) => secureStatus === 'ready' && visibleFields.has(key);

  const handleSave = async () => {
    if (!isOwnProfile || !canWriteSecureFields) return;

    setLoading(true);
    try {
      const updateData: Record<string, unknown> = {
        phone_country_code: formData.phone_number?.trim() ? formData.phone_country_code : null,
        phone_number: formData.phone_number?.trim() || null,
        websites_social_links: websites,
        gender: formData.gender,
        pronouns: formData.pronouns,
        birth_date: formData.birth_date,
        birth_year: formData.birth_year,
      };
      for (const column of OWNER_VISIBILITY_COLUMNS) {
        updateData[column] = visibilityValue(column);
      }

      const sanitizedData = sanitizeProfilePayload(updateData);
      const { error } = await dataClient
        .from('profiles')
        .update(sanitizedData)
        .eq('id', profileId);
      if (error) throw error;

      toast({ title: 'Success', description: 'Contact and basic info updated successfully!' });
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
    if (Number.isNaN(date.getTime())) return { day: '', month: '' };
    return {
      day: date.getUTCDate().toString(),
      month: MONTHS[date.getUTCMonth()]
    };
  };

  const setBirthDate = (day: string, month: string) => {
    setBirthDateParts({ day, month });
    if (day && month) {
      const monthIndex = MONTHS.indexOf(month);
      if (monthIndex !== -1) {
        const date = new Date(Date.UTC(2000, monthIndex, parseInt(day)));
        setFormData(prev => ({
          ...prev,
          birth_date: date.toISOString().split('T')[0]
        }));
        return;
      }
    }
    setFormData(prev => ({ ...prev, birth_date: undefined }));
  };

  const displayBirthDate = formatBirthDate(formData.birth_date);
  const ready = secureStatus === 'ready';

  const fieldValue = (
    key: string,
    label: string,
    value: React.ReactNode,
    hasValue: boolean
  ) => {
    if (!isFieldVisible(key)) {
      if (!ready) return null;
      return (
        <div key={key} className="text-xs md:text-sm text-muted-foreground">
          {label} is not visible to you.
        </div>
      );
    }
    if (!hasValue) {
      return (
        <div key={key} className="text-xs md:text-sm text-muted-foreground">
          {label} has not been provided.
        </div>
      );
    }
    return (
      <div key={key} className="text-xs md:text-sm text-foreground font-medium">
        {value}
      </div>
    );
  };

  if (!isOwnProfile) {
    return (
      <div className="space-y-4 md:space-y-6">
        <SecureDataNotice status={secureStatus} />
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4 p-4 md:p-6 pt-0 md:pt-0">
            {fieldValue('email', 'Email', formData.email, Boolean(formData.email))}
            {fieldValue(
              'phone',
              'Phone',
              `${formData.phone_country_code || ''} ${formData.phone_number || ''}`.trim(),
              Boolean(formData.phone_country_code && formData.phone_number)
            )}
            {fieldValue(
              'websites_social_links',
              'Websites and social links',
              <div className="space-y-1 md:space-y-2">
                {websites.map((website, index) => (
                  <div key={`${website.url}-${index}`} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{website.type}</Badge>
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
              </div>,
              websites.length > 0
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4 p-4 md:p-6 pt-0 md:pt-0">
            {fieldValue('gender', 'Gender', formData.gender, Boolean(formData.gender))}
            {fieldValue('pronouns', 'System pronouns', formData.pronouns, Boolean(formData.pronouns))}
            {fieldValue(
              'birth_date',
              'Birth date',
              `${displayBirthDate.day} ${displayBirthDate.month}`.trim(),
              Boolean(displayBirthDate.day && displayBirthDate.month)
            )}
            {fieldValue('birth_year', 'Birth year', formData.birth_year, Boolean(formData.birth_year))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <SecureDataNotice status={secureStatus} />
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-6 p-4 md:p-6 pt-0 md:pt-0">
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Email</Label>
              <ProfileFieldVisibilitySelector
                fieldKey="email_visibility"
                value={visibilitySettings.email_visibility}
                disabled={!canWriteSecureFields}
                onChange={(value) => setFormData(prev => ({ ...prev, email_visibility: value }))}
              />
            </div>
            <Input
              id="email"
              type="email"
              value={formData.email || ''}
              disabled
              className="bg-muted h-14 border-0"
              placeholder="Linked to your sign-up email"
            />
            <p className="text-xs text-muted-foreground">
              This email is automatically linked to your account and cannot be changed here.
            </p>
          </div>

          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Phone</Label>
              <ProfileFieldVisibilitySelector
                fieldKey="phone_visibility"
                value={visibilitySettings.phone_visibility}
                disabled={!canWriteSecureFields}
                onChange={(value) => setFormData(prev => ({ ...prev, phone_visibility: value }))}
              />
            </div>
            <div className="flex gap-1.5 md:gap-2">
              <Select
                value={formData.phone_country_code || '+1'}
                onValueChange={(value) => setFormData(prev => ({ ...prev, phone_country_code: value }))}
              >
                <SelectTrigger className="w-14 md:w-32 h-14 border-0">
                  <SelectValue>
                    {COUNTRY_CODES.find(c => c.code === (formData.phone_country_code || '+1'))?.flag}
                    <span className="hidden md:inline">{formData.phone_country_code || '+1'}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map(country => (
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
                className="flex-1 h-14 border-0"
              />
            </div>
          </div>

          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Websites and Social Links</Label>
              <ProfileFieldVisibilitySelector
                fieldKey="websites_visibility"
                value={visibilitySettings.websites_visibility}
                disabled={!canWriteSecureFields}
                onChange={(value) => setFormData(prev => ({ ...prev, websites_visibility: value }))}
              />
            </div>
            {websites.length > 0 && (
              <div className="space-y-1 md:space-y-2">
                {websites.map((website, index) => (
                  <div key={`${website.url}-${index}`} className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 p-2 border rounded-md">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{website.type}</Badge>
                      <span className="text-xs md:text-sm flex-1">{website.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={website.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate flex-1">
                        {website.url}
                      </a>
                      <Button variant="ghost" size="sm" onClick={() => removeWebsite(index)} className="h-6 w-6 p-0 shrink-0">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2 p-2 md:p-3 border-2 border-dashed rounded-md">
              <div className="flex flex-col md:flex-row gap-1.5 md:gap-2">
                <Select value={newWebsite.type} onValueChange={(value) => setNewWebsite(prev => ({ ...prev, type: value }))}>
                  <SelectTrigger className="w-full md:w-32 h-14 border-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['website', 'facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok', 'tone', 'other'].map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Label (e.g., My Blog)"
                  value={newWebsite.label}
                  onChange={(e) => setNewWebsite(prev => ({ ...prev, label: e.target.value }))}
                  className="flex-1 h-14 border-0"
                />
              </div>
              <div className="flex gap-1.5 md:gap-2">
                <Input
                  placeholder="URL (https://...)"
                  value={newWebsite.url}
                  onChange={(e) => setNewWebsite(prev => ({ ...prev, url: e.target.value }))}
                  className="h-14 border-0"
                />
                <Button onClick={addWebsite} size="sm" className="h-14 border-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-6 p-4 md:p-6 pt-0 md:pt-0">
          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Gender</Label>
              <ProfileFieldVisibilitySelector
                fieldKey="gender_visibility"
                value={visibilitySettings.gender_visibility}
                disabled={!canWriteSecureFields}
                onChange={(value) => setFormData(prev => ({ ...prev, gender_visibility: value }))}
              />
            </div>
            <Select value={formData.gender || ''} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
              <SelectTrigger className="h-14 border-0"><SelectValue placeholder="Select your gender" /></SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Pronouns</Label>
              <ProfileFieldVisibilitySelector
                fieldKey="pronouns_visibility"
                value={visibilitySettings.pronouns_visibility}
                disabled={!canWriteSecureFields}
                onChange={(value) => setFormData(prev => ({ ...prev, pronouns_visibility: value }))}
              />
            </div>
            <div className="flex flex-col md:flex-row gap-1.5 md:gap-2">
              <Select
                value={formData.pronouns || ''}
                onValueChange={(value) => setFormData(prev => ({
                  ...prev,
                  pronouns: value === 'Custom' ? '' : value
                }))}
              >
                <SelectTrigger className="w-full md:flex-1 h-14 border-0"><SelectValue placeholder="Select pronouns" /></SelectTrigger>
                <SelectContent>
                  {PRONOUN_OPTIONS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
              {(!formData.pronouns || !PRONOUN_OPTIONS.includes(formData.pronouns)) && (
                <Input
                  placeholder="Custom pronouns"
                  value={formData.pronouns || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, pronouns: e.target.value }))}
                  className="w-full md:flex-1 h-14 border-0"
                />
              )}
            </div>
          </div>

          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Birth Date</Label>
              <ProfileFieldVisibilitySelector
                fieldKey="birth_date_visibility"
                value={visibilitySettings.birth_date_visibility}
                disabled={!canWriteSecureFields}
                onChange={(value) => setFormData(prev => ({ ...prev, birth_date_visibility: value }))}
              />
            </div>
            <div className="flex gap-1.5 md:gap-2">
              <Select value={birthDateParts.day} onValueChange={(value) => setBirthDate(value, birthDateParts.month)}>
                <SelectTrigger className="w-14 md:w-20 h-14 border-0"><SelectValue placeholder="Day" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                    <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={birthDateParts.month} onValueChange={(value) => setBirthDate(birthDateParts.day, value)}>
                <SelectTrigger className="flex-1 h-14 border-0"><SelectValue placeholder="Month" /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(month => <SelectItem key={month} value={month}>{month}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1 md:space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs md:text-sm">Birth Year (Optional)</Label>
              <ProfileFieldVisibilitySelector
                fieldKey="birth_year_visibility"
                value={visibilitySettings.birth_year_visibility}
                disabled={!canWriteSecureFields}
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
                birth_year: e.target.value ? parseInt(e.target.value, 10) : undefined
              }))}
              className={cn('h-14 border-0')}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading || !canWriteSecureFields} className="h-14 border-0">
          {loading ? 'Loading...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};
