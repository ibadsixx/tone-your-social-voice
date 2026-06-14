import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, Type, Music, Sparkles, X, Check, ChevronLeft, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { useStories } from '@/hooks/useStories';
import StoryMusicPicker from './StoryMusicPicker';
import { FilterControls } from '@/components/video-preview/FilterControls';
import { defaultVideoFilter } from '@/types/videoEditing';
import type { VideoFilter } from '@/types/videoEditing';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MusicData {
  url: string;
  title: string;
  artist?: string;
  startAt: number;
  endAt: number;
  duration: number;
  source_type: string;
  video_id?: string | null;
  thumbnail_url?: string | null;
}

interface TextOverlay {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right';
  backgroundColor: string | undefined;
}

const FONT_OPTIONS = [
  { id: 'inter', name: 'Inter', css: "'Inter', sans-serif" },
  { id: 'poppins', name: 'Poppins', css: "'Poppins', sans-serif" },
  { id: 'montserrat', name: 'Montserrat', css: "'Montserrat', sans-serif" },
  { id: 'roboto', name: 'Roboto', css: "'Roboto', sans-serif" },
  { id: 'open-sans', name: 'Open Sans', css: "'Open Sans', sans-serif" },
  { id: 'playfair', name: 'Playfair Display', css: "'Playfair Display', serif" },
  { id: 'bebas', name: 'Bebas Neue', css: "'Bebas Neue', sans-serif" },
  { id: 'oswald', name: 'Oswald', css: "'Oswald', sans-serif" },
  { id: 'lato', name: 'Lato', css: "'Lato', sans-serif" },
  { id: 'dancing', name: 'Dancing Script', css: "'Dancing Script', cursive" },
  { id: 'georgia', name: 'Georgia', css: "'Georgia', serif" },
  { id: 'arial', name: 'Arial', css: "'Arial', sans-serif" },
  { id: 'times', name: 'Times New Roman', css: "'Times New Roman', serif" },
  { id: 'courier', name: 'Courier New', css: "'Courier New', monospace" },
  { id: 'mono', name: 'Monospace', css: 'monospace' },
];

const FONT_WEIGHTS = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'SemiBold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'ExtraBold' },
];

const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FF6B6B', '#4ECDC4',
  '#45B7D1', '#96CEB4', '#FFEAA7', '#DFE6E9', '#FD79A8',
];

function getFontCss(fontName: string): string {
  const font = FONT_OPTIONS.find((f) => f.name === fontName);
  return font?.css || "'Inter', sans-serif";
}

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const defaultTextOverlay = (text: string, color: string): TextOverlay => ({
  id: `text-${Date.now()}`,
  text,
  color,
  x: 50,
  y: 50,
  fontFamily: 'Inter',
  fontSize: 32,
  fontWeight: 700,
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'center',
  backgroundColor: undefined,
});

