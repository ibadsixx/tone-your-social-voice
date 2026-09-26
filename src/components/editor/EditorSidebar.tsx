// EditorSidebar - Resizable, collapsible sidebar with internal scrolling and layer list
// Designed for professional video editing UX (like CapCut/Premiere)

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  ChevronLeft, ChevronRight, GripVertical,
  Music, Sparkles, Smile, Type, Image,
  FileText, LayoutTemplate, Layers, Eye, EyeOff, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextLayer, EmojiLayer, ImageLayer, AudioTrack, VideoFilter, Transcript, EditorTemplate, VideoLayer } from '@/types/editor';

// Panel imports
import { AudioPanel } from './panels/AudioPanel';
import { FiltersPanel } from './panels/FiltersPanel';
import { StickersPanel } from './panels/StickersPanel';
import { TextPanel } from './panels/TextPanel';
import { MediaPanel } from './panels/MediaPanel';
import { TranscriptPanel } from './transcript/TranscriptPanel';
import { TemplatePicker } from './templates/TemplatePicker';
import { TextLayerEditor } from './text/TextLayerEditor';

interface EditorSidebarProps {
  // State
  isCollapsed: boolean;
  width: number;
  activePanel: string;
  
  // Layers
  textLayers: TextLayer[];
  emojiLayers: EmojiLayer[];
  imageLayers: ImageLayer[];
  videoLayers: VideoLayer[];
  audioTrack: AudioTrack | null;
  
  // Selection
  selectedLayerId: string | null;
  selectedLayerType: string | null;
  
  // Video settings
  duration: number;
  globalFilter: VideoFilter;
  transcript: Transcript | null;
  
  // Callbacks
  onToggleCollapse: () => void;
  onWidthChange: (width: number) => void;
  onPanelChange: (panel: string) => void;
  onLayerSelect: (type: string | null, id: string | null) => void;
  onLayerDelete: (type: string, id: string) => void;
  
  // Add handlers
  onAddText: (text: Omit<TextLayer, 'id' | 'start' | 'end'>) => void;
  onAddEmoji: (emoji: Omit<EmojiLayer, 'id' | 'start' | 'end'>) => void;
  onAddImage: (image: Omit<ImageLayer, 'id' | 'start' | 'end'>) => void;
  onAddVideo: (video: Omit<VideoLayer, 'id'>) => void;
  onAudioChange: (audio: AudioTrack | null) => void;
  onFilterChange: (filter: VideoFilter) => void;
  onTranscriptUpdate: (transcript: Transcript | null) => void;
  onAddTextFromTranscript: (text: Omit<TextLayer, 'id'>) => void;
  onApplyTemplate: (template: EditorTemplate) => void;
  onSeek: (time: number) => void;
  
