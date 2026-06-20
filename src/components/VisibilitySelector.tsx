import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Users, Lock, List } from 'lucide-react';

export type Visibility = "public" | "friends" | "only_me";

interface VisibilitySelectorProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  className?: string;
  placeholder?: string;
}

const visibilityOptions = [
  { value: "public" as const, label: "Public", icon: Globe, description: "Anyone can see this" },
  { value: "friends" as const, label: "Friends", icon: Users, description: "Only your friends can see this" },
  { value: "only_me" as const, label: "Only Me", icon: Lock, description: "Only you can see this" }
];

export const VisibilitySelector = ({ 
  value, 
  onChange, 
  className,
  placeholder = "Select visibility" 
}: VisibilitySelectorProps) => {
  const selectedOption = visibilityOptions.find(option => option.value === value);

  return (
    <Select value={value} onValueChange={(v) => onChange(v as Visibility)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {selectedOption && (
            <div className="flex items-center gap-1 md:gap-2">
              <selectedOption.icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{selectedOption.label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {visibilityOptions.map(option => {
          const Icon = option.icon;
          return (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};