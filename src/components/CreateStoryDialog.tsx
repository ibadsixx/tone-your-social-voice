import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Upload, Type, Music, X, Check, ChevronLeft, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Trash2, RotateCw } from 'lucide-react';
import { Stage, Layer, Text as KonvaText, Image as KonvaImage, Transformer, Group, Rect } from 'react-konva';
import Konva from 'konva';
import { useStories } from '@/hooks/useStories';

const STAGE_W = 360;
const STAGE_H = 640;

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

const STICKER_EMOJIS = ['😀', '😂', '❤️', '🔥', '🎉', '✨', '🌟', '💪', '🙌', '👏', '😍', '🥰', '💯', '⭐', '🌈', '🎶', '📸', '💡', '🎯', '🚀'];

interface CanvasOverlay {
  id: string;
  type: 'text' | 'image' | 'sticker';
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function KonvaImageLoader({ src, width, height }: { src: string; width: number; height: number }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadImage(src).then((i) => { if (!cancelled) setImg(i); });
    return () => { cancelled = true; };
  }, [src]);
  if (!img) return null;
  return <KonvaImage image={img} width={width} height={height} />;
}

function KonvaVideoImage({ src, width, height, muted: mutedProp }: { src: string; width: number; height: number; muted: boolean }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const imageRef = useRef<any>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const vid = document.createElement('video');
    vid.src = src;
    vid.loop = true;
    vid.muted = mutedProp;
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
  return <KonvaImage ref={imageRef} image={video} width={width} height={height} />;
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

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Paste YouTube/SoundCloud URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-9 text-sm"
        />
        <Button size="sm" className="h-9" onClick={handleAddUrl} disabled={searching || !url.trim()}>
          {searching ? '...' : 'Add'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Paste a music URL to add background music</p>
    </div>
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

export default function CreateStoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState<'select' | 'edit'>('select');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [activeTab, setActiveTab] = useState<'text' | 'stickers' | 'music'>('text');
  const [overlays, setOverlays] = useState<CanvasOverlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editTextValue, setEditTextValue] = useState('');
  const [music, setMusic] = useState<MusicData | null>(null);
  const [selectedBg, setSelectedBg] = useState(false);
  const [bgTransform, setBgTransform] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
  const [mediaRotation, setMediaRotation] = useState(0);
  const [videoMuted, setVideoMuted] = useState(true);

  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const { createStory } = useStories();

  const selectedOverlay = overlays.find((o) => o.id === selectedId);

  const reset = useCallback(() => {
    setStep('select');
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setUploading(false);
    setUploadProgress('');
    setOverlays([]);
    setSelectedId(null);
    setSelectedBg(false);
    setBgTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
    setMediaRotation(0);
    setVideoMuted(true);
    setEditingTextId(null);
    setMusic(null);
    setActiveTab('text');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [previewUrl]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) {
      alert('Please select an image or video file');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      alert('File size must be less than 50MB');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStep('edit');
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

  const handleAddSticker = (emoji: string) => {
    const newOverlay: CanvasOverlay = {
      id: createId(),
      type: 'sticker',
      emoji,
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: 60,
      height: 60,
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

  const handleCreate = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress('Uploading...');
    try {
      const captionData: any = {
        overlays: overlays.map((o) => ({
          id: o.id, type: o.type, x: o.x, y: o.y, rotation: o.rotation,
          scaleX: o.scaleX, scaleY: o.scaleY, width: o.width, height: o.height,
          text: o.text, fontFamily: o.fontFamily, fontSize: o.fontSize,
          fontWeight: o.fontWeight, fontStyle: o.fontStyle, textDecoration: o.textDecoration,
          textAlign: o.textAlign, fill: o.fill, src: o.src, emoji: o.emoji,
        })),
        bgTransform,
        mediaRotation,
        videoMuted,
      };
      const result = await createStory(
        file,
        JSON.stringify(captionData),
        music?.url, music?.title, 'public',
        music ? { startAt: music.startAt, duration: music.duration, source_type: music.source_type, video_id: music.video_id, thumbnail_url: music.thumbnail_url } : undefined,
      );
      if (result) { reset(); onOpenChange(false); }
    } catch (error) {
      console.error('[CreateStoryDialog] Failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to create story');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleClose = () => { if (!uploading) { reset(); onOpenChange(false); } };
  const handleBack = () => { reset(); };

  const scale = containerRef.current
    ? Math.min(containerRef.current.clientWidth / STAGE_W, (containerRef.current.clientHeight || 600) / STAGE_H)
    : 1;

  if (step === 'edit' && previewUrl) {
    const isVideo = file?.type.startsWith('video/');
    const editingOverlay = editingTextId ? overlays.find((o) => o.id === editingTextId) : null;

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-4xl h-[90vh] p-0 gap-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Button variant="ghost" size="icon" onClick={handleBack}><ChevronLeft className="h-5 w-5" /></Button>
            <h1 className="text-lg font-semibold">Edit Story</h1>
            <Button onClick={handleCreate} disabled={uploading} size="sm">
              {uploading ? <>{uploadProgress}</> : <><Check className="h-4 w-4 mr-1" /> Share</>}
            </Button>
          </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div ref={containerRef} className="flex-1 bg-background flex items-center justify-center p-4 min-h-[300px] relative overflow-hidden">
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
                  onClick={handleStageClick}
                  onTap={handleStageClick}
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
                  <Layer>
                    {previewUrl && (
                      <Group
                        id="__bg__"
                        x={bgTransform.x}
                        y={bgTransform.y}
                        rotation={bgTransform.rotation}
                        scaleX={bgTransform.scaleX}
                        scaleY={bgTransform.scaleY}
                        draggable
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
                            <KonvaVideoImage src={previewUrl} width={STAGE_W} height={STAGE_H} muted={videoMuted} />
                          ) : (
                            <KonvaImageLoader src={previewUrl} width={STAGE_W} height={STAGE_H} />
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
                </Stage>
                {selectedId && (
                  <div className="absolute top-2 left-2 z-10">
                    <Button variant="destructive" size="icon" className="w-7 h-7" onClick={handleDeleteSelected}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-background flex flex-col">
              <div className="flex border-b border-border">
                {(['text', 'stickers', 'music'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors capitalize ${
                      activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab === 'text' && <Type className="h-4 w-4" />}
                    {tab === 'stickers' && <span className="text-base">😀</span>}
                    {tab === 'music' && <Music className="h-4 w-4" />}
                    {tab}
                  </button>
                ))}
              </div>

              <ScrollArea className="flex-1 p-4">
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
                    {isVideo && (
                      <div className="space-y-2 border-t border-border pt-3">
                        <Label className="text-xs font-medium">Video Audio</Label>
                        <Button
                          variant={videoMuted ? 'default' : 'outline'}
                          size="sm"
                          className="w-full h-9"
                          onClick={() => setVideoMuted(prev => !prev)}
                        >
                          {videoMuted ? 'Unmute' : 'Mute'}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          {videoMuted
                            ? 'Video audio is muted — add background music from the Music tab'
                            : 'Video audio is playing'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'stickers' && (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium mb-2 block">Emoji Stickers</Label>
                      <div className="flex flex-wrap gap-2">
                        {STICKER_EMOJIS.map((emoji) => (
                          <button key={emoji}
                            className="w-10 h-10 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center text-xl transition-colors"
                            onClick={() => handleAddSticker(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-border pt-3">
                      <Label className="text-xs font-medium mb-2 block">Custom Image</Label>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => stickerInputRef.current?.click()}>
                        <Upload className="h-4 w-4 mr-1.5" />
                        Upload Image
                      </Button>
                      <input ref={stickerInputRef} type="file" className="hidden" accept="image/*" onChange={handleAddImageSticker} />
                    </div>
                  </div>
                )}

                {activeTab === 'music' && (
                  <MusicTab music={music} onSelect={setMusic} />
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
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create Story</h2>
          <div className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-border rounded-lg bg-accent/30">
            <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
            <p className="mb-2 text-sm text-muted-foreground">Image or Video (MAX. 50MB)</p>
            <Button variant="default" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-1.5" />
              Choose File
            </Button>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*" onChange={handleFileSelect} disabled={uploading} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
