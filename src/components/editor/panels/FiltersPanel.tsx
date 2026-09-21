import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sparkles, RotateCcw } from 'lucide-react';
import { VideoFilter, defaultVideoFilter } from '@/types/editor';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FiltersPanelProps {
  filter: VideoFilter;
  onFilterChange: (filter: VideoFilter) => void;
}

// City-inspired filter presets with distinct visual identities
export const cityFilterPresets: { id: string; name: string; filter: VideoFilter }[] = [
  {
    id: 'paris',
    name: 'Paris',
    filter: {
      brightness: 105,
      contrast: 95,
      saturation: 90,
      temperature: 15,
      blur: 0,
      hueRotate: 0,
    },
  },
  {
    id: 'los-angeles',
    name: 'Los Angeles',
    filter: {
      brightness: 110,
      contrast: 115,
      saturation: 130,
      temperature: 20,
      blur: 0,
      hueRotate: 0,
    },
  },
  {
    id: 'oslo',
    name: 'Oslo',
    filter: {
      brightness: 100,
      contrast: 105,
      saturation: 70,
      temperature: -25,
      blur: 0,
      hueRotate: 0,
    },
  },
  {
    id: 'lagos',
    name: 'Lagos',
    filter: {
      brightness: 108,
      contrast: 110,
      saturation: 125,
      temperature: 25,
      blur: 0,
      hueRotate: 5,
    },
  },
  {
    id: 'melbourne',
    name: 'Melbourne',
    filter: {
      brightness: 100,
      contrast: 100,
      saturation: 95,
      temperature: 0,
      blur: 0,
      hueRotate: 0,
    },
  },
  {
    id: 'jakarta',
    name: 'Jakarta',
    filter: {
      brightness: 105,
      contrast: 105,
      saturation: 110,
      temperature: 15,
      blur: 0,
      hueRotate: 10,
    },
  },
  {
    id: 'abu-dhabi',
    name: 'Abu Dhabi',
    filter: {
      brightness: 112,
      contrast: 105,
      saturation: 105,
      temperature: 35,
      blur: 0,
      hueRotate: 355,
    },
  },
  {
    id: 'buenos-aires',
    name: 'Buenos Aires',
    filter: {
      brightness: 98,
      contrast: 120,
      saturation: 85,
      temperature: 5,
      blur: 0,
      hueRotate: 0,
    },
  },
  {
    id: 'new-york',
    name: 'New York',
    filter: {
      brightness: 95,
      contrast: 130,
      saturation: 90,
      temperature: -15,
      blur: 0,
      hueRotate: 0,
    },
  },
  {
    id: 'jaipur',
    name: 'Jaipur',
    filter: {
      brightness: 108,
      contrast: 110,
      saturation: 120,
      temperature: 30,
      blur: 0,
      hueRotate: 350,
    },
  },
  {
    id: 'cairo',
    name: 'Cairo',
    filter: {
      brightness: 110,
      contrast: 108,
      saturation: 95,
      temperature: 40,
      blur: 0,
      hueRotate: 5,
    },
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    filter: {
      brightness: 100,
      contrast: 125,
      saturation: 115,
      temperature: -20,
      blur: 0,
      hueRotate: 340,
    },
  },
  {
    id: 'rio-de-janeiro',
    name: 'Rio de Janeiro',
    filter: {
      brightness: 112,
      contrast: 115,
      saturation: 140,
      temperature: 20,
      blur: 0,
      hueRotate: 5,
    },
  },
];

// Basic filter presets (existing)
export const basicFilterPresets: { id: string; name: string; filter: VideoFilter }[] = [
  {
    id: 'bw',
    name: 'B&W',
    filter: { ...defaultVideoFilter, saturation: 0 },
  },
  {
    id: 'warm',
    name: 'Warm',
    filter: { ...defaultVideoFilter, temperature: 30, saturation: 120 },
  },
  {
    id: 'cool',
    name: 'Cool',
    filter: { ...defaultVideoFilter, temperature: -30, saturation: 90 },
  },
  {
    id: 'vivid',
    name: 'Vivid',
    filter: { ...defaultVideoFilter, contrast: 130, saturation: 120 },
  },
  {
    id: 'fade',
    name: 'Fade',
    filter: { ...defaultVideoFilter, brightness: 110, contrast: 90, saturation: 80 },
  },
  {
    id: 'drama',
    name: 'Drama',
    filter: { ...defaultVideoFilter, contrast: 150, brightness: 90, saturation: 110 },
  },
];

