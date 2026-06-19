import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useOtherNames } from '@/hooks/useOtherNames';
import { useFriends } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, 
  GraduationCap, 
  MapPin, 
  Mail, 
  Phone, 
  Calendar, 
  Heart, 
  Users,
  User,
  Eye,
  Lock
} from 'lucide-react';

interface OverviewSectionProps {
  profileId: string;
  isOwnProfile: boolean;
}

interface ExtendedProfile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  email: string | null;
  phone_country_code: string | null;
  phone_number: string | null;
  birthday: string | null;
  birth_date: string | null;
  birth_year: number | null;
  function: string | null;
  company_id: string | null;
  college_id: string | null;
  high_school_id: string | null;
  relationship_status: string | null;
  about_you: string | null;
  gender: string | null;
  pronouns: string | null;
  // Visibility fields
  email_visibility: string;
  phone_visibility: string;
  birth_date_visibility: string;
  birth_year_visibility: string;
  function_visibility: string;
  company_visibility: string;
  college_visibility: string;
  high_school_visibility: string;
  relationship_visibility: string;
  about_you_visibility: string;
  gender_visibility: string;
  pronouns_visibility: string;
  // Related data
  companies?: { name: string; type: string };
  colleges?: { name: string };
  high_schools?: { name: string };
}

interface FamilyMember {
  id: string;
  member_id: string;
  relation_type: string;
  visibility: string;
  profiles?: {
    display_name: string;
    username: string;
  };
}

