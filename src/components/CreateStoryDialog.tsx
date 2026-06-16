import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

type TextShadow = 'none' | 'soft' | 'hard' | 'outline';
type TextDirection = 'ltr' | 'rtl';

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
  direction: TextDirection;
  backgroundColor: string | undefined;
  shadow: TextShadow;
  rotation: number;
  frameWidth: number;
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

function getShadowCss(shadow: TextShadow, color: string): string {
  switch (shadow) {
    case 'none':
      return 'none';
    case 'soft':
      return '2px 2px 4px rgba(0,0,0,0.7)';
    case 'hard':
      return '3px 3px 0 rgba(0,0,0,0.9)';
    case 'outline':
      return `${color === '#FFFFFF' ? '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' : '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'}`;
  }
}

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function createId(): string {
  return `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const CreateStoryDialog = ({ open, onOpenChange }: CreateStoryDialogProps) => {
  const [step, setStep] = useState<'select' | 'edit'>('select');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [music, setMusic] = useState<MusicData | null>(null);
  const [filter, setFilter] = useState<VideoFilter>(defaultVideoFilter);
  interface MediaTransform { x: number; y: number; scale: number; rotation: number; flipX: boolean; }
  const defaultMediaTransform: MediaTransform = { x: 0, y: 0, scale: 1, rotation: 0, flipX: false };
  const [mediaTransform, setMediaTransform] = useState<MediaTransform>(defaultMediaTransform);
  const mediaTransformRef = useRef<MediaTransform>(defaultMediaTransform);
  const mediaWrapperRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    active: boolean;
    startX: number; startY: number;
    startDist: number; startScale: number;
    startAngle: number; startRotation: number;
    startTx: number; startTy: number;
    startMidX: number; startMidY: number;
  } | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'text' | 'music' | 'filters'>('filters');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const dragStart = useRef<{ x: number; y: number; elX: number; elY: number; moved: boolean } | null>(null);
  const isRotating = useRef(false);
  const rotateDrag = useRef<{ id: string; centerX: number; centerY: number; startAngle: number; startRotation: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
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
    setMediaTransform(defaultMediaTransform);
    setTextOverlays([]);
    setEditingTextId(null);
    setActiveTab('filters');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  const editingOverlay = editingTextId
    ? textOverlays.find((t) => t.id === editingTextId)
    : null;

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTab !== 'text') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newOverlay: TextOverlay = {
      id: createId(),
      text: '',
      color: '#FFFFFF',
      x,
      y,
      fontFamily: editingOverlay?.fontFamily || 'Inter',
      fontSize: editingOverlay?.fontSize || 32,
      fontWeight: editingOverlay?.fontWeight || 700,
      fontStyle: editingOverlay?.fontStyle || 'normal',
      textDecoration: editingOverlay?.textDecoration || 'none',
      textAlign: editingOverlay?.textAlign || 'center',
      direction: editingOverlay?.direction || 'ltr',
      backgroundColor: editingOverlay?.backgroundColor || undefined,
      shadow: editingOverlay?.shadow || 'soft',
      rotation: editingOverlay?.rotation || 0,
      frameWidth: editingOverlay?.frameWidth || 320,
    };

    setTextOverlays([...textOverlays, newOverlay]);
    setEditingTextId(newOverlay.id);
    setTimeout(() => {
      if (editRef.current) {
        editRef.current.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editRef.current);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }, 0);
  };

  const commitText = (id: string) => {
    const el = editRef.current;
    if (!el) {
      setEditingTextId(null);
      return;
    }
    if (isRotating.current) return;
    const text = el.innerText.trim();
    if (!text) {
      setTextOverlays((prev) => prev.filter((t) => t.id !== id));
    } else {
      setTextOverlays((prev) =>
        prev.map((t) => (t.id === id ? { ...t, text } : t))
      );
    }
    setEditingTextId(null);
  };

  const handleRemoveText = (id: string) => {
    setTextOverlays(textOverlays.filter((t) => t.id !== id));
    if (editingTextId === id) setEditingTextId(null);
  };

  const updateEditing = (updates: Partial<TextOverlay>) => {
    if (!editingTextId) return;
    setTextOverlays((prev) =>
      prev.map((t) => (t.id === editingTextId ? { ...t, ...updates } : t))
    );
  };

  const handleDragStart = (id: string, e: React.MouseEvent) => {
    if (editingTextId) return;
    e.preventDefault();
    e.stopPropagation();
    const overlay = textOverlays.find((t) => t.id === id);
    if (!overlay) return;
    dragStart.current = { x: e.clientX, y: e.clientY, elX: overlay.x, elY: overlay.y, moved: false };
    setDraggingId(id);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStart.current || !draggingId) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - dragStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStart.current.y) / rect.height) * 100;
    if (Math.abs(e.clientX - dragStart.current.x) > 3 || Math.abs(e.clientY - dragStart.current.y) > 3) {
      dragStart.current.moved = true;
    }
    setTextOverlays((prev) =>
      prev.map((t) =>
        t.id === draggingId
          ? { ...t, x: Math.max(0, Math.min(100, dragStart.current!.elX + dx)), y: Math.max(0, Math.min(100, dragStart.current!.elY + dy)) }
          : t
      )
    );
  }, [draggingId]);

  const handleMouseUp = useCallback(() => {
    if (!dragStart.current || !draggingId) return;
    const wasDrag = dragStart.current.moved;
    dragStart.current = null;
    setDraggingId(null);
    if (!wasDrag) {
      setEditingTextId(draggingId);
    }
  }, [draggingId]);

  useEffect(() => {
    if (!draggingId) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, handleMouseMove, handleMouseUp]);



  useEffect(() => {
    if (!editingTextId || !editRef.current) return;
    const overlay = textOverlays.find((t) => t.id === editingTextId);
    if (!overlay) return;
    if (editRef.current.innerText !== overlay.text) {
      editRef.current.innerText = overlay.text;
    }
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editRef.current);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editingTextId]);

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

    if (editingTextId) {
      commitText(editingTextId);
    }

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

  const applyTransform = useCallback(() => {
    const el = mediaWrapperRef.current;
    if (!el) return;
    const t = mediaTransformRef.current;
    el.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale}) rotate(${t.rotation}deg) scaleX(${t.flipX ? -1 : 1})`;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    const t = mediaTransformRef.current;
    if (e.touches.length === 1) {
      gestureRef.current = {
        active: true,
        startX: e.touches[0].clientX, startY: e.touches[0].clientY,
        startDist: 0, startScale: t.scale,
        startAngle: 0, startRotation: t.rotation,
        startTx: t.x, startTy: t.y,
        startMidX: 0, startMidY: 0,
      };
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      gestureRef.current = {
        active: true,
        startX: e.touches[0].clientX, startY: e.touches[0].clientY,
        startDist: Math.hypot(dx, dy), startScale: t.scale,
        startAngle: Math.atan2(dy, dx) * (180 / Math.PI), startRotation: t.rotation,
        startTx: t.x, startTy: t.y,
        startMidX: midX, startMidY: midY,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (!g || !g.active) return;
    e.preventDefault();
    const t = mediaTransformRef.current;
    if (e.touches.length === 1) {
      if (g.startDist !== 0) {
        g.startX = e.touches[0].clientX;
        g.startY = e.touches[0].clientY;
        g.startTx = t.x;
        g.startTy = t.y;
        g.startDist = 0;
      }
      t.x = g.startTx + (e.touches[0].clientX - g.startX);
      t.y = g.startTy + (e.touches[0].clientY - g.startY);
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (g.startDist === 0) {
        g.startDist = dist;
        g.startScale = t.scale;
        g.startAngle = angle;
        g.startRotation = t.rotation;
        g.startMidX = midX;
        g.startMidY = midY;
      }
      t.scale = Math.max(0.3, Math.min(5, g.startScale * (dist / g.startDist)));
      t.rotation = g.startRotation + (angle - g.startAngle);
      t.x = g.startTx + (midX - g.startMidX);
      t.y = g.startTy + (midY - g.startMidY);
    }
    applyTransform();
  }, [applyTransform]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (!g || !g.active) return;
    if (e.touches.length > 0) {
      if (e.touches.length === 1) {
        g.startX = e.touches[0].clientX;
        g.startY = e.touches[0].clientY;
        g.startTx = mediaTransformRef.current.x;
        g.startTy = mediaTransformRef.current.y;
      }
      return;
    }
    g.active = false;
    const t = mediaTransformRef.current;
    setMediaTransform({ ...t });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const t = mediaTransformRef.current;
    const delta = -e.deltaY * 0.001;
    t.scale = Math.max(0.3, Math.min(5, t.scale * (1 + delta)));
    applyTransform();
    setMediaTransform({ ...t });
  }, [applyTransform]);

  const handleRotate90 = useCallback(() => {
    setMediaTransform((prev) => {
      const next = { ...prev, rotation: prev.rotation + 90 };
      mediaTransformRef.current = next;
      applyTransform();
      return next;
    });
  }, [applyTransform]);

  const handleFlip = useCallback(() => {
    setMediaTransform((prev) => {
      const next = { ...prev, flipX: !prev.flipX };
      mediaTransformRef.current = next;
      applyTransform();
      return next;
    });
  }, [applyTransform]);

  useLayoutEffect(() => {
    applyTransform();
  });

  const renderTextOverlay = (t: TextOverlay) => {
    const isEditing = editingTextId === t.id;

    return (
      <div
        key={t.id}
        className="absolute"
        style={{
          left: `${t.x}%`,
          top: `${t.y}%`,
          transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
          direction: t.direction,
        }}
      >
        {isEditing ? (
          <div className="flex flex-col items-center gap-1.5">
            <div
              ref={editRef}
              contentEditable
              suppressContentEditableWarning
              onBlur={() => commitText(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.currentTarget.blur();
                }
              }}
              className="outline-dashed outline-2 outline-white/70 rounded min-w-[20px]"
              style={{
                color: t.color,
                fontFamily: getFontCss(t.fontFamily),
                fontSize: `${t.fontSize}px`,
                fontWeight: t.fontWeight,
                fontStyle: t.fontStyle,
                textDecoration: t.textDecoration,
                textAlign: t.textAlign,
                backgroundColor: t.backgroundColor || 'transparent',
                padding: t.backgroundColor ? '4px 8px' : '2px 4px',
                borderRadius: t.backgroundColor ? '4px' : '0',
                maxWidth: `${t.frameWidth}px`,
                wordBreak: 'break-word',
                lineHeight: 1.2,
                textShadow: getShadowCss(t.shadow, t.color),
                caretColor: t.color,
              }}
            />
            <div onMouseDown={(e) => e.preventDefault()} className="flex flex-wrap items-center justify-center gap-1.5">
              <span
                className="w-7 h-7 rounded-full bg-white/25 hover:bg-white/40 flex items-center justify-center text-white text-xs transition-colors cursor-grab active:cursor-grabbing select-none touch-none"
                title="Drag to rotate freely"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  isRotating.current = true;
                  if (!previewRef.current) return;
                  const pr = previewRef.current.getBoundingClientRect();
                  const cx = pr.left + (t.x / 100) * pr.width;
                  const cy = pr.top + (t.y / 100) * pr.height;
                  const sa = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
                  rotateDrag.current = { id: t.id, centerX: cx, centerY: cy, startAngle: sa, startRotation: t.rotation };
                }}
                onPointerMove={(e) => {
                  if (!rotateDrag.current || rotateDrag.current.id !== t.id) return;
                  const dx = e.clientX - rotateDrag.current.centerX;
                  const dy = e.clientY - rotateDrag.current.centerY;
                  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                  const delta = angle - rotateDrag.current.startAngle;
                  setTextOverlays((prev) =>
                    prev.map((o) =>
                      o.id === t.id
                        ? { ...o, rotation: Math.round(rotateDrag.current!.startRotation + delta) }
                        : o
                    )
                  );
                }}
                onPointerUp={(e) => {
                  if (!rotateDrag.current || rotateDrag.current.id !== t.id) return;
                  rotateDrag.current = null;
                  isRotating.current = false;
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
              >
                ↻
              </span>
              <span
                className="w-7 h-7 rounded-full bg-white/25 hover:bg-white/40 flex items-center justify-center text-white text-xs transition-colors select-none cursor-pointer"
                title="Decrease font size"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  updateEditing({ fontSize: Math.max(8, t.fontSize - 2) });
                }}
              >
                A−
              </span>
              <span
                className="w-7 h-7 rounded-full bg-white/25 hover:bg-white/40 flex items-center justify-center text-white text-xs transition-colors select-none cursor-pointer"
                title="Increase font size"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  updateEditing({ fontSize: Math.min(120, t.fontSize + 2) });
                }}
              >
                A+
              </span>
            </div>
          </div>
        ) : (
          <div
            className={`select-none ${
              activeTab === 'text'
                ? draggingId === t.id
                  ? 'cursor-grabbing'
                  : 'cursor-grab hover:ring-2 hover:ring-primary/50 rounded'
                : ''
            }`}
            style={{
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
              maxWidth: `${t.frameWidth}px`,
              wordBreak: 'break-word',
              lineHeight: 1.2,
              textShadow: getShadowCss(t.shadow, t.color),
              pointerEvents: activeTab === 'text' ? 'auto' : 'none',
            }}
            onMouseDown={(e) => {
              if (activeTab === 'text' && editingTextId !== t.id) {
                handleDragStart(t.id, e);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (activeTab === 'text' && editingTextId !== t.id) {
                setEditingTextId(t.id);
              }
            }}
          >
            {t.text}
          </div>
        )}
      </div>
    );
  };

  if (step === 'edit' && previewUrl) {
    const isVideo = file?.type.startsWith('video/');
    const isTextMode = activeTab === 'text';

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

          <div className="flex items-center justify-center gap-1.5 px-4 py-2 border-b border-border bg-muted/30">
            <span className="text-xs text-muted-foreground mr-1">Media</span>
            <span
              className="w-7 h-7 rounded-full bg-background hover:bg-accent border border-border flex items-center justify-center text-xs transition-colors cursor-pointer select-none"
              title="Reset transform"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                mediaTransformRef.current = defaultMediaTransform;
                applyTransform();
                setMediaTransform(defaultMediaTransform);
              }}
            >
              ⊘
            </span>
            <span
              className="w-7 h-7 rounded-full bg-background hover:bg-accent border border-border flex items-center justify-center text-xs transition-colors cursor-pointer select-none"
              title="Rotate 90° clockwise"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                handleRotate90();
              }}
            >
              ↻
            </span>
            <span
              className="w-7 h-7 rounded-full bg-background hover:bg-accent border border-border flex items-center justify-center text-xs transition-colors cursor-pointer select-none"
              title="Flip horizontally"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                handleFlip();
              }}
            >
              ⇔
            </span>
          </div>
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div
              className="flex-1 bg-black flex items-center justify-center p-4 min-h-[300px]"
              onClick={isTextMode ? handlePreviewClick : undefined}
              style={{ cursor: isTextMode ? 'text' : 'default' }}
            >
              <div ref={previewRef} className="relative w-full max-w-sm aspect-[9/16] bg-black rounded-lg overflow-hidden touch-none">
                <div
                  ref={mediaWrapperRef}
                  className="w-full h-full flex items-center justify-center"
                  style={{ touchAction: 'none' }}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onWheel={handleWheel}
                >
                  {isVideo ? (
                    <video
                      src={previewUrl}
                      className="w-full h-full object-contain pointer-events-none"
                      style={{ filter: getFilterStyle() }}
                      autoPlay muted loop playsInline
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt=""
                      className="w-full h-full object-contain pointer-events-none"
                      style={{ filter: getFilterStyle() }}
                    />
                  )}
                </div>
                {textOverlays.map(renderTextOverlay)}
                {isTextMode && textOverlays.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-white/50 text-sm">Tap anywhere to add text</p>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-background flex flex-col">
              <div className="flex border-b border-border">
                <button
                  onClick={() => {
                    if (editingTextId) commitText(editingTextId);
                    setActiveTab('filters');
                  }}
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
                  onClick={() => {
                    if (editingTextId) commitText(editingTextId);
                    setActiveTab('music');
                  }}
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
                    {editingOverlay ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Type directly on the story &middot; click away to finish
                        </p>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Font</Label>
                          <Select
                            value={editingOverlay.fontFamily}
                            onValueChange={(v) => updateEditing({ fontFamily: v })}
                          >
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
                          <Label className="text-xs font-medium">Weight</Label>
                          <Select
                            value={String(editingOverlay.fontWeight)}
                            onValueChange={(v) => updateEditing({ fontWeight: Number(v) })}
                          >
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
                            variant={editingOverlay.fontStyle === 'italic' ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              updateEditing({
                                fontStyle: editingOverlay.fontStyle === 'italic' ? 'normal' : 'italic',
                              })
                            }
                          >
                            <Italic className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={editingOverlay.textDecoration === 'underline' ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              updateEditing({
                                textDecoration:
                                  editingOverlay.textDecoration === 'underline' ? 'none' : 'underline',
                              })
                            }
                          >
                            <Underline className="h-4 w-4" />
                          </Button>
                          <div className="flex-1" />
                          <Button
                            variant={editingOverlay.textAlign === 'left' ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => updateEditing({ textAlign: 'left' })}
                          >
                            <AlignLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={editingOverlay.textAlign === 'center' ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => updateEditing({ textAlign: 'center' })}
                          >
                            <AlignCenter className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={editingOverlay.textAlign === 'right' ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => updateEditing({ textAlign: 'right' })}
                          >
                            <AlignRight className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Direction</Label>
                          <div className="flex gap-2">
                            <Button
                              variant={editingOverlay.direction === 'ltr' ? 'default' : 'outline'}
                              size="sm"
                              className="flex-1 text-xs h-8"
                              onClick={() => updateEditing({ direction: 'ltr' })}
                            >
                              LTR
                            </Button>
                            <Button
                              variant={editingOverlay.direction === 'rtl' ? 'default' : 'outline'}
                              size="sm"
                              className="flex-1 text-xs h-8"
                              onClick={() => updateEditing({ direction: 'rtl' })}
                            >
                              RTL
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Color</Label>
                          <div className="flex gap-1 flex-wrap">
                            {TEXT_COLORS.map((color) => (
                              <button
                                key={color}
                                className={`w-6 h-6 rounded border-2 ${
                                  editingOverlay.color === color ? 'border-primary scale-110' : 'border-transparent'
                                }`}
                                style={{ backgroundColor: color }}
                                onClick={() => updateEditing({ color })}
                              />
                            ))}
                            <input
                              type="color"
                              value={editingOverlay.color}
                              onChange={(e) => updateEditing({ color: e.target.value })}
                              className="w-6 h-6 rounded cursor-pointer"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Background</Label>
                          <div className="flex gap-2 items-center">
                            <Button
                              variant={editingOverlay.backgroundColor ? 'outline' : 'default'}
                              size="sm"
                              className="text-xs h-7"
                              onClick={() =>
                                updateEditing({
                                  backgroundColor: editingOverlay.backgroundColor ? undefined : 'rgba(0,0,0,0.5)',
                                })
                              }
                            >
                              {editingOverlay.backgroundColor ? 'Remove' : 'Add Background'}
                            </Button>
                            {editingOverlay.backgroundColor && (
                              <input
                                type="color"
                                value={
                                  editingOverlay.backgroundColor.startsWith('rgba')
                                    ? '#000000'
                                    : editingOverlay.backgroundColor
                                }
                                onChange={(e) => updateEditing({ backgroundColor: e.target.value })}
                                className="w-6 h-6 rounded cursor-pointer"
                              />
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Shading</Label>
                          <div className="flex gap-1">
                            {(['none', 'soft', 'hard', 'outline'] as TextShadow[]).map((s) => (
                              <button
                                key={s}
                                onClick={() => updateEditing({ shadow: s })}
                                className={`flex-1 text-xs py-1.5 rounded capitalize ${
                                  editingOverlay.shadow === s
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary hover:bg-secondary/80'
                                }`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-border">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full"
                            onClick={() => handleRemoveText(editingTextId!)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Remove Text
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Type className="h-8 w-8 text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">Tap anywhere on the story to add text</p>
                        {textOverlays.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Tap existing text to edit its style
                          </p>
                        )}
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
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create Story</h2>
          <div className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-border rounded-lg bg-accent/30">
            <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
            <p className="mb-2 text-sm text-muted-foreground">Image or Video (MAX. 50MB)</p>
            <Button
              variant="default"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Choose File
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*"
            onChange={handleFileSelect}
            disabled={uploading}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateStoryDialog;
