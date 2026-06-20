import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VisibilitySelector, Visibility } from '@/components/VisibilitySelector';
import { Label } from '@/components/ui/label';
import { Heart } from 'lucide-react';

interface RelationshipSelectorProps {
  value: string;
  visibility: Visibility;
  onValueChange: (value: string) => void;
  onVisibilityChange: (visibility: Visibility) => void;
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
      <div className="flex gap-1.5 md:gap-2">
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className="flex-1 h-14 border-0">
            <SelectValue placeholder="Select relationship status">
              {relationshipOptions.find(opt => opt.value === value)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {relationshipOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <VisibilitySelector
          value={visibility}
          onChange={onVisibilityChange}
          className="w-[80px] md:w-[140px] h-14 border-0"
        />
      </div>
    </div>
  );
};