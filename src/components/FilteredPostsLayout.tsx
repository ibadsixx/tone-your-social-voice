import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ProfileContentSection } from './ProfileContentSection';
import { Image, Video, Share2, Grid3X3 } from 'lucide-react';
import type { ProfileSectionFilter } from '@/lib/profileSections';
import type { ProfileContentKind } from '@/api/profileContent';

interface FilteredPostsLayoutProps {
  profileId: string;
  coverPic?: string | null;
  // When provided, the profile section is controlled by the URL (the parent
  // derives it from the route) and clicks are reported back to the parent so it
  // can navigate. Without these props the component falls back to local state,
  // which keeps it usable on its own.
  activeFilter?: ProfileSectionFilter;
  onFilterChange?: (filter: ProfileSectionFilter) => void;
}

const FILTER_KIND: Record<ProfileSectionFilter, ProfileContentKind> = {
  all: 'posts',
  photos: 'photos',
  reels: 'reels',
  shared: 'shared',
};

const FilteredPostsLayout = ({
  profileId,
  coverPic,
  activeFilter: controlledFilter,
  onFilterChange,
}: FilteredPostsLayoutProps) => {
  const [internalFilter, setInternalFilter] = useState<ProfileSectionFilter>('all');
  const activeFilter = controlledFilter ?? internalFilter;

  const handleFilterChange = (filter: ProfileSectionFilter) => {
    setInternalFilter(filter);
    onFilterChange?.(filter);
  };

  const filters = [
    { id: 'all', label: 'Posts', icon: Grid3X3 },
    { id: 'photos', label: 'Photos', icon: Image },
    { id: 'reels', label: 'Reels', icon: Video },
    { id: 'shared', label: 'Shared', icon: Share2 },
  ] as const;

  // The section chrome is rendered unconditionally. It used to disappear into a
  // full-page skeleton while posts loaded, which meant the page the visitor had
  // just chosen a section on visibly reset underneath them; now only the
  // CONTENT of the loading section shows a skeleton (do.md 12).
  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 flex-shrink-0">
        <div className="sticky top-20 space-y-1">
          {filters.map(filter => {
            const Icon = filter.icon;
            return (
              <button
                key={filter.id}
                data-testid={`profile-section-${filter.id}`}
                onClick={() => handleFilterChange(filter.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                  activeFilter === filter.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Tabs */}
      <div className="md:hidden w-full overflow-x-auto">
        <div className="flex space-x-2 pb-4 min-w-max">
          {filters.map(filter => {
            const Icon = filter.icon;
            return (
              <button
                key={filter.id}
                data-testid={`profile-section-${filter.id}`}
                onClick={() => handleFilterChange(filter.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors",
                  activeFilter === filter.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/*
        All four sections stay mounted so each keeps its own cursor and its own
        already-loaded items, and only the active one is enabled — switching tabs
        starts that section's own feed instead of refetching another's.
      */}
      {filters.map(filter => (
        <ProfileContentSection
          key={filter.id}
          kind={FILTER_KIND[filter.id]}
          variant={filter.id}
          profileId={profileId}
          active={activeFilter === filter.id}
          enabled={activeFilter === filter.id}
          coverPic={coverPic}
        />
      ))}
    </div>
  );
};

export default FilteredPostsLayout;
