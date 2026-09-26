import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMusicLibrary } from '@/hooks/useMusicLibrary';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Upload, Type, Music, X, Check, ChevronLeft, ChevronDown, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Trash2, RotateCw, Volume2, VolumeX, AtSign, Pen, Undo2, Redo2, Eraser, Search, Settings, Camera, Video,
  CheckSquare, LayoutTemplate, Newspaper, Plus, Globe, Users, Star, Lock,
  TrendingUp, Sparkles, Bookmark, Link2, Music2, Wand2, Shapes, Save, Download,
  MoreHorizontal, Circle, Square, RectangleHorizontal,
} from 'lucide-react';
import { Stage, Layer, Text as KonvaText, Image as KonvaImage, Transformer, Group, Rect, Line } from 'react-konva';
import Konva from 'konva';
import { gateway } from '@/lib/gateway';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useStories } from '@/hooks/useStories';
import { emojiService, type EmojiData } from '@/services/emojiService';

const STAGE_W = 360;
const STAGE_H = 640;

type StoryPrivacy = 'public' | 'friends' | 'close_friends' | 'private';

const PRIVACY_OPTIONS: { value: StoryPrivacy; label: string; description: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Public', description: 'Anyone on Tone can see', icon: Globe },
  { value: 'friends', label: 'Friends', description: 'Only your friends', icon: Users },
  { value: 'close_friends', label: 'Close friends', description: 'Your close friends list', icon: Star },
  { value: 'private', label: 'Only me', description: 'Just for you', icon: Lock },
];

interface LibraryMedia {
  id: string;
  file: File;
  url: string;
  kind: 'image' | 'video';
  addedAt: number;
  duration?: number;
}

const STORY_TEMPLATES: { id: string; name: string; colors: [string, string, string?]; accent?: string }[] = [
  { id: 'sunset', name: 'Sunset', colors: ['#ff7e5f', '#feb47b'] },
  { id: 'ocean', name: 'Ocean', colors: ['#2193b0', '#6dd5ed'] },
  { id: 'berry', name: 'Berry', colors: ['#ee9ca7', '#ffdde1'] },
  { id: 'night', name: 'Night', colors: ['#0f2027', '#2c5364'] },
  { id: 'mango', name: 'Mango', colors: ['#f7971e', '#ffd200'] },
  { id: 'grape', name: 'Grape', colors: ['#8E2DE2', '#4A00E0'] },
  { id: 'snow', name: 'Snow', colors: ['#ece9e6', '#ffffff'] },
  { id: 'rose', name: 'Rose', colors: ['#cc2b5e', '#753a88'] },
  { id: 'mint', name: 'Mint', colors: ['#11998e', '#38ef7d'] },
  { id: 'neon', name: 'Neon', colors: ['#fc4a1a', '#f7b733'] },
  { id: 'royal', name: 'Royal', colors: ['#141e30', '#355c7d'] },
  { id: 'blush', name: 'Blush', colors: ['#ff9a9e', '#fecfef'] },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const FONT_OPTIONS = [
  { id: 'inter', name: 'Inter', css: 'Inter' },
  { id: 'poppins', name: 'Poppins', css: 'Poppins' },
  { id: 'montserrat', name: 'Montserrat', css: 'Montserrat' },
  { id: 'roboto', name: 'Roboto', css: 'Roboto' },
  { id: 'playfair', name: 'Playfair Display', css: 'Playfair Display' },
  { id: 'bebas', name: 'Bebas Neue', css: 'Bebas Neue' },
  { id: 'oswald', name: 'Oswald', css: 'Oswald' },
  { id: 'dancing', name: 'Dancing Script', css: 'Dancing Script' },
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

const DRAW_COLORS = [
  '#FFFFFF', '#FF0000', '#FF6B00', '#FFD700', '#00FF00',
  '#00BFFF', '#0000FF', '#8A2BE2', '#FF00FF', '#FF1493',
  '#000000', '#808080',
];

const DRAW_TOOLS = [
  { id: 'pen', label: 'Pen' },
  { id: 'neon', label: 'Neon' },
  { id: 'highlighter', label: 'Marker' },
] as const;

type StoryFilter = 'none' | 'bw' | 'sepia' | 'vivid' | 'warm' | 'cool';

const FILTER_OPTIONS: { id: StoryFilter; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'bw', label: 'B&W' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
];

type MediaShape = 'rectangle' | 'square' | 'circle' | 'rounded';

const SHAPE_OPTIONS: { id: MediaShape; label: string }[] = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'square', label: 'Square' },
  { id: 'circle', label: 'Circle' },
  { id: 'rounded', label: 'Rounded' },
];

interface DrawingStroke {
  id: string;
  points: number[];
  color: string;
  size: number;
  tool: 'pen' | 'neon' | 'highlighter' | 'eraser';
}

interface CanvasOverlay {
  id: string;
  type: 'text' | 'image' | 'sticker' | 'mention';
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textAlign?: 'left' | 'center' | 'right';
  fill?: string;
  src?: string;
  emoji?: string;
  mentionedUserId?: string;
  mentionedUsername?: string;
  mentionedDisplayName?: string;
}

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

