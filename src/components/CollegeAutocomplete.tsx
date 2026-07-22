import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Loader2, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useColleges, type College } from '@/hooks/useColleges';
import { gateway } from '@/lib/gateway';

interface CollegeAutocompleteProps {
  label: string;
  placeholder: string;
  value: College | null; // Selected college object
  onChange: (college: College | null) => void;
  className?: string;
}

export const CollegeAutocomplete = ({ 
  label, 
  placeholder, 
  value, 
  onChange,
  className 
}: CollegeAutocompleteProps) => {
  const [inputValue, setInputValue] = useState('');
  const [allColleges, setAllColleges] = useState<College[]>([]);
  const [filteredColleges, setFilteredColleges] = useState<College[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCollegeName, setNewCollegeName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const { colleges, loading } = useColleges();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Load all colleges on mount
  useEffect(() => {
    setAllColleges(colleges);
  }, [colleges]);

  // Filter colleges based on input value
  useEffect(() => {
    if (inputValue.length >= 1) {
      const filtered = allColleges.filter(college =>
        college.name.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredColleges(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredColleges([]);
      setShowSuggestions(false);
    }
    setSelectedIndex(-1);
  }, [inputValue, allColleges]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // If user starts typing and there's a selected college, clear it
    if (value) {
      onChange(null);
    }
  };

  const handleSuggestionClick = (college: College) => {
    onChange(college);
    setInputValue(''); // Clear input after selection
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleClearSelection = () => {
    onChange(null);
    setInputValue('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredColleges.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredColleges.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredColleges.length) {
          handleSuggestionClick(filteredColleges[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay hiding suggestions to allow click events on suggestions
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(e.relatedTarget as Node)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    }, 200);
  };

  const handleFocus = () => {
    if (inputValue.length >= 1 && !value) {
      setShowSuggestions(filteredColleges.length > 0);
    }
  };

  const handleAddCollege = async () => {
    if (!newCollegeName.trim()) return;
    
    setAddLoading(true);
    try {
      const { data, error } = await gateway
        .from('colleges')
        .insert([{ name: newCollegeName.trim() }])
        .select('id, name')
        .single();

      if (error) throw error;

      if (data) {
        setAllColleges(prev => [...prev, data]);
        onChange(data);
        setNewCollegeName('');
        setShowAddForm(false);
      }
    } catch (error) {
      console.error('Error creating college:', error);
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <Label htmlFor={label.toLowerCase().replace(/\s+/g, '-')}>
        {label}
      </Label>
      
      {showAddForm && (
        <div className="mb-2 p-3 border rounded-md bg-muted/50">
          <div className="flex gap-2">
            <Input
              placeholder="Enter college name"
              value={newCollegeName}
              onChange={(e) => setNewCollegeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCollege();
                } else if (e.key === 'Escape') {
                  setShowAddForm(false);
                  setNewCollegeName('');
                }
              }}
            />
            <Button size="sm" onClick={handleAddCollege} disabled={!newCollegeName.trim() || addLoading}>
              {addLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setShowAddForm(false);
              setNewCollegeName('');
            }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      
      <div className="relative">
        {value ? (
          // Show selected college
          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <GraduationCap className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-medium">{value.name}</span>
            </div>
            <button
              type="button"
              className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-sm flex items-center justify-center"
              onClick={handleClearSelection}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          // Show input for searching
          <Input
            ref={inputRef}
            id={label.toLowerCase().replace(/\s+/g, '-')}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={handleFocus}
            placeholder={placeholder}
            className="pr-8"
          />
        )}
        
        {loading && !value && (
          <Loader2 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {!loading && !value && inputValue && (
          <GraduationCap className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {showSuggestions && filteredColleges.length > 0 && (
        <Card 
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-auto border bg-popover p-1 shadow-lg"
        >
          {filteredColleges.map((college, index) => (
            <div
              key={college.id}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
              onClick={() => handleSuggestionClick(college)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <GraduationCap className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{college.name}</p>
              </div>
            </div>
          ))}
        </Card>
      )}

      {!showAddForm && (
        <button
          type="button"
          className="mt-2 text-sm text-primary hover:text-primary/80 flex items-center gap-1"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-3 w-3" />
          Add your college
        </button>
      )}
    </div>
  );
};