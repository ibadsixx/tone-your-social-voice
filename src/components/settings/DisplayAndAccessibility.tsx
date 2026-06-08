import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, Type, Eye, EyeOff, Contrast, Sparkles } from 'lucide-react';

const STORAGE_KEYS = {
  fontScale: 'display-font-scale',
  reduceMotion: 'display-reduce-motion',
  reduceTransparency: 'display-reduce-transparency',
  highContrast: 'display-contrast',
};

type FontScale = 'small' | 'normal' | 'large';
type Theme = 'light' | 'dark' | 'system';

const getStored = <T,>(key: string, fallback: T): T => {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? (JSON.parse(val) as T) : fallback;
  } catch {
    return fallback;
  }
};

const applyClasses = () => {
  const root = document.documentElement;
  const fontScale = getStored<FontScale>(STORAGE_KEYS.fontScale, 'normal');
  const reduceMotion = getStored<boolean>(STORAGE_KEYS.reduceMotion, false);
  const reduceTransparency = getStored<boolean>(STORAGE_KEYS.reduceTransparency, false);
  const highContrast = getStored<boolean>(STORAGE_KEYS.highContrast, false);

  root.classList.remove('font-scale-small', 'font-scale-large', 'reduce-motion', 'reduce-transparency', 'high-contrast');

  if (fontScale === 'small') root.classList.add('font-scale-small');
  if (fontScale === 'large') root.classList.add('font-scale-large');
  if (reduceMotion) root.classList.add('reduce-motion');
  if (reduceTransparency) root.classList.add('reduce-transparency');
  if (highContrast) root.classList.add('high-contrast');
};

const DisplayAndAccessibility: React.FC = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const [fontScale, setFontScaleState] = useState<FontScale>(() => getStored<FontScale>(STORAGE_KEYS.fontScale, 'normal'));
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => getStored<boolean>(STORAGE_KEYS.reduceMotion, false));
  const [reduceTransparency, setReduceTransparencyState] = useState<boolean>(() => getStored<boolean>(STORAGE_KEYS.reduceTransparency, false));
  const [highContrast, setHighContrastState] = useState<boolean>(() => getStored<boolean>(STORAGE_KEYS.highContrast, false));

  useEffect(() => {
    applyClasses();
  }, []);

  const store = (key: string, value: unknown) => {
    localStorage.setItem(key, JSON.stringify(value));
    applyClasses();
  };

  const handleFontScaleChange = (value: FontScale) => {
    setFontScaleState(value);
    store(STORAGE_KEYS.fontScale, value);
  };

  const handleReduceMotionChange = (checked: boolean) => {
    setReduceMotionState(checked);
    store(STORAGE_KEYS.reduceMotion, checked);
  };

  const handleReduceTransparencyChange = (checked: boolean) => {
    setReduceTransparencyState(checked);
    store(STORAGE_KEYS.reduceTransparency, checked);
  };

  const handleHighContrastChange = (checked: boolean) => {
    setHighContrastState(checked);
    store(STORAGE_KEYS.highContrast, checked);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">Display & accessibility</h2>
        <p className="text-muted-foreground">
          Customize how Tone looks and behaves for you.
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-foreground">Theme</h3>
          </div>
          <Separator />
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'light' as const, label: 'Light', icon: Sun },
              { value: 'dark' as const, label: 'Dark', icon: Moon },
              { value: 'system' as const, label: 'System', icon: Monitor },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-muted-foreground/30'
                }`}
              >
                <Icon className={`w-5 h-5 ${theme === value ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-xs font-medium ${theme === value ? 'text-primary' : 'text-muted-foreground'}`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
          {resolvedTheme && (
            <p className="text-xs text-muted-foreground text-center">
              Current appearance: {resolvedTheme === 'dark' ? 'Dark' : 'Light'} mode
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-foreground">Font size</h3>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="font-scale">Text size</Label>
            <Select value={fontScale} onValueChange={(v: FontScale) => handleFontScaleChange(v)}>
              <SelectTrigger id="font-scale" className="w-full">
                <SelectValue placeholder="Select font size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Adjust the size of text across the app.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-foreground">Accessibility</h3>
          </div>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="reduce-motion" className="text-sm font-medium">Reduce motion</Label>
                <p className="text-xs text-muted-foreground">
                  Minimize animations and transitions throughout the app.
                </p>
              </div>
              <Switch id="reduce-motion" checked={reduceMotion} onCheckedChange={handleReduceMotionChange} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="reduce-transparency" className="text-sm font-medium">Reduce transparency</Label>
                <p className="text-xs text-muted-foreground">
                  Disable frosted glass and blur effects for better readability.
                </p>
              </div>
              <Switch id="reduce-transparency" checked={reduceTransparency} onCheckedChange={handleReduceTransparencyChange} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="high-contrast" className="text-sm font-medium">High contrast</Label>
                <p className="text-xs text-muted-foreground">
                  Increase contrast between text and background colors.
                </p>
              </div>
              <Switch id="high-contrast" checked={highContrast} onCheckedChange={handleHighContrastChange} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DisplayAndAccessibility;
