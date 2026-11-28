import { useEffect, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useOtherNames } from '@/hooks/useOtherNames';
import { dataClient } from '@/lib/supabase/dataClient';
import { normalizeVisibilityValue } from '@/utils/profileValidation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, User, Eye, Lock, Globe, type LucideIcon } from 'lucide-react';

/**
 * Phase 3G-N: this is a PUBLIC profile component.
 *
 * It must never read private columns from public.profiles. The old wildcard
 * profiles read (`select('*')`) and all client-side visibility-gated private
 * rows were removed: client-side visibility is not a database security boundary.
 * Owner-only private overview details require the approved future secure
 * owner-only read function and are explicitly marked as blocked below.
 */

interface OverviewSectionProps {
  profileId: string;
  isOwnProfile: boolean;
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

interface OverviewItem {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}

const OverviewSection = ({ profileId, isOwnProfile }: OverviewSectionProps) => {
  // Public six-column projection only.
  const { profile } = useProfile(profileId);
  const { otherNames } = useOtherNames(profileId);
  const [currentCity, setCurrentCity] = useState<string | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    const loadPublicExtras = async () => {
      try {
        // `profile_details` is a separate table, not a private profiles column.
        const [{ data: place }, { data: family }] = await Promise.all([
          dataClient
            .from('profile_details')
            .select('field_value')
            .eq('profile_id', profileId)
            .eq('section', 'places')
            .eq('field_name', 'current_city')
            .maybeSingle(),
          dataClient
            .from('family_relationships')
            .select(`
              id,
              member_id,
              relation_type,
              visibility,
              profiles!family_relationships_member_id_fkey(display_name, username)
            `)
            .eq('user_id', profileId),
        ]);

        if (cancelled) return;
        setCurrentCity(typeof place?.field_value === 'string' ? place.field_value : null);
        setFamilyMembers((family ?? []) as FamilyMember[]);
      } catch {
        if (!cancelled) {
          setCurrentCity(null);
          setFamilyMembers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPublicExtras();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // Visibility values for the separate family_relationships/other_names tables
  // are presentation hints only; they are not a profile-column security gate.
  const isVisible = (visibility: string): boolean => {
    const normalized = normalizeVisibilityValue(visibility);
    return normalized === 'public';
  };

  const visibilityIcon = (visibility: string) => {
    const normalized = normalizeVisibilityValue(visibility);
    return normalized === 'public' ? <Eye className="h-3 w-3" /> : <Lock className="h-3 w-3" />;
  };

  const sections: Array<{ title: string; items: OverviewItem[] }> = [];

  // `bio` is one of the six approved public profile columns.
  if (profile?.bio) {
    sections.push({
      title: 'About',
      items: [{ icon: User, label: 'Bio', value: <span>{profile.bio}</span> }],
    });
  }

  if (currentCity) {
    sections.push({
      title: 'Contact and Basic Info',
      items: [
        {
          icon: MapPin,
          label: 'Current City',
          value: <span>{currentCity}</span>,
        },
      ],
    });
  }

  const visibleFamily = familyMembers.filter((member) => member.profiles && isVisible(member.visibility));
  if (visibleFamily.length > 0) {
    sections.push({
      title: 'Family and Relationships',
      items: [
        {
          icon: Users,
          label: 'Family',
          value: (
            <div className="flex flex-wrap gap-1">
              {visibleFamily.map((member) => (
                <div key={member.id} className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-xs">
                    {member.relation_type}: {member.profiles?.display_name}
                  </Badge>
                  {visibilityIcon(member.visibility)}
                </div>
              ))}
            </div>
          ),
        },
      ],
    });
  }

  const visibleOtherNames = otherNames.filter((name) => isVisible(name.visibility));
  if (visibleOtherNames.length > 0) {
    sections.push({
      title: 'Details About You',
      items: [
        {
          icon: User,
          label: 'Other Names',
          value: (
            <div className="flex flex-wrap gap-1">
              {visibleOtherNames.map((name) => (
                <div key={name.id} className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs">
                    {name.type}: {name.name}
                  </Badge>
                  {visibilityIcon(name.visibility)}
                </div>
              ))}
            </div>
          ),
        },
      ],
    });
  }

  const renderBody = () => {
    if (loading) return <div className="text-muted-foreground">Loading...</div>;
    if (sections.length === 0) return <div className="text-muted-foreground">No information to show</div>;

    return (
      <div className="space-y-4 md:space-y-6">
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
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs md:text-sm font-medium text-muted-foreground">{item.label}</div>
                      <div className="text-xs md:text-sm text-foreground break-words">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        {isOwnProfile && (
          <p className="text-xs text-muted-foreground">
            Additional private overview details are awaiting the secure owner-only read implementation.
          </p>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-sm md:text-base">
          <Globe className="h-5 w-5" />
          Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0 md:pt-0">{renderBody()}</CardContent>
    </Card>
  );
};

export default OverviewSection;
