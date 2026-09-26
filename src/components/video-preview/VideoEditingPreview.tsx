import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Play, Pause, Send, Wand2, Loader2 } from 'lucide-react';
import { 
  VideoEdits, 
  VideoEditLayer, 
  VideoUploadData, 
  defaultVideoEdits,
  defaultVideoFilter 
} from '@/types/videoEditing';
import { VideoPreviewPlayer, VideoPreviewPlayerRef } from './VideoPreviewPlayer';
import { FilterControls } from './FilterControls';
import { VolumeControls } from './VolumeControls';
import { EmojiOverlay } from './EmojiOverlay';
import { EmojiPickerSimple } from './EmojiPicker';
import { MusicSelector } from './MusicSelector';

interface VideoEditingPreviewProps {
  uploadData: VideoUploadData;
  onPublish: (edits: VideoEdits) => Promise<void>;
}

export function VideoEditingPreview({ uploadData, onPublish }: VideoEditingPreviewProps) {
  const navigate = useNavigate();
  const videoRef = useRef<VideoPreviewPlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(true); // Auto-play by default
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(uploadData.metadata.duration || 30);
  const [publishing, setPublishing] = useState(false);
  
  const [edits, setEdits] = useState<VideoEdits>({
    ...defaultVideoEdits,
    trim: { startTime: 0, endTime: uploadData.metadata.duration || 30 },
  });

  console.log('[VideoEditingPreview] 🎬 LOADING PREVIEW');
  console.log('[VideoEditingPreview] - Video URL type:', uploadData.dataUrl?.startsWith('data:') ? 'data URL' : 'blob URL');
  console.log('[VideoEditingPreview] - Duration:', uploadData.metadata.duration);

  const handlePlayPause = () => {
    if (isPlaying) {
      videoRef.current?.pause();
    } else {
      videoRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleAddEmoji = (emojiContent: string, emojiUrl?: string) => {
    // Use URL if provided (from local emoji JSON), otherwise use emoji character
    const content = emojiUrl || emojiContent;
    const newLayer: VideoEditLayer = {
      id: `emoji-${Date.now()}`,
      type: 'emoji',
      content,
      position: { x: 50, y: 50 },
      scale: 1,
      rotation: 0,
    };
    setEdits((prev) => ({
      ...prev,
      layers: [...prev.layers, newLayer],
    }));
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await onPublish(edits);
      toast({
        title: 'Published!',
        description: `Your ${uploadData.contentType} has been posted.`,
      });
    } catch (error) {
      toast({
        title: 'Failed to publish',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleOpenAdvancedEditor = () => {
    console.log('[VideoEditingPreview] 🚀 NAVIGATING TO ADVANCED EDITOR');
    
    // Store upload data with edits in sessionStorage
    const dataWithEdits: VideoUploadData = {
      ...uploadData,
      edits,
    };
    sessionStorage.setItem('editor_video_upload', JSON.stringify(dataWithEdits));
    console.log('[VideoEditingPreview] 💾 Data with edits stored in sessionStorage');
    
    navigate(`/editor?project=new&type=${uploadData.contentType}&from=preview`);
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold capitalize">{uploadData.contentType} Preview</h1>
        <div className="w-10" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Video Preview */}
        <div className="flex-1 relative bg-black flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3">
            {/* Video Canvas - no play/pause overlay */}
            <div className="relative w-full max-w-sm aspect-[9/16] bg-black rounded-lg overflow-hidden">
              <VideoPreviewPlayer
                ref={videoRef}
                src={uploadData.dataUrl}
                filter={edits.filter}
                volume={edits.videoVolume}
                isPlaying={isPlaying}
                startTime={edits.trim.startTime}
                endTime={edits.trim.endTime}
                onTimeUpdate={setCurrentTime}
                onLoadedMetadata={(duration) => {
                  setVideoDuration(duration);
                  setEdits((prev) => ({
                    ...prev,
                    trim: { ...prev.trim, endTime: duration },
                  }));
                }}
              />
              {/* Emoji overlay with pointer events enabled for dragging */}
              <EmojiOverlay
                layers={edits.layers}
                onLayersChange={(layers) => setEdits((prev) => ({ ...prev, layers }))}
                isEditing={true}
              />
            </div>
            
            {/* Play/Pause button OUTSIDE the video canvas */}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePlayPause}
              className="gap-2"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Play
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-background">
          <Tabs defaultValue="filters" className="h-full flex flex-col">
            <TabsList className="grid grid-cols-4 mx-2 mt-2">
              <TabsTrigger value="filters" className="text-xs">Filters</TabsTrigger>
              <TabsTrigger value="stickers" className="text-xs">Stickers</TabsTrigger>
              <TabsTrigger value="music" className="text-xs">Music</TabsTrigger>
              <TabsTrigger value="volume" className="text-xs">Volume</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 p-4">
              <TabsContent value="filters" className="mt-0">
                <FilterControls
                  filter={edits.filter}
                  onChange={(filter) => setEdits((prev) => ({ ...prev, filter }))}
                />
              </TabsContent>

              <TabsContent value="stickers" className="mt-0 space-y-4">
                <EmojiPickerSimple onSelect={handleAddEmoji} />
                <p className="text-xs text-muted-foreground">
                  Drag emojis on the video to reposition them.
                </p>
                {edits.layers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Added ({edits.layers.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {edits.layers.map((layer) => (
                        <span key={layer.id} className="text-2xl">
                          {layer.content.startsWith('/emoji/') ? (
                            <img src={layer.content} alt="emoji" className="w-8 h-8 object-contain"  loading="eager" decoding="async" />
                          ) : (
                            layer.content
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="music" className="mt-0">
                <MusicSelector
                  music={edits.music}
                  videoDuration={videoDuration}
                  onMusicChange={(music) => setEdits((prev) => ({ ...prev, music }))}
                />
              </TabsContent>

              <TabsContent value="volume" className="mt-0">
                <VolumeControls
                  videoVolume={edits.videoVolume}
                  musicVolume={edits.music?.volume || 80}
                  hasMusic={!!edits.music}
                  onVideoVolumeChange={(volume) =>
                    setEdits((prev) => ({ ...prev, videoVolume: volume }))
                  }
                  onMusicVolumeChange={(volume) =>
                    setEdits((prev) => ({
                      ...prev,
                      music: prev.music ? { ...prev.music, volume } : null,
                    }))
                  }
                />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center gap-3 p-4 border-t border-border">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={handleOpenAdvancedEditor}
        >
          <Wand2 className="h-4 w-4" />
          Advanced Editor
        </Button>
        <Button
          className="flex-1 gap-2"
          onClick={handlePublish}
          disabled={publishing}
        >
          {publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Post Now
        </Button>
      </div>
    </div>
  );
}
