import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, ExternalLink } from 'lucide-react';
import { buildSocialUrl } from '@/utils/socialLinks';

interface SocialLink {
  type: string;
  url: string;
}

interface SocialLinksManagerProps {
  value: SocialLink[];
  onChange: (links: SocialLink[]) => void;
  label?: string;
}

const socialLinkTypes = [
  { value: 'Facebook', label: 'Facebook', placeholder: 'https://facebook.com/username' },
  { value: 'Instagram', label: 'Instagram', placeholder: 'https://instagram.com/username' },
  { value: 'Twitter', label: 'Twitter/X', placeholder: 'https://twitter.com/username' },
  { value: 'LinkedIn', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/username' },
  { value: 'YouTube', label: 'YouTube', placeholder: 'https://youtube.com/@username' },
  { value: 'TikTok', label: 'TikTok', placeholder: 'https://tiktok.com/@username' },
  { value: 'GitHub', label: 'GitHub', placeholder: 'https://github.com/username' },
  { value: 'Tone', label: 'Tone', placeholder: 'tonesn.vercel.app/profile/username' },
  { value: 'Website', label: 'Personal Website', placeholder: 'https://yourwebsite.com' },
  { value: 'Portfolio', label: 'Portfolio', placeholder: 'https://yourportfolio.com' },
  { value: 'Blog', label: 'Blog', placeholder: 'https://yourblog.com' },
  { value: 'Other', label: 'Other', placeholder: 'https://example.com' }
];

export const SocialLinksManager: React.FC<SocialLinksManagerProps> = ({
  value = [],
  onChange,
  label = "Websites and Social Links"
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newLink, setNewLink] = useState<SocialLink>({ type: 'Website', url: '' });

  const addLink = () => {
    if (newLink.url.trim()) {
      onChange([...value, newLink]);
      setNewLink({ type: 'Website', url: '' });
    }
  };

  const removeLink = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateLink = (index: number, updatedLink: SocialLink) => {
    const updated = value.map((link, i) => i === index ? updatedLink : link);
    onChange(updated);
    setEditingIndex(null);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-4">
      <Label>{label}</Label>
      
      {/* Display existing links */}
      <div className="space-y-2">
        {value.map((link, index) => (
          <div key={index} className="flex items-center gap-2 p-3 border border-border rounded-lg">
            {editingIndex === index ? (
              <div className="flex-1 flex items-center gap-2">
                <Select
                  value={link.type}
                  onValueChange={(type) => updateLink(index, { ...link, type })}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {socialLinkTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={link.url}
                  onChange={(e) => updateLink(index, { ...link, url: e.target.value })}
                  placeholder={socialLinkTypes.find(t => t.value === link.type)?.placeholder || 'https://example.com'}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => setEditingIndex(null)}
                  disabled={!link.url.trim() || !isValidUrl(link.url)}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelEdit}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      {socialLinkTypes.find(t => t.value === link.type)?.label || link.type}:
                    </span>
                    <a
                      href={buildSocialUrl(link.type, link.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {link.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(index)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeLink(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add new link form */}
      <div className="flex items-center gap-2 p-3 border border-dashed border-border rounded-lg">
        <Select
          value={newLink.type}
          onValueChange={(type) => setNewLink({ ...newLink, type })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {socialLinkTypes.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={newLink.url}
          onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
          placeholder={socialLinkTypes.find(t => t.value === newLink.type)?.placeholder || 'https://example.com'}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={addLink}
          disabled={!newLink.url.trim() || !isValidUrl(newLink.url)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
};