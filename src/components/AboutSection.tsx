import { useState, useEffect } from 'react';
import { dataClient } from '@/lib/supabase/dataClient';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Edit, Save, X, ChevronDown, CalendarIcon, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { buildSocialUrl } from '@/utils/socialLinks';
import { format } from 'date-fns';
import { LocationAutocomplete } from '@/components/LocationAutocomplete';
import { CompanyAutocomplete } from '@/components/CompanyAutocomplete';
import { CountrySelector } from '@/components/CountrySelector';
import { SocialLinksManager } from '@/components/SocialLinksManager';
import type { Company } from '@/hooks/useCompanyOperations';
import { CollegeAutocomplete } from './CollegeAutocomplete';
import type { College } from '@/hooks/useColleges';
import { HighSchoolAutocomplete } from './HighSchoolAutocomplete';
import type { HighSchool } from '@/hooks/useHighSchools';
import { ContactBasicInfoForm } from './ContactBasicInfoForm';
import { ProfileFieldVisibilitySelector } from './profile/ProfileFieldVisibilitySelector';
import { sanitizeProfilePayload } from '@/utils/profileValidation';
import { normalizeProfileVisibility } from '@/lib/profileAboutPrivacy';
import { FamilyAndRelationships } from './FamilyAndRelationships';
import { LifeEventsSection } from './LifeEventsSection';
import { DetailsAboutYouSection } from './DetailsAboutYouSection';
import OverviewSection from './OverviewSection';
import { ABOUT_SECTIONS } from '@/lib/profileAbout';
import type { AboutSectionId } from '@/lib/profileAbout';
import { loadSecureAboutFields, type AboutSecureDataStatus } from '@/api/profileAbout';
import { getCompanyById, getCollegeById, getHighSchoolById } from '@/api/users';

interface AboutSectionProps {
  profileId: string;
  isOwnProfile: boolean;
  // When provided, the active subsection is controlled by the URL (the parent
  // derives it from the route). Without these props the component falls back to
  // local state, which keeps it usable on its own.
  activeSection?: AboutSectionId;
  onSectionChange?: (section: AboutSectionId) => void;
}

interface ProfileDetail {
  id: string;
  section: string;
  field_name: string;
  field_value: string;
  created_at?: string;
  profile_id?: string;
  updated_at?: string;
}

interface SocialLink {
  type: string;
  url: string;
}

// Values held in the About edit forms: text/number inputs, calendar dates and
// the websites/social-links array.
type EditFormValue = string | number | Date | SocialLink[];
type EditFormState = Record<string, EditFormValue>;

interface ProfileData {
  about_you?: string;
  name_pronunciation?: string;
  email?: string[] | string;
  phone_country_code?: string;
  phone_number?: string;
  websites_social_links?: SocialLink[];
  gender?: string;
  pronouns?: string;
  birthday?: string;
  birth_date?: string;
  birth_year?: number;
  function?: string;
  company_id?: string;
  college_id?: string;
  college?: string;
  high_school_id?: string;
  high_school?: string;
  relationship_status?: string;
  relationship?: string;
}

const jobFunctions = [
  'Software Engineer',
  'Product Manager',
  'Designer',
  'Data Scientist',
  'Marketing Manager',
  'Sales Manager',
  'Teacher',
  'Doctor',
  'Nurse',
  'Lawyer',
  'Accountant',
  'Consultant',
  'Engineer',
  'Architect',
  'Chef',
  'Writer',
  'Artist',
  'Photographer',
  'Entrepreneur',
  'Student',
  'Retired',
  'Other'
];

// The live email column is TEXT[]; the edit form and this legacy display use a
// single string. Normalize at the boundary instead of widening EditFormValue.
function emailAsString(value: string[] | string | undefined): string {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string').join(', ');
  }
  return typeof value === 'string' ? value : '';
}

// These sections include values from private `public.profiles` columns. Until
// the approved field-level database read exists, they cannot show real data.
const SECTIONS_WITH_PRIVATE_PROFILE_FIELDS: ReadonlySet<AboutSectionId> = new Set([
  'work_education',
  'contact',
  'family',
  'life_events',
  'details',
]);

