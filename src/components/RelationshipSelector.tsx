import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Heart } from 'lucide-react';
import { ProfileFieldVisibilitySelector } from '@/components/profile/ProfileFieldVisibilitySelector';
import type { ProfileVisibility } from '@/lib/profileAboutPrivacy';

interface RelationshipSelectorProps {
  value: string;
  visibility: ProfileVisibility;
  onValueChange: (value: string) => void;
  onVisibilityChange: (visibility: ProfileVisibility) => void;
  className?: string;
}

const relationshipOptions = [
  { value: 'single', label: 'Single' },
  { value: 'in_relationship', label: 'In a relationship' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' }
];

export const RelationshipSelector: React.FC<RelationshipSelectorProps> = ({
  value,
  visibility,
  onValueChange,
  onVisibilityChange,
  className
}) => {
  return (
    <div className={className}>
      <Label className="text-sm font-medium flex items-center gap-2 mb-2">
        <Heart className="h-4 w-4 text-primary" />
        Relationship Status
      </Label>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className="flex-1 h-14 border-0">
            <SelectValue placeholder="Select relationship status">
              {relationshipOptions.find(option => option.value === value)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {relationshipOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ProfileFieldVisibilitySelector
          fieldKey="relationship_visibility"
          value={visibility}
          onChange={onVisibilityChange}
          compact={false}
        />
      </div>
    </div>
  );
};
