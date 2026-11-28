import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Users, Lock, Settings } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';

// Original PrivacySelector for AboutSection usage
interface PrivacySelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const audienceOptions = [
  { value: 'public', label: 'Public', icon: Globe },
  { value: 'friends', label: 'Friends', icon: Users },
  { value: 'only_me', label: 'Only Me', icon: Lock },
  { value: 'custom', label: 'Custom', icon: Settings }
];

export const PrivacySelector = ({ value, onChange, className }: PrivacySelectorProps) => {
  const selectedOption = audienceOptions.find(option => option.value === value);
  const IconComponent = selectedOption?.icon || Globe;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`w-24 h-8 ${className}`}>
        <div className="flex items-center gap-1">
          <IconComponent className="h-3 w-3" />
          <span className="sr-only">{selectedOption?.label || 'Public'}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {audienceOptions.map(option => {
          const Icon = option.icon;
          return (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{option.label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

// New DefaultPrivacySelector for user's default privacy setting
type PrivacyOption = 'public' | 'friends' | 'only_me';

interface DefaultPrivacySelectorProps {
  className?: string;
}

const privacyOptions = [
  { value: 'public' as const, label: 'Public', icon: Globe, description: 'Anyone can see this' },
  { value: 'friends' as const, label: 'Friends', icon: Users, description: 'Only your friends can see this' },
  { value: 'only_me' as const, label: 'Only Me', icon: Lock, description: 'Only you can see this' }
];

export const DefaultPrivacySelector = ({ className }: DefaultPrivacySelectorProps) => {
  const { profile, updateProfile, loading } = useProfile();
  const { toast } = useToast();

  // Phase 3G-N: `privacy` is a private owner-only profile column. The public
  // useProfile() boundary does not provide it; a safe default is shown until
  // the approved secure owner-only read function is available.
  const currentPrivacy: PrivacyOption = 'public';

  const handlePrivacyChange = async (newPrivacy: PrivacyOption) => {
    try {
      await updateProfile({ privacy: newPrivacy });
      toast({
        title: "Privacy setting updated",
        description: `Default privacy set to ${privacyOptions.find(opt => opt.value === newPrivacy)?.label}`,
      });
    } catch (error) {
      console.error('Error updating privacy setting:', error);
      toast({
        title: "Error updating privacy",
        description: "Failed to save privacy setting. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-xs">
        <div className="h-10 bg-muted animate-pulse rounded-md"></div>
      </div>
    );
  }

  const selectedOption = privacyOptions.find(option => option.value === currentPrivacy);

  return (
    <div className={`w-full max-w-xs ${className}`}>
      <Select value={currentPrivacy} onValueChange={handlePrivacyChange}>
        <SelectTrigger className="w-full h-10 px-3 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors">
          <SelectValue>
            {selectedOption && (
              <div className="flex items-center gap-2">
                <selectedOption.icon className="h-4 w-4 text-muted-foreground" />
                <span>{selectedOption.label}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-background border border-border rounded-md shadow-lg">
          {privacyOptions.map(option => {
            const Icon = option.icon;
            return (
              <SelectItem 
                key={option.value} 
                value={option.value}
                className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};