const AboutSection = ({ profileId, isOwnProfile, activeSection: controlledSection, onSectionChange }: AboutSectionProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profileDetails, setProfileDetails] = useState<ProfileDetail[]>([]);
  const [profileData, setProfileData] = useState<ProfileData>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({});
  const [visibilityForm, setVisibilityForm] = useState<Record<string, string>>({});
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const [selectedHighSchool, setSelectedHighSchool] = useState<HighSchool | null>(null);
  const [customFunction, setCustomFunction] = useState('');
  const [loading, setLoading] = useState(true);
  const [secureAboutStatus, setSecureAboutStatus] = useState<AboutSecureDataStatus>('loading');
  const [secureVisibilitySettings, setSecureVisibilitySettings] = useState<Record<string, string | null>>({});
  const [internalSection, setInternalSection] = useState<AboutSectionId>('overview');
  const activeSection = controlledSection ?? internalSection;
  // Visibility values come only from the secure owner read. If that read is not
  // ready, the controls stay visible but disabled so a save cannot silently
  // overwrite an unknown saved setting with a default.
  const visibilityControlsDisabled = secureAboutStatus !== 'ready';

  const handleSectionChange = (section: AboutSectionId) => {
    setInternalSection(section);
    onSectionChange?.(section);
  };

  useEffect(() => {
    fetchProfileDetails();
  }, [profileId, isOwnProfile]);

  const fetchProfileDetails = async () => {
    setSecureAboutStatus('loading');
    try {
      // Fetch profile_details (a separate table, not private profiles columns).
      const { data: details, error: detailsError } = await dataClient
        .from('profile_details')
        .select('*')
        .eq('profile_id', profileId);

      if (detailsError) throw detailsError;

      // Phase 3G-N/3G-Q: email, phone, birth, work/education IDs, gender,
      // pronouns and all *_visibility fields are private profile columns. No
      // direct SELECT (owner or viewer) is retained as a fallback. The
      // fail-closed adapter reports whether an approved field-level read is
      // available; it never sends a browser-supplied viewer id.
      const secureFields = await loadSecureAboutFields(profileId);
      setSecureAboutStatus(secureFields.status);
      const secureProfile = secureFields.fields as ProfileData;
      setProfileData(secureProfile);
      setSecureVisibilitySettings({ ...secureFields.visibilitySettings });

      // Labels are restored only after the DB returned the corresponding
      // authorized ID. A failed label lookup leaves the label empty; it never
      // exposes a row the field read did not authorize.
      const [company, college, highSchool] = await Promise.all([
        secureProfile.company_id ? getCompanyById(secureProfile.company_id) : Promise.resolve(null),
        secureProfile.college_id ? getCollegeById(secureProfile.college_id) : Promise.resolve(null),
        secureProfile.high_school_id ? getHighSchoolById(secureProfile.high_school_id) : Promise.resolve(null),
      ]);
      setSelectedCompany(company && !company.error ? company.data ?? null : null);
      setSelectedCollege(college && !college.error ? college.data ?? null : null);
      setSelectedHighSchool(highSchool && !highSchool.error ? highSchool.data ?? null : null);
      setProfileDetails(details || []);
    } catch {
      setSecureAboutStatus('unavailable');
      setSecureVisibilitySettings({});
      toast({
        title: 'Error',
        description: 'Failed to load profile details',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getDetailsBySection = (section: string) => {
    return profileDetails.filter(detail => detail.section === section);
  };

  const handleEditSection = async (section: string) => {
    // Private profile fields and their visibility settings are owner-only.
    if (!isOwnProfile) return;
    const sectionDetails = getDetailsBySection(section);
    const formData: EditFormState = {};
    const visibilityData: Record<string, string> = {};
    
    // Handle regular profile details sections
    sectionDetails.forEach(detail => {
      formData[detail.field_name] = detail.field_value;
    });
    
    // Handle contact section with profile data
    if (section === 'contact') {
      formData.email = emailAsString(profileData.email);
      formData.phone_country_code = profileData.phone_country_code || '+1';
      formData.phone_number = profileData.phone_number || '';
      formData.websites_social_links = profileData.websites_social_links || [];
      formData.gender = profileData.gender || '';
      formData.pronouns = profileData.pronouns || '';
      formData.birth_date = profileData.birth_date ? new Date(profileData.birth_date) : null;
      formData.birth_year = profileData.birth_year || '';
      
      // Saved visibility values come only from the secure owner read. Unknown
      // or unavailable values stay private; they are never widened by default.
      for (const column of [
        'email_visibility',
        'phone_visibility',
        'websites_visibility',
        'gender_visibility',
        'pronouns_visibility',
        'birth_date_visibility',
        'birth_year_visibility',
      ]) {
        visibilityData[column] =
          normalizeProfileVisibility(secureVisibilitySettings[column]) ?? 'private';
      }
    }
    
    // Private visibility values await the secure owner-only read function.
    // Use safe editing defaults; no direct private profile SELECT is performed.
    if (section === 'work_education') {
      if (profileData.function) formData.job_function = profileData.function;

      visibilityData.function_visibility = normalizeProfileVisibility(secureVisibilitySettings.function_visibility) ?? 'private';
      visibilityData.company_visibility = normalizeProfileVisibility(secureVisibilitySettings.company_visibility) ?? 'private';
      visibilityData.college_visibility = normalizeProfileVisibility(secureVisibilitySettings.college_visibility) ?? 'private';
      visibilityData.high_school_visibility = normalizeProfileVisibility(secureVisibilitySettings.high_school_visibility) ?? 'private';

      // If the saved function isn't one of the preset options, pre-select
      // "Other" and pre-fill the custom job-title field so it stays editable.
      const savedFunction = formData.job_function;
      if (typeof savedFunction === 'string' && savedFunction && !jobFunctions.includes(savedFunction)) {
        formData.job_function = 'Other';
        setCustomFunction(savedFunction);
      } else {
        setCustomFunction('');
      }
    }
    
    setEditForm(formData);
    setVisibilityForm(visibilityData);
    setEditingSection(section);
    
    // Set selected company if editing work_education section
    if (section === 'work_education' && selectedCompany) {
      // Company is already set from fetchProfileDetails
    }
  };

  const handleSaveSection = async (section: string) => {
    if (!isOwnProfile || !user?.id) return;
    const canWriteVisibility = secureAboutStatus === 'ready';
    // Never write private profile values while the authoritative owner read is
    // unavailable; an edit loaded from empty defaults could overwrite real data.
    if (section === 'work_education' && !canWriteVisibility) return;

    try {
      if (section === 'work_education') {
        // Handle work_education section with profiles table
        const updateData: Record<string, unknown> = {};
        
        const rawFunction = editForm.job_function;
        let functionValue: string | undefined =
          typeof rawFunction === 'string' ? rawFunction : undefined;
        if (functionValue === 'Other') {
          // "Other" reveals a free-text job-title field; the typed title is the
          // saved function. Fall back to "Other" only when nothing was typed.
          const typed = customFunction.trim();
          if (typed) functionValue = typed;
        }
        if (functionValue) updateData.function = functionValue;
        if (selectedCompany) {
          updateData.company_id = selectedCompany.id;
        }
        if (selectedCollege) {
          updateData.college_id = selectedCollege.id;
        }
        if (selectedHighSchool) {
          updateData.high_school_id = selectedHighSchool.id;
        }

        // Add visibility settings to update data
        if (canWriteVisibility && visibilityForm.function_visibility) updateData.function_visibility = visibilityForm.function_visibility;
        if (canWriteVisibility && visibilityForm.company_visibility) updateData.company_visibility = visibilityForm.company_visibility;
        if (canWriteVisibility && visibilityForm.college_visibility) updateData.college_visibility = visibilityForm.college_visibility;
        if (canWriteVisibility && visibilityForm.high_school_visibility) updateData.high_school_visibility = visibilityForm.high_school_visibility;

        // Apply sanitization for proper casing
        const sanitizedData = sanitizeProfilePayload(updateData);

        const { error } = await dataClient
          .from('profiles')
          .update(sanitizedData)
          .eq('id', profileId);

        if (error) throw error;
      } else if (section === 'contact') {
        // Handle contact section with profiles table for new fields
        const updateData: Record<string, unknown> = {};
        
        // Phone fields
        if (editForm.phone_country_code) updateData.phone_country_code = editForm.phone_country_code;
        if (editForm.phone_number) updateData.phone_number = editForm.phone_number;
        
        // Websites and social links
        if (editForm.websites_social_links) updateData.websites_social_links = editForm.websites_social_links;
        
        // Basic info fields
        if (editForm.gender) updateData.gender = editForm.gender;
        if (editForm.pronouns) updateData.pronouns = editForm.pronouns;
        if (editForm.birth_date) updateData.birth_date = editForm.birth_date;
        if (editForm.birth_year) updateData.birth_year = parseInt(String(editForm.birth_year), 10) || null;
        
        // Add visibility settings to update data
        if (canWriteVisibility && visibilityForm.phone_visibility) updateData.phone_visibility = visibilityForm.phone_visibility;
        if (canWriteVisibility && visibilityForm.websites_visibility) updateData.websites_visibility = visibilityForm.websites_visibility;
        if (canWriteVisibility && visibilityForm.gender_visibility) updateData.gender_visibility = visibilityForm.gender_visibility;
        if (canWriteVisibility && visibilityForm.pronouns_visibility) updateData.pronouns_visibility = visibilityForm.pronouns_visibility;
        if (canWriteVisibility && visibilityForm.birth_date_visibility) updateData.birth_date_visibility = visibilityForm.birth_date_visibility;
        if (canWriteVisibility && visibilityForm.birth_year_visibility) updateData.birth_year_visibility = visibilityForm.birth_year_visibility;

        // Apply sanitization for proper casing
        const sanitizedData = sanitizeProfilePayload(updateData);

        const { error } = await dataClient
          .from('profiles')
          .update(sanitizedData)
          .eq('id', profileId);

        if (error) throw error;
      } else {
        // Handle other sections with profile_details table
        // Delete existing details for this section
        await dataClient
          .from('profile_details')
          .delete()
          .eq('profile_id', profileId)
          .eq('section', section);

        // Insert new details
        const detailsToInsert = Object.entries(editForm)
          .filter(([_, value]) => typeof value === 'string' && value.trim() !== '')
          .map(([fieldName, value]) => ({
            profile_id: profileId,
            section,
            field_name: fieldName,
            field_value: value as string
          }));

        if (detailsToInsert.length > 0) {
          const { error } = await dataClient
            .from('profile_details')
            .insert(detailsToInsert);

          if (error) throw error;
        }
      }

      await fetchProfileDetails();
      setEditingSection(null);
      setEditForm({});
      setVisibilityForm({});
      setCustomFunction('');

      toast({
        title: 'Success',
        description: 'Profile details updated successfully'
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update profile details',
        variant: 'destructive'
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingSection(null);
      setEditForm({});
      setVisibilityForm({});
      setCustomFunction('');
      // Reset company selection when canceling
    fetchProfileDetails();
  };

  const updateFormField = (fieldName: string, value: string) => {
    setEditForm(prev => ({ ...prev, [fieldName]: value }));
  };

  const renderSectionContent = (section: string) => {
    const sectionDetails = getDetailsBySection(section);
    const isEditing = editingSection === section;

    if (loading) {
      return <div className="text-center text-muted-foreground">Loading...</div>;
    }

    // Special handling for Overview section
    if (section === 'overview') {
      return (
        <OverviewSection
          profileId={profileId}
          isOwnProfile={isOwnProfile}
        />
      );
    }

    // Special handling for Contact and Basic Info section
    if (section === 'contact') {
      return (
        <ContactBasicInfoForm
          profileId={profileId}
          isOwnProfile={isOwnProfile}
          onSave={() => {
            setEditingSection(null);
            fetchProfileDetails();
          }}
        />
      );
    }

    // Special handling for Family and Relationships section
    if (section === 'family') {
      return (
        <FamilyAndRelationships
          profileId={profileId}
          isOwnProfile={isOwnProfile}
        />
      );
    }

    // Special handling for Life Events section
    if (section === 'life_events') {
      return (
        <LifeEventsSection
          profileId={profileId}
          isOwnProfile={isOwnProfile}
        />
      );
    }

    // Special handling for Details About You section
    if (section === 'details') {
      return (
        <DetailsAboutYouSection
          profileId={profileId}
          isOwnProfile={isOwnProfile}
        />
      );
    }

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">
            {ABOUT_SECTIONS.find(s => s.id === section)?.label}
          </CardTitle>
          {isOwnProfile && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditSection(section)}
              disabled={
                SECTIONS_WITH_PRIVATE_PROFILE_FIELDS.has(section as AboutSectionId) &&
                secureAboutStatus !== 'ready'
              }
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          {isEditing ? (
            renderEditForm(section)
          ) : (
            renderDisplayContent(section, sectionDetails)
          )}
        </CardContent>
      </Card>
    );
  };

  // editForm is a heterogeneous map; each individual field has one known type.
  const editText = (key: string): string => {
    const value = editForm[key];
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  };

  const renderEditForm = (section: string) => {
    const fields = getSectionFields(section);
    
    if (section === 'contact') {
      return (
        <div className="space-y-6">
          {/* Contact Information */}
          <div>
            <h4 className="font-semibold mb-4">Contact Information</h4>
            <div className="space-y-4">
              {/* Email Field - Read Only */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Email</Label>
                  <ProfileFieldVisibilitySelector
                    fieldKey="email_visibility"
                    value={visibilityForm.email_visibility}
                    disabled={visibilityControlsDisabled}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, email_visibility: value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={editText('email')}
                    readOnly
                    className="bg-muted"
                  />
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Email is managed through your account settings</p>
              </div>

              {/* Phone Field with Country Selector */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Phone Number</Label>
                  <ProfileFieldVisibilitySelector
                    fieldKey="phone_visibility"
                    disabled={visibilityControlsDisabled}
                    value={visibilityForm.phone_visibility}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, phone_visibility: value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <CountrySelector
                    value={editText('phone_country_code') || '+1'}
                    onChange={(code) => setEditForm(prev => ({ ...prev, phone_country_code: code }))}
                  />
                  <Input
                    value={editText('phone_number')}
                    onChange={(e) => setEditForm(prev => ({ ...prev, phone_number: e.target.value }))}
                    placeholder="123-456-7890"
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Websites and Social Links */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Websites and Social Links</Label>
                  <ProfileFieldVisibilitySelector
                    fieldKey="websites_visibility"
                    disabled={visibilityControlsDisabled}
                    value={visibilityForm.websites_visibility}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, websites_visibility: value }))}
                  />
                </div>
                <SocialLinksManager
                  value={(editForm.websites_social_links as SocialLink[] | undefined) || []}
                  onChange={(links) => setEditForm(prev => ({ ...prev, websites_social_links: links }))}
                />
              </div>
            </div>
          </div>

          {/* Basic Information */}
          <div>
            <h4 className="font-semibold mb-4">Basic Information</h4>
            <div className="space-y-4">
              {/* Gender */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Gender</Label>
                  <ProfileFieldVisibilitySelector
                    fieldKey="gender_visibility"
                    disabled={visibilityControlsDisabled}
                    value={visibilityForm.gender_visibility}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, gender_visibility: value }))}
                  />
                </div>
                <Select value={editText('gender')} onValueChange={(value) => setEditForm(prev => ({ ...prev, gender: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Pronouns */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Pronouns</Label>
                  <ProfileFieldVisibilitySelector
                    fieldKey="pronouns_visibility"
                    disabled={visibilityControlsDisabled}
                    value={visibilityForm.pronouns_visibility}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, pronouns_visibility: value }))}
                  />
                </div>
                <Select value={editText('pronouns')} onValueChange={(value) => setEditForm(prev => ({ ...prev, pronouns: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select pronouns..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="He/Him">He/Him</SelectItem>
                    <SelectItem value="She/Her">She/Her</SelectItem>
                    <SelectItem value="They/Them">They/Them</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Birth Date */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Birth Date</Label>
                  <ProfileFieldVisibilitySelector
                    fieldKey="birth_date_visibility"
                    disabled={visibilityControlsDisabled}
                    value={visibilityForm.birth_date_visibility}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, birth_date_visibility: value }))}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editForm.birth_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editForm.birth_date ? format(editForm.birth_date as Date, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={editForm.birth_date as Date | undefined}
                      onSelect={(date) => setEditForm(prev => ({ ...prev, birth_date: date }))}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Birth Year */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Birth Year</Label>
                  <ProfileFieldVisibilitySelector
                    fieldKey="birth_year_visibility"
                    disabled={visibilityControlsDisabled}
                    value={visibilityForm.birth_year_visibility}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, birth_year_visibility: value }))}
                  />
                </div>
                <Input
                  type="number"
                  value={editText('birth_year')}
                  onChange={(e) => setEditForm(prev => ({ ...prev, birth_year: e.target.value }))}
                  placeholder="1990"
                  min="1900"
                  max={new Date().getFullYear()}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={() => handleSaveSection(section)}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" onClick={handleCancelEdit}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      );
    }
    
    const workVisibilityColumns: Record<string, string> = {
      job_function: 'function_visibility',
      job_company: 'company_visibility',
      college: 'college_visibility',
      high_school: 'high_school_visibility',
    };

    return (
      <div className="space-y-4">
        {fields.map(field => (
          <div key={field.name} className="space-y-2">
            {section === 'places' && (field.name === 'current_city' || field.name === 'hometown') ? (
              <LocationAutocomplete
                label={field.label}
                placeholder={field.placeholder}
                value={editText(field.name)}
                onChange={(value) => updateFormField(field.name, value)}
              />
            ) : field.name === 'job_function' ? (
              <>
                <Label htmlFor={field.name}>{field.label}</Label>
                <Select value={editText(field.name)} onValueChange={(value) => {
                  updateFormField(field.name, value);
                  if (value !== 'Other') setCustomFunction('');
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={field.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {jobFunctions.map(jobFunction => (
                      <SelectItem key={jobFunction} value={jobFunction}>
                        {jobFunction}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editForm[field.name] === 'Other' && (
                  <Input
                    className="mt-2"
                    value={customFunction}
                    onChange={(e) => setCustomFunction(e.target.value)}
                    placeholder="Enter your job title…"
                  />
                )}
              </>
            ) : field.name === 'job_company' ? (
              <CompanyAutocomplete
                label={field.label}
                placeholder={field.placeholder}
                value={selectedCompany}
                onChange={(company) => setSelectedCompany(company)}
              />
            ) : field.type === 'college_autocomplete' ? (
              <CollegeAutocomplete
                label={field.label}
                placeholder={field.placeholder}
                value={selectedCollege}
                onChange={setSelectedCollege}
              />
            ) : field.type === 'high_school_autocomplete' ? (
              <HighSchoolAutocomplete
                label={field.label}
                placeholder={field.placeholder}
                value={selectedHighSchool}
                onChange={setSelectedHighSchool}
              />
            ) : (
              <>
                <Label htmlFor={field.name}>{field.label}</Label>
                {field.type === 'textarea' ? (
                  <Textarea
                    id={field.name}
                    value={editText(field.name)}
                    onChange={(e) => updateFormField(field.name, e.target.value)}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <Input
                    id={field.name}
                    type={field.type}
                    value={editText(field.name)}
                    onChange={(e) => updateFormField(field.name, e.target.value)}
                    placeholder={field.placeholder}
                  />
                )}
              </>
            )}
            {workVisibilityColumns[field.name] && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Who can see this</span>
                <ProfileFieldVisibilitySelector
                  fieldKey={workVisibilityColumns[field.name]}
                  value={visibilityForm[workVisibilityColumns[field.name]]}
                  disabled={visibilityControlsDisabled}
                  onChange={(value) => setVisibilityForm(prev => ({
                    ...prev,
                    [workVisibilityColumns[field.name]]: value,
                  }))}
                />
              </div>
            )}
          </div>
        ))}
        <div className="flex gap-2 pt-4">
          <Button onClick={() => handleSaveSection(section)}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button variant="outline" onClick={handleCancelEdit}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  const renderDisplayContent = (section: string, details: ProfileDetail[]) => {
    // A missing secure result is not evidence that private fields are empty.
    // Keep the section explicitly unavailable/denied until the database speaks.
    if (SECTIONS_WITH_PRIVATE_PROFILE_FIELDS.has(section as AboutSectionId) && secureAboutStatus === 'unavailable') {
      return (
        <div data-testid="about-section-secure-data-unavailable" className="text-center text-muted-foreground py-8">
          Private details are unavailable until the secure field-level read is approved and installed. This does not mean they are empty.
        </div>
      );
    }
    if (SECTIONS_WITH_PRIVATE_PROFILE_FIELDS.has(section as AboutSectionId) && secureAboutStatus === 'denied') {
      return (
        <div data-testid="about-section-secure-data-denied" className="text-center text-muted-foreground py-8">
          Some private details are not visible to you.
        </div>
      );
    }

    if (details.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-8">
          {isOwnProfile 
            ? `Add information to your ${ABOUT_SECTIONS.find(s => s.id === section)?.label.toLowerCase()} section`
            : `No ${ABOUT_SECTIONS.find(s => s.id === section)?.label.toLowerCase()} information available`
          }
        </div>
      );
    }

    // Special formatting for work_education section
    if (section === 'work_education') {
      const jobFunction = details.find(d => d.field_name === 'job_function')?.field_value || profileData.function;
      const jobCompany = details.find(d => d.field_name === 'job_company')?.field_value || selectedCompany?.name;
      const college = details.find(d => d.field_name === 'college')?.field_value || selectedCollege?.name || profileData.college;
      const highSchool = details.find(d => d.field_name === 'high_school')?.field_value || selectedHighSchool?.name || profileData.high_school;

      return (
        <div className="space-y-4 md:space-y-6">
          {/* Work Section */}
          {(jobFunction || jobCompany) && (
            <div>
              <h4 className="font-semibold text-base md:text-lg mb-1 md:mb-2">Work</h4>
              <p className="text-sm md:text-base text-muted-foreground">
                {jobFunction && jobCompany 
                  ? `${jobFunction} at ${jobCompany}`
                  : jobFunction || jobCompany
                }
              </p>
            </div>
          )}
          
          {/* Education Section */}
          {(college || highSchool) && (
            <div>
              <h4 className="font-semibold text-base md:text-lg mb-1 md:mb-2">Education</h4>
              <div className="text-sm md:text-base text-muted-foreground space-y-1">
                {college && <p>Study in {college}</p>}
                {highSchool && <p>Postgraduate studies in {highSchool}</p>}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Special formatting for contact section
    if (section === 'contact') {
      const emailDisplay = emailAsString(profileData.email);
      const hasContactInfo = emailDisplay || 
        (profileData.phone_country_code && profileData.phone_number) ||
        (profileData.websites_social_links && profileData.websites_social_links.length > 0);
      
      const hasBasicInfo = profileData.gender || profileData.pronouns || 
        profileData.birth_date || profileData.birth_year;

      if (!hasContactInfo && !hasBasicInfo) {
        return (
          <div className="text-center text-muted-foreground py-8">
            {isOwnProfile 
              ? "Add your contact information and basic details"
              : "No contact information available"
            }
          </div>
        );
      }

      return (
        <div className="space-y-4 md:space-y-6">
          {/* Contact Information */}
          {hasContactInfo && (
            <div>
              <h4 className="font-semibold text-base md:text-lg mb-2 md:mb-3">Contact Information</h4>
              <div className="space-y-2 md:space-y-3">
                {emailDisplay && (
                  <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-3">
                    <span className="text-xs md:text-sm font-medium text-muted-foreground md:w-20">Email:</span>
                    <div className="flex items-center gap-1 md:gap-2">
                      <span className="text-sm">{emailDisplay}</span>
                      <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">(From account)</span>
                    </div>
                  </div>
                )}
                
                {profileData.phone_country_code && profileData.phone_number && (
                  <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-3">
                    <span className="text-xs md:text-sm font-medium text-muted-foreground md:w-20">Phone:</span>
                    <span className="text-sm">{profileData.phone_country_code} {profileData.phone_number}</span>
                  </div>
                )}

                {profileData.websites_social_links && profileData.websites_social_links.length > 0 && (
                  <div>
                    <span className="text-xs md:text-sm font-medium text-muted-foreground">Websites & Social:</span>
                    <div className="mt-1 md:mt-2 space-y-1 md:space-y-2">
                      {profileData.websites_social_links.map((link, index) => (
                        <div key={index} className="flex flex-col md:flex-row md:items-center gap-0 md:gap-2">
                          <span className="text-xs md:text-sm text-muted-foreground">{link.type}:</span>
                          <a 
                            href={buildSocialUrl(link.type, link.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline break-all"
                          >
                            {link.url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Basic Information */}
          {hasBasicInfo && (
            <div>
              <h4 className="font-semibold text-base md:text-lg mb-2 md:mb-3">Basic Information</h4>
              <div className="space-y-2 md:space-y-3">
                {profileData.gender && (
                  <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-3">
                    <span className="text-xs md:text-sm font-medium text-muted-foreground md:w-20">Gender:</span>
                    <span className="text-sm">{profileData.gender}</span>
                  </div>
                )}
                
                {profileData.pronouns && (
                  <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-3">
                    <span className="text-xs md:text-sm font-medium text-muted-foreground md:w-20">Pronouns:</span>
                    <span className="text-sm">{profileData.pronouns}</span>
                  </div>
                )}

                {(profileData.birth_date || profileData.birth_year) && (
                  <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-3">
                    <span className="text-xs md:text-sm font-medium text-muted-foreground md:w-20">Birthday:</span>
                    <span className="text-sm">
                      {profileData.birth_date && format(new Date(profileData.birth_date), 'MMMM d')}
                      {profileData.birth_date && profileData.birth_year && ', '}
                      {profileData.birth_year}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Default rendering for other sections
    return (
      <div className="space-y-3">
        {details.map(detail => (
          <div key={detail.id} className="flex justify-between items-start">
            <div>
              <p className="font-medium">{formatFieldName(detail.field_name)}</p>
              <p className="text-muted-foreground">{detail.field_value}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const getSectionFields = (section: string) => {
    const fieldMap: Record<string, Array<{name: string, label: string, type: string, placeholder: string}>> = {
      overview: [
        { name: 'bio', label: 'Bio', type: 'textarea', placeholder: 'Tell people about yourself...' },
        { name: 'favorite_quote', label: 'Favorite Quote', type: 'text', placeholder: 'Your favorite quote' }
      ],
      work_education: [
        { name: 'job_function', label: 'Function', type: 'select', placeholder: 'Select your role…' },
        { name: 'job_company', label: 'Company', type: 'autocomplete', placeholder: 'Search for a company…' },
        { name: 'college', label: 'College', type: 'college_autocomplete', placeholder: 'Search for a college…' },
        { name: 'high_school', label: 'High School', type: 'high_school_autocomplete', placeholder: 'Search for a high school…' }
      ],
      places: [
        { name: 'current_city', label: 'Current City', type: 'text', placeholder: 'Search for your current city…' },
        { name: 'hometown', label: 'Hometown', type: 'text', placeholder: 'Search for your hometown…' }
      ],
      contact: [
        { name: 'email', label: 'Email', type: 'email', placeholder: 'your.email@example.com' },
        { name: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 (555) 123-4567' },
        { name: 'website', label: 'Website', type: 'url', placeholder: 'https://yourwebsite.com' }
      ],
      family: [
        { name: 'relationship_status', label: 'Relationship Status', type: 'text', placeholder: 'Single, Married, etc.' },
        { name: 'family_members', label: 'Family Members', type: 'textarea', placeholder: 'Tell about your family' }
      ],
      life_events: [
        { name: 'major_events', label: 'Major Life Events', type: 'textarea', placeholder: 'Graduations, career changes, etc.' }
      ],
      details: [
        { name: 'interests', label: 'Interests', type: 'textarea', placeholder: 'Your hobbies and interests' },
        { name: 'languages', label: 'Languages', type: 'text', placeholder: 'English, Spanish, French' }
      ]
    };

    return fieldMap[section] || [];
  };

  const formatFieldName = (fieldName: string) => {
    return fieldName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="w-full">
      {/* Mobile Dropdown */}
      <div className="md:hidden mb-6">
        <Select value={activeSection} onValueChange={(value) => handleSectionChange(value as AboutSectionId)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ABOUT_SECTIONS.map(section => (
              <SelectItem key={section.id} value={section.id}>
                {section.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop Layout */}
      <div className="flex gap-6">
        {/* Sidebar Navigation - Hidden on mobile */}
        <div className="hidden md:block w-64 flex-shrink-0">
          <Card className="p-2">
            <nav className="space-y-1">
              {ABOUT_SECTIONS.map(section => (
                <button
                  key={section.id}
                  onClick={() => handleSectionChange(section.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    activeSection === section.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </Card>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {SECTIONS_WITH_PRIVATE_PROFILE_FIELDS.has(activeSection) &&
            secureAboutStatus === 'unavailable' && (
              <div
                data-testid="about-secure-data-unavailable"
                className="mb-4 rounded-md border border-muted bg-muted/40 px-4 py-3 text-xs text-muted-foreground"
              >
                Private About details are unavailable until the secure field-level read is approved and installed. This does not mean they are empty.
              </div>
            )}
          {SECTIONS_WITH_PRIVATE_PROFILE_FIELDS.has(activeSection) &&
            secureAboutStatus === 'denied' && (
              <div
                data-testid="about-secure-data-denied"
                className="mb-4 rounded-md border border-muted bg-muted/40 px-4 py-3 text-xs text-muted-foreground"
              >
                Some private About details are not visible to you.
              </div>
            )}
          {loading && secureAboutStatus === 'loading' && (
            <div data-testid="about-secure-data-loading" className="sr-only">Loading About details</div>
          )}
          {renderSectionContent(activeSection)}
        </div>
      </div>
    </div>
  );
};

export default AboutSection;