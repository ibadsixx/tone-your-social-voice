import { Globe, Lock, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  normalizeProfileVisibility,
  PROFILE_VISIBILITY_OPTIONS,
  type ProfileVisibility,
} from '@/lib/profileAboutPrivacy';

interface ProfileFieldVisibilitySelectorProps {
  /** Stable visibility column key, used by regression guards and test ids. */
  fieldKey: string;
  value: string | null | undefined;
  onChange: (value: ProfileVisibility) => void;
  disabled?: boolean;
  compact?: boolean;
}

const ICONS = {
  public: Globe,
  friends: Users,
  private: Lock,
} as const;

/**
 * Owner-facing control for one profile field. It exposes exactly the three
 * supported choices. Legacy stored spellings are displayed as their supported
 * equivalents; unsupported stored values fall back to `private` so the UI never
 * silently widens access.
 */
export const ProfileFieldVisibilitySelector = ({
  fieldKey,
  value,
  onChange,
  disabled = false,
  compact = true,
}: ProfileFieldVisibilitySelectorProps) => {
  const selected = normalizeProfileVisibility(value) ?? 'private';
  const Icon = ICONS[selected];

  return (
    <Select
      value={selected}
      disabled={disabled}
      onValueChange={(next) => {
        const normalized = normalizeProfileVisibility(next);
        if (normalized) onChange(normalized);
      }}
    >
      <SelectTrigger
        data-testid={`visibility-select-${fieldKey}`}
        aria-label={`Who can see ${fieldKey.replace(/_/g, ' ')}`}
        className={compact ? 'w-24 h-8' : 'w-full'}
      >
        <span className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {PROFILE_VISIBILITY_OPTIONS.map((option) => {
          const OptionIcon = ICONS[option.value];
          return (
            <SelectItem key={option.value} value={option.value} title={option.description}>
              <span className="flex items-center gap-2">
                <OptionIcon className="h-3.5 w-3.5" />
                {option.label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};
