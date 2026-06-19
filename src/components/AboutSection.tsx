import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { PrivacySelector } from './PrivacySelector';
import { sanitizeProfilePayload, normalizeVisibilityValue } from '@/utils/profileValidation';
import { FamilyAndRelationships } from './FamilyAndRelationships';
import { LifeEventsSection } from './LifeEventsSection';
import { DetailsAboutYouSection } from './DetailsAboutYouSection';
import { useProfile } from '@/hooks/useProfile';
import OverviewSection from './OverviewSection';

interface AboutSectionProps {
  profileId: string;
  isOwnProfile: boolean;
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

interface ProfileData {
  email?: string;
  phone_country_code?: string;
  phone_number?: string;
  websites_social_links?: SocialLink[];
  gender?: string;
  pronouns?: string;
  birth_date?: string;
  birth_year?: number;
  phone_visibility?: string;
  websites_visibility?: string;
  gender_visibility?: string;
  pronouns_visibility?: string;
  birth_date_visibility?: string;
  birth_year_visibility?: string;
}

const aboutSections = [
  { id: 'overview', label: 'Overview' },
  { id: 'work_education', label: 'Work and Education' },
  { id: 'places', label: 'Places Lived' },
  { id: 'contact', label: 'Contact and Basic Info' },
  { id: 'family', label: 'Family and Relationships' },
  { id: 'life_events', label: 'Life Events' },
  { id: 'details', label: 'Details About You' }
];

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

const AboutSection = ({ profileId, isOwnProfile }: AboutSectionProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { profile, refetch: refetchProfile } = useProfile(profileId);
  const [profileDetails, setProfileDetails] = useState<ProfileDetail[]>([]);
  const [profileData, setProfileData] = useState<ProfileData>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [visibilityForm, setVisibilityForm] = useState<Record<string, string>>({});
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const [selectedHighSchool, setSelectedHighSchool] = useState<HighSchool | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    fetchProfileDetails();
  }, [profileId]);

  const fetchProfileDetails = async () => {
    try {
      // Fetch profile_details
      const { data: details, error: detailsError } = await supabase
        .from('profile_details')
        .select('*')
        .eq('profile_id', profileId);

      if (detailsError) throw detailsError;

      // Fetch complete profile data including new fields
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select(`
          email,
          function,
          company_id,
          college_id,
          high_school_id,
          phone_country_code,
          phone_number,
          websites_social_links,
          gender,
          pronouns,
          birth_date,
          birth_year,
          function_visibility,
          company_visibility,
          college_visibility,
          high_school_visibility,
          phone_visibility,
          websites_visibility,
          gender_visibility,
          pronouns_visibility,
          birth_date_visibility,
          birth_year_visibility,
          companies(name, type),
          colleges(name),
          high_schools(name)
        `)
        .eq('id', profileId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      // Set profile data for new fields
      if (profile) {
        setProfileData({
          email: user?.email || '', // Get email from auth
          phone_country_code: profile.phone_country_code,
          phone_number: profile.phone_number,
          websites_social_links: (profile.websites_social_links as unknown as SocialLink[]) || [],
          gender: profile.gender,
          pronouns: profile.pronouns,
          birth_date: profile.birth_date,
          birth_year: profile.birth_year,
          // Normalize visibility values on load to handle legacy "Only Me" → "private"
          phone_visibility: normalizeVisibilityValue(profile.phone_visibility) || 'public',
          websites_visibility: normalizeVisibilityValue(profile.websites_visibility) || 'public',
          gender_visibility: normalizeVisibilityValue(profile.gender_visibility) || 'public',
          pronouns_visibility: normalizeVisibilityValue(profile.pronouns_visibility) || 'public',
          birth_date_visibility: normalizeVisibilityValue(profile.birth_date_visibility) || 'public',
          birth_year_visibility: normalizeVisibilityValue(profile.birth_year_visibility) || 'public'
        });
      }

      let allDetails = details || [];

      // Add work_education details from profiles table
      if (profile) {
        if (profile.function) {
          allDetails.push({
            id: 'function',
            section: 'work_education',
            field_name: 'job_function',
            field_value: profile.function,
            profile_id: profileId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
        
        if (profile.companies) {
          const company = profile.companies as any;
          allDetails.push({
            id: 'company',
            section: 'work_education',
            field_name: 'job_company',
            field_value: `${company.name} (${company.type})`,
            profile_id: profileId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          
          // Set selected company for editing
          setSelectedCompany({
            id: profile.company_id,
            name: company.name,
            type: company.type
          });
        }

        if (profile.colleges?.name) {
          allDetails.push({
            id: 'college',
            section: 'work_education',
            field_name: 'college',
            field_value: profile.colleges.name,
            profile_id: profileId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          
          // Set selected college for editing
          setSelectedCollege({
            id: profile.college_id,
            name: profile.colleges.name
          });
        }

        if (profile.high_schools?.name) {
          allDetails.push({
            id: 'high_school',
            section: 'work_education',
            field_name: 'high_school',
            field_value: profile.high_schools.name,
            profile_id: profileId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          
          // Set selected high school for editing
          setSelectedHighSchool({
            id: profile.high_school_id,
            name: profile.high_schools.name
          });
        }
      }

      setProfileDetails(allDetails);
    } catch (error: any) {
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
    const sectionDetails = getDetailsBySection(section);
    const formData: Record<string, any> = {};
    const visibilityData: Record<string, string> = {};
    
    // Handle regular profile details sections
    sectionDetails.forEach(detail => {
      formData[detail.field_name] = detail.field_value;
    });
    
    // Handle contact section with profile data
    if (section === 'contact') {
      formData.email = profileData.email || '';
      formData.phone_country_code = profileData.phone_country_code || '+1';
      formData.phone_number = profileData.phone_number || '';
      formData.websites_social_links = profileData.websites_social_links || [];
      formData.gender = profileData.gender || '';
      formData.pronouns = profileData.pronouns || '';
      formData.birth_date = profileData.birth_date ? new Date(profileData.birth_date) : null;
      formData.birth_year = profileData.birth_year || '';
      
      // Normalize visibility values on load  
      visibilityData.phone_visibility = normalizeVisibilityValue(profileData.phone_visibility) || 'public';
      visibilityData.websites_visibility = normalizeVisibilityValue(profileData.websites_visibility) || 'public';
      visibilityData.gender_visibility = normalizeVisibilityValue(profileData.gender_visibility) || 'public';
      visibilityData.pronouns_visibility = normalizeVisibilityValue(profileData.pronouns_visibility) || 'public';
      visibilityData.birth_date_visibility = normalizeVisibilityValue(profileData.birth_date_visibility) || 'public';
      visibilityData.birth_year_visibility = normalizeVisibilityValue(profileData.birth_year_visibility) || 'public';
    }
    
    // Load current visibility settings from profile for work_education
    if (section === 'work_education') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('function_visibility, company_visibility, college_visibility, high_school_visibility')
        .eq('id', profileId)
        .single();
        
      if (profile) {
        // Normalize visibility values on load to handle legacy values
        visibilityData.function_visibility = normalizeVisibilityValue(profile.function_visibility) || 'public';
        visibilityData.company_visibility = normalizeVisibilityValue(profile.company_visibility) || 'public';
        visibilityData.college_visibility = normalizeVisibilityValue(profile.college_visibility) || 'public';
        visibilityData.high_school_visibility = normalizeVisibilityValue(profile.high_school_visibility) || 'public';
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

    try {
      if (section === 'work_education') {
        // Handle work_education section with profiles table
        const updateData: any = {};
        
        if (editForm.job_function) updateData.function = editForm.job_function;
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
        if (visibilityForm.function_visibility) updateData.function_visibility = visibilityForm.function_visibility;
        if (visibilityForm.company_visibility) updateData.company_visibility = visibilityForm.company_visibility;
        if (visibilityForm.college_visibility) updateData.college_visibility = visibilityForm.college_visibility;
        if (visibilityForm.high_school_visibility) updateData.high_school_visibility = visibilityForm.high_school_visibility;

        // Apply sanitization for proper casing
        const sanitizedData = sanitizeProfilePayload(updateData);

        const { error } = await supabase
          .from('profiles')
          .update(sanitizedData)
          .eq('id', profileId);

        if (error) throw error;
      } else if (section === 'contact') {
        // Handle contact section with profiles table for new fields
        const updateData: any = {};
        
        // Phone fields
        if (editForm.phone_country_code) updateData.phone_country_code = editForm.phone_country_code;
        if (editForm.phone_number) updateData.phone_number = editForm.phone_number;
        
        // Websites and social links
        if (editForm.websites_social_links) updateData.websites_social_links = editForm.websites_social_links;
        
        // Basic info fields
        if (editForm.gender) updateData.gender = editForm.gender;
        if (editForm.pronouns) updateData.pronouns = editForm.pronouns;
        if (editForm.birth_date) updateData.birth_date = editForm.birth_date;
        if (editForm.birth_year) updateData.birth_year = parseInt(editForm.birth_year) || null;
        
        // Add visibility settings to update data
        if (visibilityForm.phone_visibility) updateData.phone_visibility = visibilityForm.phone_visibility;
        if (visibilityForm.websites_visibility) updateData.websites_visibility = visibilityForm.websites_visibility;
        if (visibilityForm.gender_visibility) updateData.gender_visibility = visibilityForm.gender_visibility;
        if (visibilityForm.pronouns_visibility) updateData.pronouns_visibility = visibilityForm.pronouns_visibility;
        if (visibilityForm.birth_date_visibility) updateData.birth_date_visibility = visibilityForm.birth_date_visibility;
        if (visibilityForm.birth_year_visibility) updateData.birth_year_visibility = visibilityForm.birth_year_visibility;

        // Apply sanitization for proper casing
        const sanitizedData = sanitizeProfilePayload(updateData);

        const { error } = await supabase
          .from('profiles')
          .update(sanitizedData)
          .eq('id', profileId);

        if (error) throw error;
      } else {
        // Handle other sections with profile_details table
        // Delete existing details for this section
        await supabase
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
          const { error } = await supabase
            .from('profile_details')
            .insert(detailsToInsert);

          if (error) throw error;
        }
      }

      await fetchProfileDetails();
      setEditingSection(null);
      setEditForm({});
      setVisibilityForm({});

      toast({
        title: 'Success',
        description: 'Profile details updated successfully'
      });
    } catch (error: any) {
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
          profile={profile}
          isOwnProfile={isOwnProfile}
          onProfileUpdate={refetchProfile}
        />
      );
    }

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">
            {aboutSections.find(s => s.id === section)?.label}
          </CardTitle>
          {isOwnProfile && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditSection(section)}
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
                <Label>Email</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={editForm.email || ''}
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
                  <PrivacySelector
                    value={visibilityForm.phone_visibility || 'public'}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, phone_visibility: value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <CountrySelector
                    value={editForm.phone_country_code || '+1'}
                    onChange={(code) => setEditForm(prev => ({ ...prev, phone_country_code: code }))}
                  />
                  <Input
                    value={editForm.phone_number || ''}
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
                  <PrivacySelector
                    value={visibilityForm.websites_visibility || 'public'}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, websites_visibility: value }))}
                  />
                </div>
                <SocialLinksManager
                  value={editForm.websites_social_links || []}
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
                  <PrivacySelector
                    value={visibilityForm.gender_visibility || 'public'}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, gender_visibility: value }))}
                  />
                </div>
                <Select value={editForm.gender || ''} onValueChange={(value) => setEditForm(prev => ({ ...prev, gender: value }))}>
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
                  <PrivacySelector
                    value={visibilityForm.pronouns_visibility || 'public'}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, pronouns_visibility: value }))}
                  />
                </div>
                <Select value={editForm.pronouns || ''} onValueChange={(value) => setEditForm(prev => ({ ...prev, pronouns: value }))}>
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
                  <PrivacySelector
                    value={visibilityForm.birth_date_visibility || 'public'}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, birth_date_visibility: value }))}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editForm.birth_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editForm.birth_date ? format(editForm.birth_date, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={editForm.birth_date}
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
                  <PrivacySelector
                    value={visibilityForm.birth_year_visibility || 'public'}
                    onChange={(value) => setVisibilityForm(prev => ({ ...prev, birth_year_visibility: value }))}
                  />
                </div>
                <Input
                  type="number"
                  value={editForm.birth_year || ''}
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
    
    return (
      <div className="space-y-4">
        {fields.map(field => (
          <div key={field.name} className="space-y-2">
            {section === 'places' && (field.name === 'current_city' || field.name === 'hometown') ? (
              <LocationAutocomplete
                label={field.label}
                placeholder={field.placeholder}
                value={editForm[field.name] || ''}
                onChange={(value) => updateFormField(field.name, value)}
              />
            ) : field.name === 'job_function' ? (
              <>
                <Label htmlFor={field.name}>{field.label}</Label>
                <Select value={editForm[field.name] || ''} onValueChange={(value) => updateFormField(field.name, value)}>
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
                    value={editForm[field.name] || ''}
                    onChange={(e) => updateFormField(field.name, e.target.value)}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <Input
                    id={field.name}
                    type={field.type}
                    value={editForm[field.name] || ''}
                    onChange={(e) => updateFormField(field.name, e.target.value)}
                    placeholder={field.placeholder}
                  />
                )}
              </>
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
    if (details.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-8">
          {isOwnProfile 
            ? `Add information to your ${aboutSections.find(s => s.id === section)?.label.toLowerCase()} section`
            : `No ${aboutSections.find(s => s.id === section)?.label.toLowerCase()} information available`
          }
        </div>
      );
    }

    // Special formatting for work_education section
    if (section === 'work_education') {
      const jobFunction = details.find(d => d.field_name === 'job_function')?.field_value;
      const jobCompany = details.find(d => d.field_name === 'job_company')?.field_value;
      const college = details.find(d => d.field_name === 'college')?.field_value;
      const highSchool = details.find(d => d.field_name === 'high_school')?.field_value;

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
      const hasContactInfo = profileData.email || 
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
                {profileData.email && (
                  <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-3">
                    <span className="text-xs md:text-sm font-medium text-muted-foreground md:w-20">Email:</span>
                    <div className="flex items-center gap-1 md:gap-2">
                      <span className="text-sm">{profileData.email}</span>
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
        <Select value={activeSection} onValueChange={setActiveSection}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {aboutSections.map(section => (
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
              {aboutSections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
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
          {renderSectionContent(activeSection)}
        </div>
      </div>
    </div>
  );
};

export default AboutSection;