export function FiltersPanel({ filter, onFilterChange }: FiltersPanelProps) {
  const handleChange = (key: keyof VideoFilter, value: number) => {
    onFilterChange({ ...filter, [key]: value });
  };

  const handleReset = () => {
    onFilterChange(defaultVideoFilter);
  };

  const filterControls = [
    { key: 'brightness' as const, label: 'Brightness', min: 0, max: 200, default: 100 },
    { key: 'contrast' as const, label: 'Contrast', min: 0, max: 200, default: 100 },
    { key: 'saturation' as const, label: 'Saturation', min: 0, max: 200, default: 100 },
    { key: 'temperature' as const, label: 'Temperature', min: -100, max: 100, default: 0 },
    { key: 'blur' as const, label: 'Blur', min: 0, max: 20, default: 0 },
  ];

  const isModified = JSON.stringify(filter) !== JSON.stringify(defaultVideoFilter);

  // Generate CSS filter string for preview thumbnails
  const getFilterStyle = (f: VideoFilter): React.CSSProperties => {
    const filters = [
      `brightness(${f.brightness / 100})`,
      `contrast(${f.contrast / 100})`,
      `saturate(${f.saturation / 100})`,
      f.blur > 0 ? `blur(${f.blur}px)` : '',
      f.hueRotate ? `hue-rotate(${f.hueRotate}deg)` : '',
    ].filter(Boolean).join(' ');

    // Temperature simulation via sepia and hue-rotate
    const tempFilter = f.temperature > 0 
      ? `sepia(${Math.min(f.temperature / 100, 0.3)})` 
      : '';

    return {
      filter: `${filters} ${tempFilter}`.trim(),
      background: f.temperature < 0 
        ? `linear-gradient(135deg, hsl(210 70% 50% / ${Math.abs(f.temperature) / 200}), transparent)` 
        : f.temperature > 0 
        ? `linear-gradient(135deg, hsl(30 80% 50% / ${f.temperature / 200}), transparent)`
        : undefined,
    };
  };

  const isFilterActive = (preset: VideoFilter): boolean => {
    return (
      filter.brightness === preset.brightness &&
      filter.contrast === preset.contrast &&
      filter.saturation === preset.saturation &&
      filter.temperature === preset.temperature &&
      (filter.hueRotate || 0) === (preset.hueRotate || 0)
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            <span>Filters</span>
          </div>
          {isModified && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>

        {/* Manual Controls */}
        <div className="space-y-4">
          {filterControls.map(({ key, label, min, max, default: defaultValue }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{label}</Label>
                <span className="text-xs text-muted-foreground">
                  {filter[key]}{key === 'temperature' ? '' : '%'}
                </span>
              </div>
              <Slider
                value={[filter[key]]}
                onValueChange={(v) => handleChange(key, v[0])}
                min={min}
                max={max}
                step={1}
              />
            </div>
          ))}
        </div>

        {/* City Filters Section */}
        <div className="space-y-2 pt-2 border-t border-border">
          <Label className="text-xs font-medium">City Filters</Label>
          <div className="grid grid-cols-2 gap-2">
            {cityFilterPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onFilterChange(preset.filter)}
                className={`relative overflow-hidden rounded-lg border transition-all ${
                  isFilterActive(preset.filter)
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div 
                  className="aspect-video bg-gradient-to-br from-muted to-muted-foreground/20 flex items-center justify-center"
                  style={getFilterStyle(preset.filter)}
                >
                  <div className="w-8 h-8 rounded-full bg-foreground/20" />
                </div>
                <div className="px-2 py-1.5 text-xs font-medium text-center bg-background/80 backdrop-blur-sm">
                  {preset.name}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Basic Presets Section */}
        <div className="space-y-2 pt-2 border-t border-border">
          <Label className="text-xs font-medium">Basic Presets</Label>
          <div className="grid grid-cols-3 gap-2">
            {basicFilterPresets.map((preset) => (
              <Button
                key={preset.id}
                variant={isFilterActive(preset.filter) ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-8"
                onClick={() => onFilterChange(preset.filter)}
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