function createId(): string {
  return `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

async function createTemplateFile(template: { id: string; name: string; colors: [string, string, string?] }): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  const grad = ctx.createLinearGradient(0, 0, STAGE_W, STAGE_H);
  template.colors.forEach((c, i) => grad.addColorStop(i / Math.max(template.colors.length - 1, 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to generate template');
  return new File([blob], `template-${template.id}.png`, { type: 'image/png' });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function KonvaImageLoader({ src, width, height, filter }: { src: string; width: number; height: number; filter?: StoryFilter }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadImage(src).then((i) => { if (!cancelled) setImg(i); });
    return () => { cancelled = true; };
  }, [src]);
  if (!img) return null;
  return <KonvaImage image={img} width={width} height={height} {...filterProps(filter)} />;
}

const filterProps = (filter?: StoryFilter) => {
  switch (filter) {
    case 'bw':
      return { filters: [Konva.Filters.Grayscale] };
    case 'sepia':
      return { filters: [Konva.Filters.Sepia] };
    case 'vivid':
      return { filters: [Konva.Filters.Contrast, Konva.Filters.HSL], contrast: 40, saturation: 0.35 };
    case 'warm':
      return { filters: [Konva.Filters.RGBA, Konva.Filters.Brighten], red: 25, green: 5, blue: -20, brightness: 0.05 };
    case 'cool':
      return { filters: [Konva.Filters.RGBA, Konva.Filters.Brighten], red: -15, green: 5, blue: 30, brightness: 0.05 };
    default:
      return {};
  }
};

function KonvaVideoImage({ src, width, height, muted: mutedProp, filter }: { src: string; width: number; height: number; muted: boolean; filter?: StoryFilter }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const imageRef = useRef<any>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const vid = document.createElement('video');
    vid.src = src;
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.autoplay = true;
    vid.crossOrigin = 'anonymous';
    const onData = () => { setVideo(vid); };
    vid.addEventListener('loadeddata', onData);
    vid.play().catch(() => {});
    return () => {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      vid.removeEventListener('loadeddata', onData);
      cancelAnimationFrame(animRef.current);
    };
  }, [src]);

  useEffect(() => {
    if (video) video.muted = mutedProp;
  }, [video, mutedProp]);

  useEffect(() => {
    if (!video) return;
    const draw = () => {
      if (imageRef.current) imageRef.current.getLayer()?.batchDraw();
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [video]);

  if (!video) return null;
  return <KonvaImage ref={imageRef} image={video} width={width} height={height} {...filterProps(filter)} />;
}

function EditableTextInput({ x, y, width, height, text, fontFamily, fontSize, fontWeight, fontStyle, textDecoration, textAlign, fill, onChange, onClose }: {
  x: number; y: number; width: number; height: number; text: string;
  fontFamily: string; fontSize: number; fontWeight: number; fontStyle: string;
  textDecoration: string; textAlign: string; fill: string;
  onChange: (text: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) { ref.current.focus(); ref.current.select(); }
  }, []);
  return (
    <textarea
      ref={ref}
      className="absolute outline-none resize-none bg-transparent break-words z-20"
      style={{
        left: x, top: y, width, height: Math.max(height, 40),
        fontFamily, fontSize: `${fontSize}px`, fontWeight,
        fontStyle, textDecoration: textDecoration === 'underline' ? 'underline' : 'none',
        textAlign: textAlign as any, color: fill,
        textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        lineHeight: 1.2, border: 'none', padding: '4px', caretColor: fill,
      }}
      defaultValue={text}
      onBlur={(e) => { onChange(e.target.value); onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { onChange((e.target as HTMLTextAreaElement).value); onClose(); }
      }}
    />
  );
}

function MusicTab({ music, onSelect }: { music: MusicData | null; onSelect: (m: MusicData | null) => void }) {
  const [url, setUrl] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const { tracks, trendingTracks, popularTracks, weeklyTopTracks, isLoading } = useMusicLibrary();

  const handlePick = (track: { url: string; title: string; artist?: string | null; duration?: number | null; source_type: string; video_id?: string | null; thumbnail_url?: string | null }) => {
    onSelect({
      url: track.url,
      title: track.title,
      artist: track.artist || undefined,
      startAt: 0,
      endAt: Math.min(track.duration || 15, 15),
      duration: track.duration || 15,
      source_type: track.source_type,
      video_id: track.video_id,
      thumbnail_url: track.thumbnail_url,
    });
  };

  const handleAddUrl = async () => {
    if (!url.trim()) return;
    setSearching(true);
    setError('');
    try {
      const { detectMusicUrl } = await import('@/utils/musicUrlDetector');
      const { extractMusicMetadata } = await import('@/utils/musicMetadataExtractor');
      const sourceType = detectMusicUrl(url);
      if (!sourceType) { setError('Unsupported URL'); return; }
      const meta = await extractMusicMetadata(url, sourceType);
      if (!meta) { setError('Could not extract metadata'); return; }
      onSelect({
        url: meta.url || url,
        title: meta.title || 'Unknown',
        artist: meta.artist,
        startAt: 0,
        endAt: Math.min(meta.duration || 15, 15),
        duration: meta.duration || 15,
        source_type: sourceType,
        video_id: meta.video_id,
        thumbnail_url: meta.thumbnail_url,
      });
    } catch {
      setError('Failed to add music');
    } finally {
      setSearching(false);
    }
  };

  if (music) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-secondary/50">
          <p className="text-sm font-medium truncate">{music.title}</p>
          {music.artist && <p className="text-xs text-muted-foreground">{music.artist}</p>}
        </div>
        <MusicTrimmer
          maxDuration={15}
          initialStart={music.startAt}
          initialEnd={music.endAt}
          onTrim={(start, end) => onSelect({ ...music, startAt: start, endAt: end })}
        />
        <Button variant="destructive" size="sm" className="w-full" onClick={() => onSelect(null)}>
          <X className="h-4 w-4 mr-1" /> Remove Music
        </Button>
      </div>
    );
  }

  const renderTrackList = (list: { url: string; title: string; artist?: string | null; source_type: string; thumbnail_url?: string | null; video_id?: string | null; duration?: number | null }[], empty: string) => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-[180px]">
          <Music className="h-6 w-6 animate-pulse text-muted-foreground" />
        </div>
      );
    }
    if (!list.length) {
      return <p className="text-xs text-muted-foreground text-center py-10">{empty}</p>;
    }
    return (
      <div className="space-y-1">
        {list.map((track) => (
          <button
            key={track.url}
            onClick={() => handlePick(track)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors text-left"
          >
            {track.thumbnail_url ? (
              <img src={track.thumbnail_url} alt="" className="w-10 h-10 rounded object-cover shrink-0"  loading="lazy" decoding="async" />
            ) : (
              <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center shrink-0">
                <Music2 className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{track.title}</p>
              {track.artist && <p className="text-xs text-muted-foreground truncate">{track.artist}</p>}
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <Tabs defaultValue="liked" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="liked" className="text-xs flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5" /> For you
        </TabsTrigger>
        <TabsTrigger value="trending" className="text-xs flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5" /> Trending
        </TabsTrigger>
        <TabsTrigger value="saved" className="text-xs flex items-center gap-1">
          <Bookmark className="h-3.5 w-3.5" /> Saved
        </TabsTrigger>
        <TabsTrigger value="add" className="text-xs flex items-center gap-1">
          <Link2 className="h-3.5 w-3.5" /> Add
        </TabsTrigger>
      </TabsList>

      <TabsContent value="liked" className="mt-3 max-h-64 overflow-y-auto">
        {renderTrackList(popularTracks, 'No recommendations yet. Add some music to build your profile.')}
      </TabsContent>

      <TabsContent value="trending" className="mt-3 max-h-64 overflow-y-auto">
        {renderTrackList(trendingTracks, 'No trending music right now.')}
      </TabsContent>

      <TabsContent value="saved" className="mt-3 max-h-64 overflow-y-auto">
        {renderTrackList(tracks, 'No saved music yet. Music you pick will appear here.')}
      </TabsContent>

      <TabsContent value="add" className="mt-3">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Paste YouTube/SoundCloud URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-9 text-sm"
            />
            <Button size="sm" className="h-9 shrink-0" onClick={handleAddUrl} disabled={searching || !url.trim()}>
              {searching ? '...' : 'Add'}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">Paste a music URL to add background music</p>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function BlurredImageBg({ src }: { src: string }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const shapeRef = useRef<any>(null);

  useEffect(() => {
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);

  useEffect(() => {
    if (shapeRef.current && img) shapeRef.current.cache();
  }, [img]);

  if (!img) return null;

  const scale = Math.max(STAGE_W / img.width, STAGE_H / img.height);
  const x = (STAGE_W - img.width * scale) / 2;
  const y = (STAGE_H - img.height * scale) / 2;

  return (
    <Group x={x} y={y} scaleX={scale} scaleY={scale} listening={false}>
      <KonvaImage
        ref={shapeRef}
        image={img}
        width={img.width}
        height={img.height}
        filters={[Konva.Filters.Blur]}
        blurRadius={40}
      />
    </Group>
  );
}

function BlurredVideoBg({ src }: { src: string }) {
  const [frame, setFrame] = useState<{ img: HTMLImageElement; w: number; h: number } | null>(null);
  const imageRef = useRef<any>(null);
  const cachedRef = useRef(false);

  useEffect(() => {
    const vid = document.createElement('video');
    vid.muted = true;
    vid.playsInline = true;
    vid.crossOrigin = 'anonymous';
    let cancelled = false;

    const onMeta = () => {
      if (cancelled || !vid.videoWidth || !vid.videoHeight) return;
      vid.currentTime = Math.min(vid.duration / 2, 1);
    };

    const onSeek = () => {
      if (cancelled) return;
      const w = vid.videoWidth;
      const h = vid.videoHeight;
      if (!w || !h) return;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(vid, 0, 0);
      const img = new window.Image();
      img.onload = () => {
        if (!cancelled) setFrame({ img, w, h });
      };
      img.src = canvas.toDataURL();
    };

    vid.addEventListener('loadedmetadata', onMeta);
    vid.addEventListener('seeked', onSeek);
    vid.src = src;
    vid.load();

    return () => {
      cancelled = true;
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      vid.removeEventListener('loadedmetadata', onMeta);
      vid.removeEventListener('seeked', onSeek);
    };
  }, [src]);

  useEffect(() => {
    if (imageRef.current && !cachedRef.current) {
      imageRef.current.cache();
      cachedRef.current = true;
    }
  }, [frame]);

  if (!frame) return null;

  const scale = Math.max(STAGE_W / frame.w, STAGE_H / frame.h);
  const x = (STAGE_W - frame.w * scale) / 2;
  const y = (STAGE_H - frame.h * scale) / 2;

  return (
    <Group x={x} y={y} scaleX={scale} scaleY={scale} listening={false}>
      <KonvaImage
        ref={imageRef}
        image={frame.img}
        width={frame.w}
        height={frame.h}
        filters={[Konva.Filters.Blur]}
        blurRadius={40}
      />
    </Group>
  );
}

export default function CreateStoryDialog({
  open,
  onOpenChange,
  variant = 'dialog',
  initialMedia = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  variant?: 'dialog' | 'page';
  initialMedia?: { url: string; type?: string } | null;
}) {
  const [step, setStep] = useState<'select' | 'edit'>('select');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [activeTab, setActiveTab] = useState<'text' | 'stickers' | 'mentions' | 'draw' | 'music' | 'none'>(variant === 'page' ? 'none' : 'text');
  const [stickerTab, setStickerTab] = useState<'emoji' | 'sticker'>('emoji');
  const [catalogEmojis, setCatalogEmojis] = useState<EmojiData[]>([]);
  const [catalogEmojisLoading, setCatalogEmojisLoading] = useState(true);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [pickerPanel, setPickerPanel] = useState<'gallery' | 'templates' | 'music' | 'post'>('gallery');
  const [libraryItems, setLibraryItems] = useState<LibraryMedia[]>([]);
  const [libraryOrder, setLibraryOrder] = useState<'latest' | 'oldest'>('latest');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacy, setPrivacy] = useState<StoryPrivacy>('public');
  const [posts, setPosts] = useState<{ id: string; media_url: string; media_type: string | null; created_at: string }[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [postBusy, setPostBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    emojiService.getAllEmojis()
      .then((list) => { if (!cancelled) setCatalogEmojis(list); })
      .finally(() => { if (!cancelled) setCatalogEmojisLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [overlays, setOverlays] = useState<CanvasOverlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editTextValue, setEditTextValue] = useState('');
  const [music, setMusic] = useState<MusicData | null>(null);
  const [selectedBg, setSelectedBg] = useState(false);
  const [bgTransform, setBgTransform] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
  const [mediaRotation, setMediaRotation] = useState(0);
  const [videoMuted, setVideoMuted] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionResults, setMentionResults] = useState<{ id: string; username: string; display_name: string; profile_pic: string | null }[]>([]);
  const [mentionSearching, setMentionSearching] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [activeDrawTool, setActiveDrawTool] = useState<'pen' | 'neon' | 'highlighter'>('pen');
  const [drawColor, setDrawColor] = useState('#FFFFFF');
  const [brushSize, setBrushSize] = useState(4);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [undoStack, setUndoStack] = useState<DrawingStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawingStroke[][]>([]);
  const isDrawingRef = useRef(false);
  const drawingLineRef = useRef<any>(null);
  const [filter, setFilter] = useState<StoryFilter>('none');
  const [mediaShape, setMediaShape] = useState<MediaShape>('rectangle');
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreTab, setMoreTab] = useState<'menu' | 'effects' | 'shape' | 'mention' | 'save' | 'more'>('menu');

  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<any>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const libraryUrlsRef = useRef<Set<string>>(new Set());
  const editQueueRef = useRef<{ file: File; url: string }[]>([]);
  const { user } = useAuth();
  const { createStory } = useStories();

  const selectedOverlay = overlays.find((o) => o.id === selectedId);

  const filteredEmojis = useMemo(() => {
    const query = emojiSearch.trim().toLowerCase();
    if (!query) return catalogEmojis;
    return catalogEmojis.filter((e) =>
      e.name.toLowerCase().includes(query) ||
      e.emoji.toLowerCase().includes(query) ||
      e.category?.toLowerCase().includes(query)
    );
  }, [catalogEmojis, emojiSearch]);

  const reset = useCallback(() => {
    setStep('select');
    setFile(null);
    if (previewUrl && !libraryUrlsRef.current.has(previewUrl)) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setUploading(false);
    setUploadProgress('');
    setOverlays([]);
    setSelectedId(null);
    setSelectedBg(false);
    setBgTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
    setMediaRotation(0);
    setVideoMuted(false);
    setEditingTextId(null);
    setMusic(null);
    setActiveTab('text');
    setMentionSearch('');
    setMentionResults([]);
    setDrawingMode(false);
    setActiveDrawTool('pen');
    setDrawColor('#FFFFFF');
    setBrushSize(4);
    setStrokes([]);
    setUndoStack([]);
    setRedoStack([]);
    setFilter('none');
    setMediaShape('rectangle');
    setMoreOpen(false);
    setMoreTab('menu');
  }, [previewUrl]);

  const clearLibrary = useCallback(() => {
    libraryUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    libraryUrlsRef.current.clear();
    setLibraryItems([]);
    setSelectedUrls(new Set());
  }, []);

  useEffect(() => () => clearLibrary(), [clearLibrary]);

  const addMediaFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const added: LibraryMedia[] = [];
    for (const f of incoming) {
      const isImage = f.type.startsWith('image/');
      const isVideo = f.type.startsWith('video/');
      if (!isImage && !isVideo) {
        alert('Please select an image or video file');
        continue;
      }
      if (f.size > 50 * 1024 * 1024) {
        alert('File size must be less than 50MB');
        continue;
      }
      const media: LibraryMedia = {
        id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        url: URL.createObjectURL(f),
        kind: isVideo ? 'video' : 'image',
        addedAt: Date.now(),
      };
      libraryUrlsRef.current.add(media.url);
      added.push(media);
    }
    if (added.length) setLibraryItems((prev) => [...prev, ...added]);
  };

  const removeItem = (item: LibraryMedia) => {
    URL.revokeObjectURL(item.url);
    libraryUrlsRef.current.delete(item.url);
    setLibraryItems((prev) => prev.filter((i) => i.id !== item.id));
    setSelectedUrls((prev) => {
      const n = new Set(prev);
      n.delete(item.url);
      return n;
    });
  };

  useEffect(() => {
    const pending = libraryItems.filter((i) => i.kind === 'video' && i.duration == null);
    if (!pending.length) return;
    pending.forEach((item) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      const onMeta = () => {
        if (isFinite(v.duration)) {
          setLibraryItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, duration: v.duration } : p)));
        }
        v.removeEventListener('loadedmetadata', onMeta);
      };
      v.addEventListener('loadedmetadata', onMeta);
      v.src = item.url;
    });
  }, [libraryItems]);

  useEffect(() => {
    if (pickerPanel !== 'post' || !user || posts.length) return;
    let cancelled = false;
    setPostsLoading(true);
    gateway
      .from('posts')
      .select('id, media_url, media_type, created_at')
      .eq('user_id', user.id)
      .not('media_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[CreateStory] Failed to load posts:', error);
        } else {
          setPosts(data || []);
        }
      })
      .finally(() => { if (!cancelled) setPostsLoading(false); });
    return () => { cancelled = true; };
  }, [pickerPanel, user, posts.length]);

  const sortedItems = useMemo(() => {
    const arr = [...libraryItems];
    arr.sort((a, b) => (libraryOrder === 'latest' ? b.addedAt - a.addedAt : a.addedAt - b.addedAt));
    return arr;
  }, [libraryItems, libraryOrder]);

  const beginEdit = ({ file, url }: { file: File; url: string }) => {
    setFile(file);
    setPreviewUrl(url);
    setOverlays([]);
    setSelectedId(null);
    setSelectedBg(false);
    setBgTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
    setMediaRotation(0);
    setVideoMuted(false);
    setEditingTextId(null);
    setStrokes([]);
    setUndoStack([]);
    setRedoStack([]);
    setStep('edit');
  };

  useEffect(() => {
    if (variant !== 'page' || !initialMedia || !initialMedia.url || step !== 'select') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(initialMedia.url);
        if (!res.ok) throw new Error('Could not load media');
        const blob = await res.blob();
        if (cancelled) return;
        const ext = initialMedia.url.split('.').pop()?.split('?')[0] || 'jpg';
        const detectedType = blob.type || initialMedia.type || (ext === 'mp4' ? 'video/mp4' : 'image/jpeg');
        const mimeToExt: Record<string, string> = {
          'video/mp4': 'mp4',
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/gif': 'gif',
        };
        const fext = mimeToExt[detectedType] || ext;
        const file = new File([blob], `story.${fext}`, { type: detectedType });
        editQueueRef.current = [];
        beginEdit({ file, url: initialMedia.url });
      } catch (error) {
        if (!cancelled) alert(error instanceof Error ? error.message : 'Failed to load media');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, initialMedia]);

  const openItem = (item: LibraryMedia) => {
    if (selectMode) {
      setSelectedUrls((prev) => {
        const n = new Set(prev);
        if (n.has(item.url)) n.delete(item.url);
        else n.add(item.url);
        return n;
      });
      return;
    }
    editQueueRef.current = [];
    beginEdit({ file: item.file, url: item.url });
  };

  const handleShareSelected = () => {
    const chosen = sortedItems.filter((i) => selectedUrls.has(i.url));
    if (chosen.length === 0) return;
    const [first, ...rest] = chosen;
    setSelectMode(false);
    setSelectedUrls(new Set());
    setPickerPanel('gallery');
    editQueueRef.current = rest.map((i) => ({ file: i.file, url: i.url }));
    beginEdit({ file: first.file, url: first.url });
  };

  const handleSelectTemplate = async (template: typeof STORY_TEMPLATES[number]) => {
    setTemplateBusy(true);
    try {
      const file = await createTemplateFile(template);
      const url = URL.createObjectURL(file);
      editQueueRef.current = [];
      beginEdit({ file, url });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create template');
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleOpenPost = async (p: { id: string; media_url: string; media_type: string | null }) => {
    setPostBusy(p.id);
    try {
      const res = await fetch(p.media_url);
      if (!res.ok) throw new Error('Could not download that post');
      const blob = await res.blob();
      const ext = p.media_url.split('.').pop()?.split('?')[0] || (p.media_type === 'video' ? 'mp4' : 'jpg');
      const file = new File([blob], `post.${ext}`, {
        type: blob.type || (p.media_type === 'video' ? 'video/mp4' : 'image/jpeg'),
      });
      const url = URL.createObjectURL(file);
      editQueueRef.current = [];
      beginEdit({ file, url });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add post to story');
    } finally {
      setPostBusy(null);
    }
  };

  const handleAddText = () => {
    const newOverlay: CanvasOverlay = {
      id: createId(),
      type: 'text',
      text: 'Double tap to edit',
      x: 50,
      y: 50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: 200,
      height: 40,
      fontFamily: 'Inter',
      fontSize: 36,
      fontWeight: 700,
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      fill: '#FFFFFF',
    };
    setOverlays((prev) => [...prev, newOverlay]);
    setSelectedId(newOverlay.id);
  };

  const handleAddImageSticker = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = await loadImage(url);
    const w = Math.min(img.width, 200);
    const h = (img.height / img.width) * w;
    const newOverlay: CanvasOverlay = {
      id: createId(),
      type: 'image',
      src: url,
      x: 80,
      y: 80,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: w,
      height: h,
    };
    setOverlays((prev) => [...prev, newOverlay]);
    setSelectedId(newOverlay.id);
  };

  const handleAddCatalogEmoji = async (item: EmojiData) => {
    const makeOverlay = (width: number, height: number): CanvasOverlay => ({
      id: createId(),
      type: 'image',
      src: item.url,
      x: 80,
      y: 80,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width,
      height,
    });
    try {
      const img = await loadImage(item.url);
      const maxDim = 120;
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const w = Math.max(40, img.width * scale);
      const h = Math.max(40, img.height * scale);
      const overlay = makeOverlay(w, h);
      setOverlays((prev) => [...prev, overlay]);
      setSelectedId(overlay.id);
    } catch {
      const overlay = makeOverlay(80, 80);
      setOverlays((prev) => [...prev, overlay]);
      setSelectedId(overlay.id);
    }
  };

  const updateOverlay = (id: string, updates: Partial<CanvasOverlay>) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setOverlays((prev) => prev.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  };

  const handleStageClick = (e: any) => {
    if (e.target === e.target.getStage()) { setSelectedId(null); setSelectedBg(false); }
  };

  const handleDragEnd = (id: string, e: any) => {
    updateOverlay(id, { x: e.target.x(), y: e.target.y() });
  };

  const handleTransformEnd = (id: string, e: any) => {
    const node = e.target;
    updateOverlay(id, { x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: node.scaleX(), scaleY: node.scaleY() });
  };

  const handleBgDragEnd = (e: any) => {
    setBgTransform(prev => ({ ...prev, x: e.target.x(), y: e.target.y() }));
  };

  const handleBgTransformEnd = (e: any) => {
    const node = e.target;
    setBgTransform(prev => ({ ...prev, x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: node.scaleX(), scaleY: node.scaleY() }));
  };

  const handleRotate = () => {
    setMediaRotation(prev => (prev + 90) % 360);
  };

  const handleRotateOverlay = () => {
    if (!selectedId) return;
    const overlay = overlays.find(o => o.id === selectedId);
    if (!overlay) return;
    const newRotation = ((overlay.rotation || 0) + 90) % 360;
    updateOverlay(selectedId, { rotation: newRotation });
  };

  const handleTextDblClick = (id: string) => {
    const overlay = overlays.find((o) => o.id === id);
    if (!overlay || overlay.type !== 'text') return;
    setEditingTextId(id);
    setEditTextValue(overlay.text || '');
  };

  const handleTextEditDone = (id: string, newText: string) => {
    updateOverlay(id, { text: newText });
    setEditingTextId(null);
  };

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    if (selectedBg) {
      const node = stageRef.current.findOne('#__bg__');
      if (node) { transformerRef.current.nodes([node]); transformerRef.current.getLayer().batchDraw(); return; }
    } else if (selectedId) {
      const node = stageRef.current.findOne(`#${selectedId}`);
      if (node) { transformerRef.current.nodes([node]); transformerRef.current.getLayer().batchDraw(); return; }
    }
    transformerRef.current.nodes([]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedId, selectedBg, overlays]);

  useEffect(() => {
    if (!drawingMode && isDrawingRef.current) {
      handleDrawingEnd();
    }
  }, [drawingMode]);

  useEffect(() => {
    if (!mentionSearch.trim()) { setMentionResults([]); return; }
    const timer = setTimeout(async () => {
      setMentionSearching(true);
      try {
        const pattern = `%${mentionSearch.trim()}%`;
        const { data } = await gateway
          .from('profiles')
          .select('id, username, display_name, profile_pic')
          .or(`display_name.ilike.${pattern},username.ilike.${pattern}`)
          .limit(10);
        if (data) setMentionResults(data);
      } catch { /* ignore */ }
      finally { setMentionSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [mentionSearch]);

  const handleSelectMention = (user: { id: string; username: string; display_name: string }) => {
    const newOverlay: CanvasOverlay = {
      id: createId(),
      type: 'mention',
      text: `@${user.username}`,
      x: 120,
      y: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: 160,
      height: 40,
      fill: '#1877F2',
      mentionedUserId: user.id,
      mentionedUsername: user.username,
      mentionedDisplayName: user.display_name,
    };
    setOverlays(prev => [...prev, newOverlay]);
    setSelectedId(newOverlay.id);
    setSelectedBg(false);
    setMentionSearch('');
    setMentionResults([]);
  };

  const handleDrawingStart = (pos: { x: number; y: number }) => {
    isDrawingRef.current = true;
    if (drawingLineRef.current) {
      drawingLineRef.current.points([pos.x, pos.y, pos.x, pos.y]);
      drawingLineRef.current.stroke(drawColor);
      drawingLineRef.current.strokeWidth(brushSize);
      drawingLineRef.current.globalCompositeOperation(
        activeDrawTool === 'eraser' ? 'destination-out' : 'source-over'
      );
    }
  };

  const handleDrawingMove = (pos: { x: number; y: number }) => {
    if (!isDrawingRef.current || !drawingLineRef.current) return;
    const oldPoints = drawingLineRef.current.points();
    const newPoints = [...oldPoints, pos.x, pos.y];
    drawingLineRef.current.points(newPoints);
    drawingLineRef.current.getLayer()?.batchDraw();
  };

  const handleDrawingEnd = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (drawingLineRef.current) {
      const points = drawingLineRef.current.points();
      if (points.length >= 4) {
        const stroke: DrawingStroke = {
          id: createId(),
          points: [...points],
          color: drawColor,
          size: brushSize,
          tool: activeDrawTool,
        };
        setStrokes(prev => {
          setUndoStack(u => [...u, prev]);
          return [...prev, stroke];
        });
        setRedoStack([]);
      }
      drawingLineRef.current.points([]);
    }
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    setRedoStack(prev => [...prev, strokes]);
    setStrokes(prev => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setStrokes(last);
  };

  const handleCreate = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress('Uploading...');
    try {
      const mentionOverlays = overlays.filter(o => o.type === 'mention');
      const captionData: any = {
        overlays: overlays.map((o) => ({
          id: o.id, type: o.type, x: o.x, y: o.y, rotation: o.rotation,
          scaleX: o.scaleX, scaleY: o.scaleY, width: o.width, height: o.height,
          text: o.text, fontFamily: o.fontFamily, fontSize: o.fontSize,
          fontWeight: o.fontWeight, fontStyle: o.fontStyle, textDecoration: o.textDecoration,
          textAlign: o.textAlign, fill: o.fill, src: o.src, emoji: o.emoji,
          mentionedUserId: o.mentionedUserId,
          mentionedUsername: o.mentionedUsername,
          mentionedDisplayName: o.mentionedDisplayName,
        })),
        bgTransform,
        mediaRotation,
        videoMuted,
        drawings: strokes,
      };
      const result = await createStory(
        file,
        JSON.stringify(captionData),
        music?.url, music?.title, privacy,
        music ? { startAt: music.startAt, duration: music.duration, source_type: music.source_type, video_id: music.video_id, thumbnail_url: music.thumbnail_url } : undefined,
      );
      if (result) {
        if (mentionOverlays.length > 0) {
          const { error: mentionError } = await gateway
            .from('story_mentions')
            .insert(mentionOverlays.map(o => ({
              story_id: result.id,
              mentioned_user_id: o.mentionedUserId,
              created_by: user!.id,
              position_x: Math.round(o.x),
              position_y: Math.round(o.y),
            })));
          if (mentionError) console.error('[CreateStory] Failed to save mentions:', mentionError);
        }
        const next = editQueueRef.current.shift();
        if (next) {
          beginEdit(next);
          return;
        }
        editQueueRef.current = [];
        reset(); onOpenChange(false);
      }
    } catch (error) {
      console.error('[CreateStoryDialog] Failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to create story');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleClose = () => {
    if (!uploading) {
      editQueueRef.current = [];
      reset();
      setSelectMode(false);
      setSelectedUrls(new Set());
      clearLibrary();
      onOpenChange(false);
    }
  };
  const handleBack = () => {
    editQueueRef.current = [];
    setSelectMode(false);
    setSelectedUrls(new Set());
    reset();
  };

  const handleSaveToDevice = () => {
    setMoreOpen(false);
    try {
      const node = stageRef.current;
      if (!node) return;
      node.getStage().setAttr('width', STAGE_W * 2);
      node.getStage().setAttr('height', STAGE_H * 2);
      const uri = node.toDataURL({ pixelRatio: 2 });
      node.getStage().setAttr('width', STAGE_W);
      node.getStage().setAttr('height', STAGE_H);
      const a = document.createElement('a');
      a.href = uri;
      a.download = 'my-story.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('[CreateStoryDialog] Save failed:', e);
    }
  };

  const closeMore = () => {
    setMoreOpen(false);
    setMoreTab('menu');
    setDrawingMode(false);
    setSelectedId(null);
    setSelectedBg(false);
  };

  const scale = containerRef.current
    ? Math.min(containerRef.current.clientWidth / STAGE_W, (containerRef.current.clientHeight || 600) / STAGE_H)
    : 1;

  if (step === 'edit' && previewUrl) {
    const isVideo = file?.type.startsWith('video/');
    const editingOverlay = editingTextId ? overlays.find((o) => o.id === editingTextId) : null;

    const canvasBlock = (
      <div ref={containerRef} className={`${variant === 'page' ? 'h-full w-full' : 'shrink-0 md:shrink md:flex-1 h-[40vh] md:h-auto min-h-[300px]'} bg-transparent md:bg-background flex items-center justify-center p-3 relative overflow-hidden`}>
              <div style={{ width: STAGE_W * scale, height: STAGE_H * scale, position: 'relative' }}>
                {editingTextId && editingOverlay && (
                  <EditableTextInput
                    x={editingOverlay.x * scale}
                    y={editingOverlay.y * scale}
                    width={(editingOverlay.width || 200) * (editingOverlay.scaleX || 1) * scale}
                    height={(editingOverlay.height || 40) * (editingOverlay.scaleY || 1) * scale}
                    text={editTextValue}
                    fontFamily={editingOverlay.fontFamily || 'Inter'}
                    fontSize={(editingOverlay.fontSize || 36) * (editingOverlay.scaleX || 1)}
                    fontWeight={editingOverlay.fontWeight || 700}
                    fontStyle={editingOverlay.fontStyle || 'normal'}
                    textDecoration={editingOverlay.textDecoration || 'none'}
                    textAlign={editingOverlay.textAlign || 'center'}
                    fill={editingOverlay.fill || '#FFFFFF'}
                    onChange={(val) => setEditTextValue(val)}
                    onClose={() => handleTextEditDone(editingOverlay.id, editTextValue)}
                  />
                )}

                <Stage
                  ref={stageRef}
                  width={STAGE_W * scale}
                  height={STAGE_H * scale}
                  scaleX={scale}
                  scaleY={scale}
                  onClick={!drawingMode ? handleStageClick : undefined}
                  onTap={!drawingMode ? handleStageClick : undefined}
                  onMouseDown={drawingMode ? (e) => handleDrawingStart(e.target.getStage().getPointerPosition()) : undefined}
                  onMouseMove={drawingMode ? (e) => handleDrawingMove(e.target.getStage().getPointerPosition()) : undefined}
                  onMouseUp={drawingMode ? handleDrawingEnd : undefined}
                  onMouseLeave={drawingMode ? handleDrawingEnd : undefined}
                  onTouchStart={drawingMode ? (e) => handleDrawingStart(e.target.getStage().getPointerPosition()) : undefined}
                  onTouchMove={drawingMode ? (e) => handleDrawingMove(e.target.getStage().getPointerPosition()) : undefined}
                  onTouchEnd={drawingMode ? handleDrawingEnd : undefined}
                >
                  {/* Layer 1: Background blur - cover fill + dark overlay */}
                  <Layer>
                    {previewUrl && (
                      <>
                        {isVideo ? <BlurredVideoBg src={previewUrl} /> : <BlurredImageBg src={previewUrl} />}
                        <Rect x={0} y={0} width={STAGE_W} height={STAGE_H} fill="rgba(0,0,0,0.25)" listening={false} />
                      </>
                    )}
                  </Layer>
                  {/* Layer 2: Main draggable media + overlays */}
                  <Layer listening={!drawingMode}>
                    {previewUrl && (
                      <Group
                        id="__bg__"
                        x={bgTransform.x}
                        y={bgTransform.y}
                        rotation={bgTransform.rotation}
                        scaleX={bgTransform.scaleX}
                        scaleY={bgTransform.scaleY}
                        draggable
                        {...(mediaShape === 'rectangle' ? {} : {
                          clipFunc: ((ctx: any) => {
                            const w = STAGE_W;
                            const h = STAGE_H;
                            if (mediaShape === 'square') {
                              ctx.beginPath();
                              ctx.rect(0, (h - w) / 2, w, w);
                            } else if (mediaShape === 'circle') {
                              ctx.beginPath();
                              ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
                            } else {
                              const r = 72;
                              ctx.beginPath();
                              ctx.moveTo(r, 0);
                              ctx.lineTo(w - r, 0);
                              ctx.quadraticCurveTo(w, 0, w, r);
                              ctx.lineTo(w, h - r);
                              ctx.quadraticCurveTo(w, h, w - r, h);
                              ctx.lineTo(r, h);
                              ctx.quadraticCurveTo(0, h, 0, h - r);
                              ctx.lineTo(0, r);
                              ctx.quadraticCurveTo(0, 0, r, 0);
                            }
                            ctx.closePath();
                          }) as any,
                        })}
                        onClick={() => { setSelectedId(null); setSelectedBg(true); }}
                        onTap={() => { setSelectedId(null); setSelectedBg(true); }}
                        onDragEnd={handleBgDragEnd}
                        onTransformEnd={handleBgTransformEnd}
                      >
                        <Group
                          x={STAGE_W / 2}
                          y={STAGE_H / 2}
                          rotation={mediaRotation}
                          offsetX={STAGE_W / 2}
                          offsetY={STAGE_H / 2}
                          scaleX={mediaRotation % 180 !== 0 ? STAGE_W / STAGE_H : 1}
                          scaleY={mediaRotation % 180 !== 0 ? STAGE_W / STAGE_H : 1}
                        >
                          {isVideo ? (
                            <KonvaVideoImage src={previewUrl} width={STAGE_W} height={STAGE_H} muted={videoMuted} filter={filter} />
                          ) : (
                            <KonvaImageLoader src={previewUrl} width={STAGE_W} height={STAGE_H} filter={filter} />
                          )}
                        </Group>
                      </Group>
                    )}

                    {overlays.map((overlay) => {
                      if (editingTextId === overlay.id) return null;
                      switch (overlay.type) {
                        case 'text':
                          return (
                            <Group
                              key={overlay.id}
                              id={overlay.id}
                              x={overlay.x}
                              y={overlay.y}
                              rotation={overlay.rotation}
                              scaleX={overlay.scaleX}
                              scaleY={overlay.scaleY}
                              draggable
                              onClick={() => { setSelectedId(overlay.id); setSelectedBg(false); }}
                              onTap={() => { setSelectedId(overlay.id); setSelectedBg(false); }}
                              onDblClick={() => handleTextDblClick(overlay.id)}
                              onDblTap={() => handleTextDblClick(overlay.id)}
                              onDragEnd={(e) => handleDragEnd(overlay.id, e)}
                              onTransformEnd={(e) => handleTransformEnd(overlay.id, e)}
                            >
                              <KonvaText
                                text={overlay.text || ''}
                                fontFamily={overlay.fontFamily || 'Inter'}
                                fontSize={overlay.fontSize || 36}
                                fontStyle={overlay.fontStyle === 'italic' ? 'italic' : 'normal'}
                                textDecoration={overlay.textDecoration}
                                align={overlay.textAlign || 'center'}
                                fill={overlay.fill || '#FFFFFF'}
                                shadowColor="rgba(0,0,0,0.5)"
                                shadowBlur={4}
                                shadowOffset={{ x: 1, y: 2 }}
                                width={overlay.width}
                              />
                            </Group>
                          );
                        case 'sticker':
                          return (
                            <Group
                              key={overlay.id}
                              id={overlay.id}
                              x={overlay.x}
                              y={overlay.y}
                              rotation={overlay.rotation}
                              scaleX={overlay.scaleX}
                              scaleY={overlay.scaleY}
                              draggable
                              onClick={() => { setSelectedId(overlay.id); setSelectedBg(false); }}
                              onTap={() => { setSelectedId(overlay.id); setSelectedBg(false); }}
                              onDragEnd={(e) => handleDragEnd(overlay.id, e)}
                              onTransformEnd={(e) => handleTransformEnd(overlay.id, e)}
                            >
                              <KonvaText
                                text={overlay.emoji || ''}
                                fontSize={overlay.width}
                                width={overlay.width}
                                height={overlay.height}
                                align="center"
                                verticalAlign="middle"
                              />
                            </Group>
                          );
                        case 'image':
                          return (
                            <Group
                              key={overlay.id}
                              id={overlay.id}
                              x={overlay.x}
                              y={overlay.y}
                              rotation={overlay.rotation}
                              scaleX={overlay.scaleX}
                              scaleY={overlay.scaleY}
                              draggable
                              onClick={() => { setSelectedId(overlay.id); setSelectedBg(false); }}
                              onTap={() => { setSelectedId(overlay.id); setSelectedBg(false); }}
                              onDragEnd={(e) => handleDragEnd(overlay.id, e)}
                              onTransformEnd={(e) => handleTransformEnd(overlay.id, e)}
                            >
                              <KonvaImageLoader src={overlay.src!} width={overlay.width} height={overlay.height} />
                            </Group>
                          );
                        case 'mention':
                          return (
                            <Group
                              key={overlay.id}
                              id={overlay.id}
                              x={overlay.x}
                              y={overlay.y}
                              rotation={overlay.rotation}
                              scaleX={overlay.scaleX}
                              scaleY={overlay.scaleY}
                              draggable
                              onClick={() => { setSelectedId(overlay.id); setSelectedBg(false); }}
                              onTap={() => { setSelectedId(overlay.id); setSelectedBg(false); }}
                              onDragEnd={(e) => handleDragEnd(overlay.id, e)}
                              onTransformEnd={(e) => handleTransformEnd(overlay.id, e)}
                            >
                              <KonvaText
                                text={overlay.text || ''}
                                fontFamily="Inter"
                                fontSize={18}
                                fontStyle="700"
                                fill="#FFFFFF"
                                shadowColor="rgba(0,0,0,0.5)"
                                shadowBlur={4}
                                shadowOffset={{ x: 1, y: 2 }}
                                width={overlay.width}
                                height={overlay.height}
                                align="center"
                                verticalAlign="middle"
                              />
                            </Group>
                          );
                        default:
                          return null;
                      }
                    })}
                    <Transformer
                      ref={transformerRef}
                      boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 10 || newBox.height < 10) return oldBox;
                        return newBox;
                      }}
                    />
                  </Layer>
                  {/* Layer 3: Drawings */}
                  <Layer>
                    {strokes.map((stroke) => {
                      const isEraser = stroke.tool === 'eraser';
                      return (
                        <Line
                          key={stroke.id}
                          points={stroke.points}
                          stroke={isEraser ? 'black' : stroke.color}
                          strokeWidth={stroke.tool === 'highlighter' ? stroke.size * 2.5 : stroke.size}
                          opacity={stroke.tool === 'highlighter' ? 0.35 : 1}
                          globalCompositeOperation={isEraser ? 'destination-out' : 'source-over'}
                          lineCap="round"
                          lineJoin="round"
                          tension={0.5}
                          shadowColor={stroke.tool === 'neon' ? stroke.color : undefined}
                          shadowBlur={stroke.tool === 'neon' ? 15 : undefined}
                          shadowOpacity={stroke.tool === 'neon' ? 1 : undefined}
                          listening={false}
                        />
                      );
                    })}
                    <Line
                      ref={drawingLineRef}
                      stroke={drawColor}
                      strokeWidth={activeDrawTool === 'highlighter' ? brushSize * 2.5 : brushSize}
                      opacity={activeDrawTool === 'highlighter' ? 0.35 : 1}
                      globalCompositeOperation={activeDrawTool === 'eraser' ? 'destination-out' : 'source-over'}
                      lineCap="round"
                      lineJoin="round"
                      tension={0.5}
                      shadowColor={activeDrawTool === 'neon' ? drawColor : undefined}
                      shadowBlur={activeDrawTool === 'neon' ? 15 : undefined}
                      shadowOpacity={activeDrawTool === 'neon' ? 1 : undefined}
                      listening={false}
                    />
                  </Layer>
                </Stage>
                {selectedId && !drawingMode && (
                  <div className="absolute top-2 left-2 z-10">
                    <Button variant="destructive" size="icon" className="w-7 h-7" onClick={handleDeleteSelected}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
    );

    const tabRail = (
      <div className="flex shrink-0 border-b border-border">
        {(['text', 'stickers', 'mentions', 'draw', 'music'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setDrawingMode(tab === 'draw');
              setSelectedId(null);
              setSelectedBg(false);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-3 text-sm font-medium transition-colors capitalize whitespace-nowrap ${
              activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'text' && <Type className="h-4 w-4 shrink-0" />}
            {tab === 'stickers' && <span className="text-base">😀</span>}
            {tab === 'mentions' && <AtSign className="h-4 w-4 shrink-0" />}
            {tab === 'draw' && <Pen className="h-4 w-4 shrink-0" />}
            {tab === 'music' && <Music className="h-4 w-4 shrink-0" />}
            <span className="hidden md:inline">{tab}</span>
          </button>
        ))}
      </div>
    );

    const panelScroll = (
      <ScrollArea className="flex-1 min-h-0 p-4">
                {activeTab === 'text' && (
                  <div className="space-y-4">
                    <Button className="w-full" size="sm" onClick={handleAddText}>
                      <Type className="h-4 w-4 mr-1.5" />
                      Add Text
                    </Button>
                    {selectedOverlay?.type === 'text' ? (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Font</Label>
                          <Select value={selectedOverlay.fontFamily} onValueChange={(v) => updateOverlay(selectedOverlay.id, { fontFamily: v })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FONT_OPTIONS.map((font) => (
                                <SelectItem key={font.id} value={font.css}>{font.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Weight</Label>
                          <Select value={String(selectedOverlay.fontWeight)} onValueChange={(v) => updateOverlay(selectedOverlay.id, { fontWeight: Number(v) })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FONT_WEIGHTS.map((w) => (
                                <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2">
                          <Button variant={selectedOverlay.fontStyle === 'italic' ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0"
                            onClick={() => updateOverlay(selectedOverlay.id, { fontStyle: selectedOverlay.fontStyle === 'italic' ? 'normal' : 'italic' })}>
                            <Italic className="h-4 w-4" />
                          </Button>
                          <Button variant={selectedOverlay.textDecoration === 'underline' ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0"
                            onClick={() => updateOverlay(selectedOverlay.id, { textDecoration: selectedOverlay.textDecoration === 'underline' ? 'none' : 'underline' })}>
                            <Underline className="h-4 w-4" />
                          </Button>
                          <div className="flex-1" />
                          <Button variant={selectedOverlay.textAlign === 'left' ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0"
                            onClick={() => updateOverlay(selectedOverlay.id, { textAlign: 'left' })}>
                            <AlignLeft className="h-4 w-4" />
                          </Button>
                          <Button variant={selectedOverlay.textAlign === 'center' ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0"
                            onClick={() => updateOverlay(selectedOverlay.id, { textAlign: 'center' })}>
                            <AlignCenter className="h-4 w-4" />
                          </Button>
                          <Button variant={selectedOverlay.textAlign === 'right' ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0"
                            onClick={() => updateOverlay(selectedOverlay.id, { textAlign: 'right' })}>
                            <AlignRight className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Color</Label>
                          <div className="flex gap-1 flex-wrap">
                            {TEXT_COLORS.map((color) => (
                              <button key={color}
                                className={`w-6 h-6 rounded border-2 ${selectedOverlay.fill === color ? 'border-primary scale-110' : 'border-transparent'}`}
                                style={{ backgroundColor: color }}
                                onClick={() => updateOverlay(selectedOverlay.id, { fill: color })}
                              />
                            ))}
                            <input type="color" value={selectedOverlay.fill || '#FFFFFF'}
                              onChange={(e) => updateOverlay(selectedOverlay.id, { fill: e.target.value })}
                              className="w-6 h-6 rounded cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        Select a text overlay on the canvas to edit its style
                      </p>
                    )}
                  </div>
                )}

                {activeTab === 'stickers' && (
                  <div className="space-y-4">
                    <div className="flex border-b border-border">
                      {(['emoji', 'sticker'] as const).map((subTab) => (
                        <button
                          key={subTab}
                          onClick={() => setStickerTab(subTab)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors capitalize ${
                            stickerTab === subTab ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {subTab}
                        </button>
                      ))}
                    </div>
                    {stickerTab === 'emoji' ? (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search emojis..."
                            value={emojiSearch}
                            onChange={(e) => setEmojiSearch(e.target.value)}
                            className="h-9 pl-8 text-sm"
                          />
                        </div>
                        {catalogEmojisLoading ? (
                          <p className="text-xs text-muted-foreground text-center py-6">Loading emojis...</p>
                        ) : filteredEmojis.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-6">No emojis found</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-[320px] overflow-y-auto">
                            {filteredEmojis.map((item) => (
                              <button
                                key={item.url}
                                className="w-10 h-10 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors overflow-hidden"
                                onClick={() => handleAddCatalogEmoji(item)}
                                title={item.name}
                              >
                                <img src={item.url} alt={item.name} className="w-8 h-8 object-contain" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Button variant="outline" size="sm" className="w-full" onClick={() => stickerInputRef.current?.click()}>
                          <Upload className="h-4 w-4 mr-1.5" />
                          Upload Image
                        </Button>
                        <input ref={stickerInputRef} type="file" className="hidden" accept="image/*" onChange={handleAddImageSticker} />
                        <p className="text-xs text-muted-foreground text-center">
                          Upload a custom image to use as a sticker
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'mentions' && (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium mb-2 block">Search People</Label>
                      <Input
                        placeholder="Search by name or @username..."
                        value={mentionSearch}
                        onChange={(e) => setMentionSearch(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      {mentionSearching ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Searching...</p>
                      ) : mentionResults.length > 0 ? (
                        mentionResults.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => handleSelectMention(u)}
                            className="w-full flex items-center gap-3 p-2 hover:bg-accent rounded-lg transition-colors"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={u.profile_pic || undefined} />
                              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                {u.display_name[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="text-left">
                              <p className="font-semibold text-sm">{u.display_name}</p>
                              <p className="text-xs text-muted-foreground">@{u.username}</p>
                            </div>
                          </button>
                        ))
                      ) : mentionSearch.trim() ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No users found</p>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Type a name or username to mention someone
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'draw' && (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium mb-2 block">Tool</Label>
                      <div className="flex gap-1">
                        {DRAW_TOOLS.map((tool) => (
                          <Button
                            key={tool.id}
                            variant={activeDrawTool === tool.id ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 flex-1 text-xs"
                            onClick={() => setActiveDrawTool(tool.id as 'pen' | 'neon' | 'highlighter')}
                          >
                            {tool.label}
                          </Button>
                        ))}
                        <Button
                          variant={activeDrawTool === 'eraser' ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => setActiveDrawTool('eraser')}
                        >
                          <Eraser className="h-3.5 w-3.5 mr-1" />
                          Eraser
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-medium mb-2 block">Color</Label>
                      <div className="flex gap-1 flex-wrap">
                        {DRAW_COLORS.map((color) => (
                          <button
                            key={color}
                            className={`w-6 h-6 rounded-full border-2 ${drawColor === color ? 'border-primary scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setDrawColor(color)}
                          />
                        ))}
                        <input
                          type="color"
                          value={drawColor}
                          onChange={(e) => setDrawColor(e.target.value)}
                          className="w-6 h-6 rounded-full cursor-pointer"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-medium mb-2 block">Size: {brushSize}px</Label>
                      <Slider
                        value={[brushSize]}
                        onValueChange={([v]) => setBrushSize(v)}
                        min={2}
                        max={30}
                        step={1}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleUndo}
                        disabled={strokes.length === 0}
                      >
                        <Undo2 className="h-4 w-4 mr-1.5" />
                        Undo
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleRedo}
                        disabled={redoStack.length === 0}
                      >
                        <Redo2 className="h-4 w-4 mr-1.5" />
                        Redo
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground text-center pt-2">
                      Draw directly on the story canvas
                    </p>
                  </div>
                )}

                {activeTab === 'music' && (
                  <div className="space-y-4">
                    <MusicTab music={music} onSelect={setMusic} />
                    {isVideo && (
                      <div className="border-t border-border pt-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7"
                            onClick={() => setVideoMuted(prev => !prev)}
                          >
                            {videoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {videoMuted ? 'Video muted' : 'Video audio playing'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
    );

    const tabIcons: { id: 'text' | 'stickers' | 'mentions' | 'draw' | 'music'; label: string; node: React.ReactNode }[] = [
      { id: 'text', label: 'Aa', node: <Type className="h-5 w-5" /> },
      { id: 'stickers', label: '🙂', node: <span className="text-xl leading-none">🙂</span> },
      { id: 'mentions', label: '@', node: <AtSign className="h-5 w-5" /> },
      { id: 'draw', label: 'Brush', node: <Pen className="h-5 w-5" /> },
      { id: 'music', label: 'Music', node: <Music className="h-5 w-5" /> },
    ];

    const privacyNode = (
      <Popover open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="text-white">
            <Globe className="h-4 w-4 mr-2" />
            {PRIVACY_OPTIONS.find((o) => o.value === privacy)?.label || 'Public'}
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <RadioGroup value={privacy} onValueChange={(v) => setPrivacy(v as StoryPrivacy)}>
            {PRIVACY_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center space-x-3 space-y-0 rounded-md px-2 py-1.5 hover:bg-accent">
                <opt.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Label htmlFor={`${opt.value}`} className="flex-1 text-sm cursor-pointer">{opt.label}</Label>
                <RadioGroupItem value={opt.value} id={`${opt.value}`} />
              </div>
            ))}
          </RadioGroup>
        </PopoverContent>
      </Popover>
    );

    if (variant === 'page') {
      const railTools = (['text', 'stickers', 'draw', 'music'] as const);
      return (
        <div className="fixed inset-0 z-[100] bg-black overflow-hidden">
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3" style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
            <h1 className="text-base font-semibold text-white drop-shadow">Edit Story</h1>
            <div className="flex items-center gap-1">
              {privacyNode}
              <Button variant="ghost" size="icon" className="text-white h-9 w-9" onClick={handleBack} aria-label="Back">
                <ChevronLeft className="h-6 w-6" />
              </Button>
            </div>
          </div>

          {/* Canvas */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div className="relative h-full w-full flex items-center justify-center">
              <div className="relative" style={{ height: '100%', width: STAGE_H / STAGE_W * (window.innerHeight || 640) > window.innerWidth ? 'auto' : 'auto' }}>
                {canvasBlock}
              </div>
            </div>
          </div>

          {/* Left tool rail */}
          <div className="absolute left-3 top-1/2 z-30 -translate-y-1/2 flex flex-col items-center gap-5" style={{ top: '50%' }}>
            {railTools.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setMoreOpen(false);
                  if (activeTab === tab) { setActiveTab('none'); setDrawingMode(false); setSelectedId(null); setSelectedBg(false); return; }
                  setActiveTab(tab); setDrawingMode(tab === 'draw'); setSelectedId(null); setSelectedBg(false);
                }}
                className={`h-11 w-14 rounded-full flex items-center justify-center transition-colors ${
                  activeTab === tab ? 'bg-white/25 text-white' : 'text-white/90 hover:bg-white/10'
                }`}
                title={tab}
              >
                {tabIcons.find((i) => i.id === tab)?.node}
              </button>
            ))}
            <button
              onClick={() => {
                if (activeTab !== 'none') { setActiveTab('none'); setDrawingMode(false); setSelectedId(null); setSelectedBg(false); }
                setMoreOpen(true); setMoreTab('menu');
              }}
              className={`h-11 w-14 rounded-full flex items-center justify-center transition-colors ${moreOpen ? 'bg-white/25 text-white' : 'text-white/90 hover:bg-white/10'}`}
              title="More"
            >
              <span className="text-white text-lg leading-none">⌄</span>
            </button>
          </div>

          {/* More menu bottom sheet */}
          {moreOpen && (
            <div className="absolute bottom-16 left-0 right-0 z-40 flex justify-center">
              <div className="w-full max-w-sm mx-4 rounded-2xl bg-neutral-900/95 backdrop-blur border border-white/10 overflow-hidden max-h-[55vh]">
                <div className="flex items-center justify-between px-3 py-1 border-b border-white/10">
                  <span className="text-sm font-medium text-white">
                    {moreTab === 'menu' ? 'More' :
                      moreTab === 'effects' ? 'Effects' :
                      moreTab === 'shape' ? 'Select Shape' :
                      moreTab === 'mention' ? 'Mention @' :
                      moreTab === 'save' ? 'Save' : 'More Tools'}
                  </span>
                  <button onClick={closeMore} className="text-white/70 hover:text-white p-1" aria-label="Close panel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[calc(55vh-40px)] overflow-y-auto p-3">

                  {moreTab === 'menu' && (
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: 'effects', label: 'Effects', icon: <Wand2 className="h-5 w-5" /> },
                        { id: 'shape', label: 'Shape', icon: <Shapes className="h-5 w-5" /> },
                        { id: 'mention', label: 'Mention', icon: <AtSign className="h-5 w-5" /> },
                        { id: 'save', label: 'Save', icon: <Save className="h-5 w-5" /> },
                        { id: 'more', label: 'More...', icon: <MoreHorizontal className="h-5 w-5" /> },
                      ] as const).map((item) => (
                        <button key={item.id} onClick={() => setMoreTab(item.id)}
                          className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-white">
                          {item.icon}
                          <span className="text-xs font-medium">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {moreTab === 'effects' && (
                    <div className="flex flex-wrap gap-2">
                      {FILTER_OPTIONS.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => { setFilter(f.id); }}
                          className={`flex-1 min-w-[30%] px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filter === f.id ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {moreTab === 'shape' && (
                    <div className="grid grid-cols-2 gap-2">
                      {SHAPE_OPTIONS.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { setMediaShape(s.id); }}
                          className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm transition-colors ${mediaShape === s.id ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                          {s.id === 'circle' ? <Circle className="h-4 w-4" /> : s.id === 'square' ? <Square className="h-4 w-4" /> : s.id === 'rounded' ? <Square className="h-4 w-4" /> : <RectangleHorizontal className="h-4 w-4" />}
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {moreTab === 'mention' && (
                    <div className="space-y-3">
                      <div>
                        <Input
                          placeholder="Search by name or @username..."
                          value={mentionSearch}
                          onChange={(e) => setMentionSearch(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        {mentionSearching ? (
                          <p className="text-xs text-white/50 text-center py-4">Searching...</p>
                        ) : mentionResults.length > 0 ? (
                          mentionResults.map((u) => (
                            <button key={u.id} onClick={() => { handleSelectMention(u); closeMore(); }}
                              className="w-full flex items-center gap-3 p-2 hover:bg-white/10 rounded-lg transition-colors">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={u.profile_pic || undefined} />
                                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                  {u.display_name[0]?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="text-left">
                                <p className="font-semibold text-sm text-white">{u.display_name}</p>
                                <p className="text-xs text-white/60">@{u.username}</p>
                              </div>
                            </button>
                          ))
                        ) : mentionSearch.trim() ? (
                          <p className="text-xs text-white/50 text-center py-4">No users found</p>
                        ) : (
                          <p className="text-xs text-white/50 text-center py-4">Type a name or username to mention someone</p>
                        )}
                      </div>
                    </div>
                  )}

                  {moreTab === 'save' && (
                    <div className="space-y-2">
                      <p className="text-xs text-white/60">Save the edited media to your device.</p>
                      <Button className="w-full" onClick={handleSaveToDevice}>
                        <Download className="h-4 w-4 mr-1.5" /> Download to Device
                      </Button>
                    </div>
                  )}

                  {moreTab === 'more' && (
                    <div className="space-y-2">
                      <button onClick={() => { reset(); closeMore(); }}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-white">
                        <RotateCw className="h-4 w-4" /> Reset all edits
                      </button>
                      <p className="text-xs text-white/40 text-center pt-2">More tools coming soon...</p>
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}

          {/* Bottom share bar */}
          <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 bg-gradient-to-t from-black/70 to-transparent">
            <div className="flex items-center justify-center gap-3">
              <Button onClick={handleCreate} disabled={uploading} size="sm" className="rounded-full bg-white text-black hover:bg-white/90">
                {uploading ? <>{uploadProgress}</> : <><Check className="h-4 w-4 mr-1" /> Share</>}
              </Button>
            </div>
          </div>

          {/* Active tool bottom sheet */}
          {activeTab !== 'none' && (
            <div className="absolute bottom-16 left-0 right-0 z-40 flex justify-center">
              <div className="w-full max-w-sm mx-4 rounded-2xl bg-neutral-900/95 backdrop-blur border border-white/10 overflow-hidden max-h-[42vh]">
                <div className="flex items-center justify-between px-3 py-1 border-b border-white/10">
                  <span className="text-sm font-medium text-white">{tabIcons.find((i) => i.id === activeTab)?.label}</span>
                  <button onClick={() => { setActiveTab('none'); setDrawingMode(false); setSelectedId(null); setSelectedBg(false); }} className="text-white/70 hover:text-white p-1" aria-label="Close panel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[calc(42vh-40px)] overflow-y-auto p-3">
                  {activeTab === 'text' && (
                    <div className="flex flex-wrap gap-2">
                      <Button className="w-full" size="sm" onClick={handleAddText}>
                        <Type className="h-4 w-4 mr-1.5" /> Add Text
                      </Button>
                      <div className="w-full flex flex-wrap gap-1">
                        {TEXT_COLORS.map((color) => (
                          <button key={color} className={`w-7 h-7 rounded border ${selectedOverlay?.fill === color ? 'border-white scale-110' : 'border-white/20'}`}
                            style={{ backgroundColor: color }} onClick={() => selectedOverlay ? updateOverlay(selectedOverlay.id, { fill: color }) : setActiveTab('text')} />
                        ))}
                      </div>
                    </div>
                  )}
                  {activeTab === 'stickers' && (
                    <div>
                      <div className="flex border-b border-white/10 mb-2">
                        {(['emoji', 'sticker'] as const).map((subTab) => (
                          <button key={subTab} onClick={() => setStickerTab(subTab)}
                            className={`flex-1 py-2 text-sm capitalize ${stickerTab === subTab ? 'text-white border-b-2 border-white' : 'text-white/50'}`}>
                            {subTab}
                          </button>
                        ))}
                      </div>
                      {stickerTab === 'emoji' ? (
                        <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
                          {catalogEmojisLoading ? <p className="text-xs text-white/50 text-center w-full py-4">Loading...</p> :
                            filteredEmojis.slice(0, 60).map((item) => (
                              <button key={item.url} className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
                                onClick={() => handleAddCatalogEmoji(item)}>
                                <img src={item.url} alt={item.name} className="w-8 h-8 object-contain" loading="lazy" />
                              </button>
                            ))}
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="w-full text-white" onClick={() => stickerInputRef.current?.click()}>
                          <Upload className="h-4 w-4 mr-1.5" /> Upload Image
                        </Button>
                      )}
                      <input ref={stickerInputRef} type="file" className="hidden" accept="image/*" onChange={handleAddImageSticker} />
                    </div>
                  )}
                  {activeTab === 'draw' && (
                    <div className="space-y-3">
                      <div className="flex gap-1">
                        {DRAW_TOOLS.map((tool) => (
                          <Button key={tool.id} variant={activeDrawTool === tool.id ? 'default' : 'outline'} size="sm" className="h-8 flex-1 text-xs text-white"
                            onClick={() => setActiveDrawTool(tool.id as 'pen' | 'neon' | 'highlighter')}>
                            {tool.label}
                          </Button>
                        ))}
                        <Button variant={activeDrawTool === 'eraser' ? 'default' : 'outline'} size="sm" className="h-8 px-2 text-xs text-white" onClick={() => setActiveDrawTool('eraser')}>
                          <Eraser className="h-3.5 w-3.5 mr-1" /> Eraser
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {DRAW_COLORS.map((color) => (
                          <button key={color} className={`w-7 h-7 rounded-full border ${drawColor === color ? 'border-white scale-110' : 'border-white/20'}`}
                            style={{ backgroundColor: color }} onClick={() => setDrawColor(color)} />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/60">Size: {brushSize}px</span>
                        <Slider value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} min={2} max={30} step={1} className="flex-1" />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 text-white" onClick={handleUndo} disabled={strokes.length === 0}>
                          <Undo2 className="h-4 w-4 mr-1.5" /> Undo
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 text-white" onClick={handleRedo} disabled={redoStack.length === 0}>
                          <Redo2 className="h-4 w-4 mr-1.5" /> Redo
                        </Button>
                      </div>
                    </div>
                  )}
                  {activeTab === 'music' && (
                    <div className="space-y-3">
                      <MusicTab music={music} onSelect={setMusic} />
                      {isVideo && (
                        <div className="flex items-center gap-2 pt-1">
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-white" onClick={() => setVideoMuted(prev => !prev)}>
                            {videoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                          </Button>
                          <span className="text-xs text-white/70">
                            {videoMuted ? 'Video muted' : 'Video audio playing'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-4xl h-[100dvh] sm:h-[90vh] min-h-0 p-0 gap-0 flex flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border">
            <Button variant="ghost" size="icon" onClick={handleBack}><ChevronLeft className="h-5 w-5" /></Button>
            <h1 className="text-base sm:text-lg font-semibold truncate flex-1 min-w-0 text-center">Edit Story</h1>
            <Button onClick={handleCreate} disabled={uploading} size="sm" className="shrink-0">
              {uploading ? <>{uploadProgress}</> : <><Check className="h-4 w-4 mr-1" /> Share</>}
            </Button>
          </div>

            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {canvasBlock}
              <div className="w-full flex-1 md:w-80 md:flex-none min-h-0 border-t md:border-t-0 md:border-l border-border bg-background flex flex-col">
              {tabRail}
              {panelScroll}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

    const quickCardsNode = (
        <div className="flex shrink-0 gap-2 px-3 sm:px-4 pt-3">
          {([
            { key: 'templates', label: 'Templates', icon: LayoutTemplate },
            { key: 'music', label: 'Music', icon: Music },
            { key: 'post', label: 'Post', icon: Newspaper },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPickerPanel(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                pickerPanel === tab.key ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
              }`}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </div>

    );

    const pickerBody = (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          {/* Gallery */}
          {pickerPanel === 'gallery' && (
            <>
              <div className="flex shrink-0 items-center justify-between px-3 sm:px-4 py-2">
                <Select value={libraryOrder} onValueChange={(v) => setLibraryOrder(v as 'latest' | 'oldest')}>
                  <SelectTrigger className="h-8 w-[130px] text-sm">
                    <SelectValue />
                    <ChevronDown className="h-4 w-4" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant={selectMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (selectMode) setSelectedUrls(new Set());
                    setSelectMode(!selectMode);
                  }}
                >
                  <CheckSquare className="h-4 w-4 mr-1.5" />
                  {selectMode ? 'Done' : 'Select'}
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 px-3 sm:px-4 pb-6">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="aspect-square rounded-lg bg-secondary flex flex-col items-center justify-center gap-1 hover:bg-secondary/70 transition-colors"
                >
                  <Camera className="h-6 w-6 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">Camera</span>
                </button>
                <button
                  onClick={() => videoInputRef.current?.click()}
                  className="aspect-square rounded-lg bg-secondary flex flex-col items-center justify-center gap-1 hover:bg-secondary/70 transition-colors"
                >
                  <Video className="h-6 w-6 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">Video</span>
                </button>
                {sortedItems.map((item) => {
                  const selected = selectMode && selectedUrls.has(item.url);
                  return (
                    <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden group">
                      <button onClick={() => openItem(item)} className="absolute inset-0">
                        {item.kind === 'image' ? (
                          <img src={item.url} alt="" className="w-full h-full object-cover"  loading="lazy" decoding="async" />
                        ) : (
                          <video src={item.url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                        )}
                      </button>
                      {item.kind === 'video' && item.duration != null && (
                        <span className="absolute bottom-1 right-1 text-[10px] font-medium text-white bg-black/70 px-1 rounded pointer-events-none">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                      {selectMode && (
                        <>
                          <div className={`absolute inset-0 pointer-events-none ${selected ? 'ring-2 ring-primary ring-inset' : ''}`} />
                          <div
                            className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center border pointer-events-none ${
                              selected ? 'bg-primary border-primary' : 'bg-black/40 border-white/70'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                        </>
                      )}
                      {!selectMode && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeItem(item); }}
                          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3 text-white" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="aspect-square rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-accent/50 transition-colors"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-[11px]">Add</span>
                </button>
              </div>

              {libraryItems.length === 0 && (
                <p className="text-xs text-muted-foreground text-center pb-6 px-4">
                  Pick photos or videos from your device. Nothing is uploaded until you share your story.
                </p>
              )}

              {selectMode && selectedUrls.size > 0 && (
                <div className="shrink-0 sticky bottom-0 border-t border-border bg-background px-3 sm:px-4 py-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{selectedUrls.size} selected</span>
                  <Button size="sm" onClick={handleShareSelected}>
                    <Check className="h-4 w-4 mr-1" /> Share
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Templates */}
          {pickerPanel === 'templates' && (
            <div className="p-4">
              <Button variant="ghost" size="sm" onClick={() => setPickerPanel('gallery')} className="-ml-2 mb-3">
                <ChevronLeft className="h-4 w-4 mr-1" /> Media
              </Button>
              <p className="text-sm font-medium mb-3">Story templates</p>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {STORY_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    disabled={templateBusy}
                    className="relative aspect-[9/16] rounded-lg overflow-hidden group hover:opacity-90 transition-opacity"
                  >
                    <div
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(135deg, ${template.colors.join(', ')})` }}
                    />
                    <div className="absolute inset-0 ring-1 ring-inset ring-border/50" />
                    <span className="absolute bottom-1 left-1 right-1 text-left text-[10px] font-medium text-white drop-shadow">
                      {template.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Music */}
          {pickerPanel === 'music' && (
            <div className="p-4 space-y-3">
              <Button variant="ghost" size="sm" onClick={() => setPickerPanel('gallery')} className="-ml-2">
                <ChevronLeft className="h-4 w-4 mr-1" /> Media
              </Button>
              <p className="text-sm font-medium">Add music to your story</p>
              <MusicTab
                music={music}
                onSelect={(m) => { setMusic(m); if (m) setPickerPanel('gallery'); }}
              />
              <p className="text-xs text-muted-foreground">You can also change the music while editing your story.</p>
            </div>
          )}

          {/* Post */}
          {pickerPanel === 'post' && (
            <div className="p-4">
              <Button variant="ghost" size="sm" onClick={() => setPickerPanel('gallery')} className="-ml-2 mb-3">
                <ChevronLeft className="h-4 w-4 mr-1" /> Media
              </Button>
              <p className="text-sm font-medium mb-3">Add a post to your story</p>
              {postsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading your posts...</p>
              ) : posts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No posts with media yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {posts.map((p) => {
                    const isVideo = p.media_type === 'video' || /\.mp4($|\?)/i.test(p.media_url);
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleOpenPost(p)}
                        disabled={postBusy === p.id}
                        className="relative aspect-square rounded-lg overflow-hidden"
                      >
                        {isVideo ? (
                          <video src={p.media_url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                        ) : (
                          <img src={p.media_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        )}
                        {isVideo && <Video className="absolute bottom-1 right-1 h-4 w-4 text-white drop-shadow pointer-events-none" />}
                        {postBusy === p.id && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-xs text-white">Loading</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

    );

    const pickerInputs = (
      <>
        {/* Hidden inputs for media capture/gallery */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) addMediaFiles(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) addMediaFiles(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) addMediaFiles(e.target.files); e.target.value = ''; }}
        />

      </>
    );

    if (variant === 'page') {
      return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col text-white overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3" style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
            <Button variant="ghost" size="icon" className="text-white -ml-2" onClick={handleBack} aria-label="Back">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <h2 className="flex-1 min-w-0 text-center text-base font-semibold truncate">Add to Story</h2>
            <Button variant="ghost" size="icon" className="text-white -mr-2" onClick={handleClose} aria-label="Close">
              <X className="h-6 w-6" />
            </Button>
          </div>
          {quickCardsNode}
          {pickerBody}
          {pickerInputs}
        </div>
      );
    }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg h-[100dvh] sm:h-[85vh] min-h-0 p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border">
          <Popover open={privacyOpen} onOpenChange={setPrivacyOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Story settings">
                <Settings className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <p className="text-sm font-semibold mb-3">Who can see your story?</p>
              <RadioGroup value={privacy} onValueChange={(v) => setPrivacy(v as StoryPrivacy)}>
                {PRIVACY_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <label key={option.value} className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted cursor-pointer">
                      <RadioGroupItem value={option.value} id={`privacy-${option.value}`} className="mt-0.5" />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {option.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">{option.description}</span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </PopoverContent>
          </Popover>
          <h2 className="flex-1 min-w-0 text-center text-base font-semibold truncate">Add to Story</h2>
          <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
          {quickCardsNode}
          {pickerBody}
          {pickerInputs}
        </DialogContent>
      </Dialog>
    );
}