  // Layer update handlers
  onTextUpdate: (id: string, updates: Partial<TextLayer>) => void;
  onTextDelete: (id: string) => void;
  onTextDuplicate: (layer: TextLayer) => void;
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 320;

export function EditorSidebar({
  isCollapsed,
  width,
  activePanel,
  textLayers,
  emojiLayers,
  imageLayers,
  videoLayers,
  audioTrack,
  selectedLayerId,
  selectedLayerType,
  duration,
  globalFilter,
  transcript,
  onToggleCollapse,
  onWidthChange,
  onPanelChange,
  onLayerSelect,
  onLayerDelete,
  onAddText,
  onAddEmoji,
  onAddImage,
  onAddVideo,
  onAudioChange,
  onFilterChange,
  onTranscriptUpdate,
  onAddTextFromTranscript,
  onApplyTemplate,
  onSeek,
  onTextUpdate,
  onTextDelete,
  onTextDuplicate,
}: EditorSidebarProps) {
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Get selected text layer for editor
  const selectedTextLayer = selectedLayerType === 'text' 
    ? textLayers.find(l => l.id === selectedLayerId) 
    : undefined;

  // Resize logic
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onWidthChange]);

  // Click on layer to select and switch to text panel
  const handleLayerClick = (type: 'text' | 'emoji' | 'image', id: string) => {
    onLayerSelect(type, id);
    if (type === 'text') {
      onPanelChange('text');
    } else if (type === 'emoji') {
      onPanelChange('stickers');
    } else if (type === 'image') {
      onPanelChange('media');
    }
  };

  return (
    <div
      ref={sidebarRef}
      className={cn(
        'relative flex flex-col border-r bg-card transition-all duration-200',
        isCollapsed ? 'w-12' : ''
      )}
      style={{ 
        width: isCollapsed ? 48 : width,
        minWidth: isCollapsed ? 48 : MIN_WIDTH,
        maxWidth: isCollapsed ? 48 : MAX_WIDTH,
      }}
    >
      {/* Collapse toggle button */}
      <div className="flex items-center justify-end p-1 border-b">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Collapsed state - icon buttons only */}
      {isCollapsed && (
        <div className="flex flex-col gap-1 p-1 flex-1">
          <Button
            variant={activePanel === 'media' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { onPanelChange('media'); onToggleCollapse(); }}
            title="Media"
          >
            <Image className="h-4 w-4" />
          </Button>
          <Button
            variant={activePanel === 'stickers' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { onPanelChange('stickers'); onToggleCollapse(); }}
            title="Stickers"
          >
            <Smile className="h-4 w-4" />
          </Button>
          <Button
            variant={activePanel === 'text' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { onPanelChange('text'); onToggleCollapse(); }}
            title="Text"
          >
            <Type className="h-4 w-4" />
          </Button>
          <Button
            variant={activePanel === 'audio' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { onPanelChange('audio'); onToggleCollapse(); }}
            title="Audio"
          >
            <Music className="h-4 w-4" />
          </Button>
          <Button
            variant={activePanel === 'filters' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { onPanelChange('filters'); onToggleCollapse(); }}
            title="Filters"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button
            variant={activePanel === 'layers' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { onPanelChange('layers'); onToggleCollapse(); }}
            title="Layers"
          >
            <Layers className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Expanded state - full panel content */}
      {!isCollapsed && (
        <Tabs value={activePanel} onValueChange={onPanelChange} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-auto flex-wrap shrink-0">
            <TabsTrigger value="media" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-2 py-2">
              <Image className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="stickers" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-2 py-2">
              <Smile className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="text" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-2 py-2">
              <Type className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="audio" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-2 py-2">
              <Music className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="filters" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-2 py-2">
              <Sparkles className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="layers" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-2 py-2">
              <Layers className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="transcript" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-2 py-2">
              <FileText className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="templates" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-2 py-2">
              <LayoutTemplate className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>

          {/* CRITICAL: This is the scrollable content area - each panel scrolls independently */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <TabsContent value="media" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <MediaPanel 
                    onAddVideo={onAddVideo} 
                    onAddImage={onAddImage}
                    videoDuration={duration}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="stickers" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                <StickersPanel onAddEmoji={onAddEmoji} videoDuration={duration} />
              </div>
            </TabsContent>

            <TabsContent value="text" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                <div className="p-4">
                  {selectedTextLayer ? (
                    <TextLayerEditor
                      layer={selectedTextLayer}
                      onUpdate={(updates) => onTextUpdate(selectedTextLayer.id, updates)}
                      onDelete={() => onTextDelete(selectedTextLayer.id)}
                      onDuplicate={() => onTextDuplicate(selectedTextLayer)}
                    />
                  ) : (
                    <TextPanel 
                      onAddText={onAddText}
                      selectedText={undefined}
                      onUpdateText={(id, updates) => onTextUpdate(id, updates)}
                    />
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="audio" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <AudioPanel 
                    audioTrack={audioTrack}
                    onAudioChange={onAudioChange}
                    maxDuration={duration}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="filters" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <FiltersPanel 
                    filter={globalFilter} 
                    onFilterChange={onFilterChange}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* LAYERS PANEL - Critical for re-selecting and editing layers */}
            <TabsContent value="layers" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Layers className="h-4 w-4" />
                    <span>Layers</span>
                  </div>

                  {/* Text Layers */}
                  {textLayers.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Text ({textLayers.length})
                      </div>
                      <div className="space-y-1">
                        {textLayers.map(layer => (
                          <div
                            key={layer.id}
                            className={cn(
                              'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
                              'hover:bg-accent',
                              selectedLayerId === layer.id && selectedLayerType === 'text' && 'bg-accent ring-1 ring-primary'
                            )}
                            onClick={() => handleLayerClick('text', layer.id)}
                          >
                            <Type className="h-4 w-4 shrink-0" />
                            <span className="flex-1 text-sm truncate">
                              {layer.content.slice(0, 20) || 'Empty text'}
                              {layer.content.length > 20 && '...'}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onLayerDelete('text', layer.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Emoji/Sticker Layers */}
                  {emojiLayers.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Stickers ({emojiLayers.length})
                      </div>
                      <div className="space-y-1">
                        {emojiLayers.map(layer => (
                          <div
                            key={layer.id}
                            className={cn(
                              'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
                              'hover:bg-accent',
                              selectedLayerId === layer.id && selectedLayerType === 'emoji' && 'bg-accent ring-1 ring-primary'
                            )}
                            onClick={() => handleLayerClick('emoji', layer.id)}
                          >
                            {layer.content.startsWith('http') || layer.content.startsWith('/') ? (
                              <img src={layer.content} alt="sticker" className="h-4 w-4 shrink-0"  loading="lazy" decoding="async" />
                            ) : (
                              <span className="text-sm shrink-0">{layer.content}</span>
                            )}
                            <span className="flex-1 text-sm truncate">Sticker</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onLayerDelete('emoji', layer.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Image Layers */}
                  {imageLayers.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Images ({imageLayers.length})
                      </div>
                      <div className="space-y-1">
                        {imageLayers.map(layer => (
                          <div
                            key={layer.id}
                            className={cn(
                              'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
                              'hover:bg-accent',
                              selectedLayerId === layer.id && selectedLayerType === 'image' && 'bg-accent ring-1 ring-primary'
                            )}
                            onClick={() => handleLayerClick('image', layer.id)}
                          >
                            <Image className="h-4 w-4 shrink-0" />
                            <span className="flex-1 text-sm truncate">{layer.fileName || 'Image'}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onLayerDelete('image', layer.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {textLayers.length === 0 && emojiLayers.length === 0 && imageLayers.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No layers yet</p>
                      <p className="text-xs mt-1">Add text, stickers, or images to see them here</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="transcript" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                <TranscriptPanel
                  audioUrl={audioTrack?.url}
                  transcript={transcript}
                  onTranscriptUpdate={onTranscriptUpdate}
                  onAddTextLayer={onAddTextFromTranscript}
                  onSeek={onSeek}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="templates" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                <TemplatePicker onApplyTemplate={onApplyTemplate} />
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      )}

      {/* Resize handle - only visible when expanded */}
      {!isCollapsed && (
        <div
          ref={resizeRef}
          className={cn(
            'absolute top-0 right-0 w-1 h-full cursor-col-resize group',
            'hover:bg-primary/50 active:bg-primary transition-colors',
            isResizing && 'bg-primary'
          )}
          onMouseDown={handleResizeStart}
        >
          {/* Visual indicator on hover */}
          <div className="absolute top-1/2 -translate-y-1/2 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-6 w-4 text-muted-foreground" />
          </div>
        </div>
      )}
    </div>
  );
}