const OverviewSection = ({ profileId, isOwnProfile }: OverviewSectionProps) => {
  const { user } = useAuth();
  const { profile: basicProfile } = useProfile(profileId);
  const { otherNames } = useOtherNames(profileId);
  const { friends } = useFriends(user?.id);
  const [extendedProfile, setExtendedProfile] = useState<ExtendedProfile | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Check if current user is friends with profile owner
  const isFriend = friends.some(friend => friend.id === profileId);
  const currentUserId = user?.id;

  useEffect(() => {
    const fetchExtendedProfile = async () => {
      if (!profileId) return;

      try {
        // Fetch extended profile data with related information
        const { data: profile, error } = await supabase
          .from('profiles')
          .select(`
            *,
            companies:company_id(name, type),
            colleges:college_id(name),
            high_schools:high_school_id(name)
          `)
          .eq('id', profileId)
          .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (profile) {
          setExtendedProfile(profile as ExtendedProfile);
        }

        // Fetch family relationships
        const { data: family, error: familyError } = await supabase
          .from('family_relationships')
          .select(`
            id,
            member_id,
            relation_type,
            visibility,
            profiles!family_relationships_member_id_fkey(display_name, username)
          `)
          .eq('user_id', profileId);

        if (familyError) throw familyError;

        setFamilyMembers(family || []);
      } catch (error) {
        console.error('Error fetching extended profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchExtendedProfile();
  }, [profileId]);

  // Helper function to check if field should be visible based on visibility setting
  const isFieldVisible = (visibility: string): boolean => {
    if (isOwnProfile) return true; // Owner can always see their own data
    
    switch (visibility) {
      case 'public':
        return true;
      case 'friends':
        return isFriend;
      case 'private':
        return false;
      default:
        return false;
    }
  };

  // Helper function to get visibility icon
  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return <Eye className="h-3 w-3" />;
      case 'friends':
        return <Users className="h-3 w-3" />;
      case 'private':
        return <Lock className="h-3 w-3" />;
      default:
        return <Eye className="h-3 w-3" />;
    }
  };

  // Helper function to format phone number
  const formatPhoneNumber = (countryCode: string, number: string): string => {
    return `${countryCode} ${number}`;
  };

  // Helper function to format birth date (day + month only)
  const formatBirthDate = (birthDate: string | null): string => {
    if (birthDate) {
      const date = new Date(birthDate);
      return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric'
      });
    }
    return '';
  };

  // Helper function to format birth year
  const formatBirthYear = (birthYear: number | null): string => {
    if (birthYear) {
      return birthYear.toString();
    }
    return '';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!extendedProfile) {
    return (
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          <div className="text-muted-foreground">No information to show</div>
        </CardContent>
      </Card>
    );
  }

  const sections = [];

  // Work and Education Section
  const workEducationItems = [];
  
  if (extendedProfile.function && isFieldVisible(extendedProfile.function_visibility)) {
    let workInfo = extendedProfile.function;
    let currentVisibility = extendedProfile.function_visibility;
    
    if (extendedProfile.companies && isFieldVisible(extendedProfile.company_visibility)) {
      workInfo += ` at ${extendedProfile.companies.name}`;
      // Use company visibility if it's more restrictive
      if (extendedProfile.company_visibility === 'private' || 
          (extendedProfile.company_visibility === 'friends' && extendedProfile.function_visibility === 'public')) {
        currentVisibility = extendedProfile.company_visibility;
      }
    }
    
    workEducationItems.push({
      icon: <Building2 className="h-4 w-4" />,
      label: 'Works as',
      value: (
        <div className="flex items-center gap-2">
          <span>{workInfo}</span>
          {getVisibilityIcon(currentVisibility)}
        </div>
      )
    });
  }

  if (extendedProfile.colleges?.name && isFieldVisible(extendedProfile.college_visibility)) {
    workEducationItems.push({
      icon: <GraduationCap className="h-4 w-4" />,
      label: 'Studied at',
      value: (
        <div className="flex items-center gap-2">
          <span>{extendedProfile.colleges.name}</span>
          {getVisibilityIcon(extendedProfile.college_visibility)}
        </div>
      )
    });
  }

  if (extendedProfile.high_schools?.name && isFieldVisible(extendedProfile.high_school_visibility)) {
    workEducationItems.push({
      icon: <GraduationCap className="h-4 w-4" />,
      label: 'Went to',
      value: (
        <div className="flex items-center gap-2">
          <span>{extendedProfile.high_schools.name}</span>
          {getVisibilityIcon(extendedProfile.high_school_visibility)}
        </div>
      )
    });
  }

  if (workEducationItems.length > 0) {
    sections.push({
      title: 'Work and Education',
      items: workEducationItems
    });
  }

  // Contact and Basic Info Section
  const contactItems = [];

  const profileEmails: string[] = (() => {
    const email = extendedProfile.email;
    if (!email) return [];
    if (Array.isArray(email)) return email;
    try {
      const parsed = JSON.parse(email);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [email];
  })();

  if (profileEmails.length > 0) {
    contactItems.push({
      icon: <Mail className="h-4 w-4" />,
      label: 'Email',
      value: (
        <div className="space-y-1">
          {profileEmails.map((addr, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="break-all">{addr}</span>
              {i === 0 && getVisibilityIcon(extendedProfile.email_visibility)}
            </div>
          ))}
        </div>
      )
    });
  }

  if (extendedProfile.phone_number && isFieldVisible(extendedProfile.phone_visibility)) {
    const phoneNumber = formatPhoneNumber(extendedProfile.phone_country_code || '', extendedProfile.phone_number);
    contactItems.push({
      icon: <Phone className="h-4 w-4" />,
      label: 'Phone',
      value: (
        <div className="flex items-center gap-2">
          <span>{phoneNumber}</span>
          {getVisibilityIcon(extendedProfile.phone_visibility)}
        </div>
      )
    });
  }

  // Add birth date if visible
  if (extendedProfile.birth_date && isFieldVisible(extendedProfile.birth_date_visibility)) {
    const birthDateStr = formatBirthDate(extendedProfile.birth_date);
    if (birthDateStr) {
      contactItems.push({
        icon: <Calendar className="h-4 w-4" />,
        label: 'Birth Date',
        value: (
          <div className="flex items-center gap-2">
            <span>{birthDateStr}</span>
            {getVisibilityIcon(extendedProfile.birth_date_visibility)}
          </div>
        )
      });
    }
  }

  // Add birth year if visible (separate from birth date)
  if (extendedProfile.birth_year && isFieldVisible(extendedProfile.birth_year_visibility)) {
    const birthYearStr = formatBirthYear(extendedProfile.birth_year);
    if (birthYearStr) {
      contactItems.push({
        icon: <Calendar className="h-4 w-4" />,
        label: 'Birth Year',
        value: (
          <div className="flex items-center gap-2">
            <span>{birthYearStr}</span>
            {getVisibilityIcon(extendedProfile.birth_year_visibility)}
          </div>
        )
      });
    }
  }

  // Add gender if visible
  if (extendedProfile.gender && isFieldVisible(extendedProfile.gender_visibility)) {
    contactItems.push({
      icon: <User className="h-4 w-4" />,
      label: 'Gender',
      value: (
        <div className="flex items-center gap-2">
          <span>{extendedProfile.gender}</span>
          {getVisibilityIcon(extendedProfile.gender_visibility)}
        </div>
      )
    });
  }

  // Add pronouns if visible
  if (extendedProfile.pronouns && isFieldVisible(extendedProfile.pronouns_visibility)) {
    contactItems.push({
      icon: <User className="h-4 w-4" />,
      label: 'Pronouns',
      value: (
        <div className="flex items-center gap-2">
          <span>{extendedProfile.pronouns}</span>
          {getVisibilityIcon(extendedProfile.pronouns_visibility)}
        </div>
      )
    });
  }

  if (contactItems.length > 0) {
    sections.push({
      title: 'Contact and Basic Info',
      items: contactItems
    });
  }

  // Family and Relationships Section
  const relationshipItems = [];

  if (extendedProfile.relationship_status && isFieldVisible(extendedProfile.relationship_visibility)) {
    relationshipItems.push({
      icon: <Heart className="h-4 w-4" />,
      label: 'Relationship Status',
      value: (
        <div className="flex items-center gap-2">
          <span>{extendedProfile.relationship_status}</span>
          {getVisibilityIcon(extendedProfile.relationship_visibility)}
        </div>
      )
    });
  }

  // Add visible family members
  const visibleFamily = familyMembers.filter(member => 
    isFieldVisible(member.visibility) && member.profiles
  );

  if (visibleFamily.length > 0) {
    relationshipItems.push({
      icon: <Users className="h-4 w-4" />,
      label: 'Family',
      value: (
        <div className="flex flex-wrap gap-1">
          {visibleFamily.map(member => (
            <div key={member.id} className="flex items-center gap-1">
              <Badge variant="secondary" className="text-xs">
                {member.relation_type}: {member.profiles?.display_name}
              </Badge>
              {getVisibilityIcon(member.visibility)}
            </div>
          ))}
        </div>
      )
    });
  }

  if (relationshipItems.length > 0) {
    sections.push({
      title: 'Family and Relationships',
      items: relationshipItems
    });
  }

  // Details About You Section
  const detailsItems = [];

  if (extendedProfile.about_you && isFieldVisible(extendedProfile.about_you_visibility)) {
    detailsItems.push({
      icon: <User className="h-4 w-4" />,
      label: 'About',
      value: (
        <div className="flex items-center gap-2">
          <span>{extendedProfile.about_you}</span>
          {getVisibilityIcon(extendedProfile.about_you_visibility)}
        </div>
      )
    });
  }

  // Add visible other names
  const visibleOtherNames = otherNames.filter(name => isFieldVisible(name.visibility));
  if (visibleOtherNames.length > 0) {
    detailsItems.push({
      icon: <User className="h-4 w-4" />,
      label: 'Other Names',
      value: (
        <div className="flex flex-wrap gap-1">
          {visibleOtherNames.map(name => (
            <div key={name.id} className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs">
                {name.type}: {name.name}
              </Badge>
              {getVisibilityIcon(name.visibility)}
            </div>
          ))}
        </div>
      )
    });
  }

  if (detailsItems.length > 0) {
    sections.push({
      title: 'Details About You',
      items: detailsItems
    });
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          <div className="text-muted-foreground">No information to show</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6 pt-0 md:pt-0">
        {sections.map((section, sectionIndex) => (
          <div key={section.title}>
            {sectionIndex > 0 && <Separator className="mb-4" />}
            <div className="space-y-2 md:space-y-3">
              <h4 className="font-medium text-xs md:text-sm text-muted-foreground uppercase tracking-wide">
                {section.title}
              </h4>
              <div className="space-y-2 md:space-y-3">
                {section.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex items-start gap-2 md:gap-3">
                    <div className="mt-0.5 text-muted-foreground shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs md:text-sm font-medium text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="text-xs md:text-sm text-foreground break-words">
                        {item.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default OverviewSection;