const CreateStoryDialog = ({ open, onOpenChange }: CreateStoryDialogProps) => {
  const [step, setStep] = useState<'select' | 'edit'>('select');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [music, setMusic] = useState<MusicData | null>(null);
  const [filter, setFilter] = useState<VideoFilter>(defaultVideoFilter);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textFont, setTextFont] = useState('Inter');
  const [textFontSize, setTextFontSize] = useState(32);
  const [textFontWeight, setTextFontWeight] = useState(700);
  const [textItalic, setTextItalic] = useState(false);
  const [textUnderline, setTextUnderline] = useState(false);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [textBg, setTextBg] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'text' | 'music' | 'filters'>('filters');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { createStory } = useStories();

  const reset = useCallback(() => {
    setStep('select');
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setUploading(false);
    setUploadProgress('');
    setMusic(null);
    setFilter(defaultVideoFilter);
    setTextOverlays([]);
    setCurrentText('');
    setTextColor('#FFFFFF');
    setTextFont('Inter');
    setTextFontSize(32);
    setTextFontWeight(700);
    setTextItalic(false);
    setTextUnderline(false);
    setTextAlign('center');
    setTextBg(undefined);
    setActiveTab('filters');
  }, [previewUrl]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/')) {
      alert('Please select an image or video file');
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      alert('File size must be less than 50MB');
      return;
    }

    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setStep('edit');
  };

  const handleAddText = () => {
    if (!currentText.trim()) return;
    const overlay = {
      ...defaultTextOverlay(currentText.trim(), textColor),
      fontFamily: textFont,
      fontSize: textFontSize,
      fontWeight: textFontWeight,
      fontStyle: textItalic ? 'italic' as const : 'normal' as const,
      textDecoration: textUnderline ? 'underline' as const : 'none' as const,
      textAlign,
      backgroundColor: textBg,
    };
    setTextOverlays([...textOverlays, overlay]);
    setCurrentText('');
  };

  const handleRemoveText = (id: string) => {
    setTextOverlays(textOverlays.filter((t) => t.id !== id));
  };

  const getFilterStyle = (): string => {
    const parts: string[] = [];
    parts.push(`brightness(${filter.brightness}%)`);
    parts.push(`contrast(${filter.contrast}%)`);
    parts.push(`saturate(${filter.saturation}%)`);
    if (filter.temperature > 0) {
      parts.push(`sepia(${filter.temperature * 0.3}%)`);
    } else if (filter.temperature < 0) {
      parts.push(`hue-rotate(${filter.temperature * 2}deg)`);
    }
    if (filter.blur > 0) parts.push(`blur(${filter.blur}px)`);
    return parts.join(' ');
  };

  const handleCreate = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress('Uploading...');

    try {
      const result = await createStory(
        file,
        textOverlays.length > 0 ? JSON.stringify(textOverlays) : undefined,
        music?.url,
        music?.title,
        'public',
        music ? {
          startAt: music.startAt,
          duration: music.duration,
          source_type: music.source_type,
          video_id: music.video_id,
          thumbnail_url: music.thumbnail_url,
        } : undefined,
      );

      if (result) {
        reset();
        onOpenChange(false);
      }
    } catch (error) {
      console.error('[CreateStoryDialog] ❌ Failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to create story');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onOpenChange(false);
  };

  const handleBack = () => {
    reset();
  };

  if (step === 'edit' && previewUrl) {
    const isVideo = file?.type.startsWith('video/');

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-4xl h-[90vh] p-0 gap-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">Edit Story</h1>
            <Button onClick={handleCreate} disabled={uploading} size="sm">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Share
            </Button>
          </div>

          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className="flex-1 bg-black flex items-center justify-center p-4 min-h-[300px]">
              <div className="relative w-full max-w-sm aspect-[9/16] bg-black rounded-lg overflow-hidden">
                {isVideo ? (
                  <video
                    src={previewUrl}
                    className="w-full h-full object-contain"
                    style={{ filter: getFilterStyle() }}
                    autoPlay muted loop playsInline
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt=""
                    className="w-full h-full object-contain"
                    style={{ filter: getFilterStyle() }}
                  />
                )}
                {textOverlays.map((t) => (
                  <div
                    key={t.id}
                    className="absolute select-none"
                    style={{
                      left: `${t.x}%`,
                      top: `${t.y}%`,
                      transform: 'translate(-50%, -50%)',
                      color: t.color,
                      fontFamily: getFontCss(t.fontFamily),
                      fontSize: `${t.fontSize}px`,
                      fontWeight: t.fontWeight,
                      fontStyle: t.fontStyle,
                      textDecoration: t.textDecoration,
                      textAlign: t.textAlign,
                      backgroundColor: t.backgroundColor || 'transparent',
                      padding: t.backgroundColor ? '4px 8px' : '0',
                      borderRadius: t.backgroundColor ? '4px' : '0',
                      maxWidth: '80%',
                      wordBreak: 'break-word',
                      lineHeight: 1.2,
                      textShadow: t.backgroundColor ? 'none' : '2px 2px 4px rgba(0,0,0,0.7)',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleRemoveText(t.id)}
                  >
                    {t.text}
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-background flex flex-col">
              <div className="flex border-b border-border">
                <button
                  onClick={() => setActiveTab('filters')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'filters'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  Filters
                </button>
                <button
                  onClick={() => setActiveTab('text')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'text'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Type className="h-4 w-4" />
                  Text
                </button>
                <button
                  onClick={() => setActiveTab('music')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'music'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Music className="h-4 w-4" />
                  Music
                </button>
              </div>

              <ScrollArea className="flex-1 p-4">
                {activeTab === 'filters' && (
                  <FilterControls filter={filter} onChange={setFilter} />
                )}

                {activeTab === 'text' && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type your text..."
                        value={currentText}
                        onChange={(e) => setCurrentText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddText()}
                        className="flex-1"
                      />
                      <Button onClick={handleAddText} size="sm" disabled={!currentText.trim()}>
                        Add
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Font</Label>
                      <Select value={textFont} onValueChange={setTextFont}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((font) => (
                            <SelectItem key={font.id} value={font.name} style={{ fontFamily: font.css }}>
                              {font.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Size</Label>
                        <span className="text-xs text-muted-foreground">{textFontSize}px</span>
                      </div>
                      <Slider
                        value={[textFontSize]}
                        onValueChange={([v]) => setTextFontSize(v)}
                        min={8}
                        max={120}
                        step={1}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Weight</Label>
                      <Select value={String(textFontWeight)} onValueChange={(v) => setTextFontWeight(Number(v))}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_WEIGHTS.map((w) => (
                            <SelectItem key={w.value} value={String(w.value)}>
                              {w.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant={textItalic ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setTextItalic(!textItalic)}
                      >
                        <Italic className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={textUnderline ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setTextUnderline(!textUnderline)}
                      >
                        <Underline className="h-4 w-4" />
                      </Button>
                      <div className="flex-1" />
                      <Button
                        variant={textAlign === 'left' ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setTextAlign('left')}
                      >
                        <AlignLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={textAlign === 'center' ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setTextAlign('center')}
                      >
                        <AlignCenter className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={textAlign === 'right' ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setTextAlign('right')}
                      >
                        <AlignRight className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Color</Label>
                      <div className="flex gap-1 flex-wrap">
                        {TEXT_COLORS.map((color) => (
                          <button
                            key={color}
                            className={`w-6 h-6 rounded border-2 ${
                              textColor === color ? 'border-primary scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: color }}
                            onClick={() => setTextColor(color)}
                          />
                        ))}
                        <input
                          type="color"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Background</Label>
                      <div className="flex gap-2 items-center">
                        <Button
                          variant={textBg ? 'outline' : 'default'}
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setTextBg(textBg ? undefined : 'rgba(0,0,0,0.5)')}
                        >
                          {textBg ? 'Remove' : 'Add Background'}
                        </Button>
                        {textBg && (
                          <input
                            type="color"
                            value={textBg.startsWith('rgba') ? '#000000' : textBg}
                            onChange={(e) => setTextBg(e.target.value)}
                            className="w-6 h-6 rounded cursor-pointer"
                          />
                        )}
                      </div>
                    </div>

                    {textOverlays.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <Label className="text-xs font-medium">Added Text</Label>
                        <div className="space-y-1">
                          {textOverlays.map((t) => (
                            <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/50 text-sm">
                              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                              <span className="flex-1 truncate">{t.text}</span>
                              <button onClick={() => handleRemoveText(t.id)}>
                                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">Tap text on preview to remove</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'music' && (
                  <StoryMusicPicker onSelectMusic={setMusic} selectedMusic={music} />
                )}
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Create Story</h2>
          <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">Image or Video (MAX. 50MB)</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateStoryDialog;
