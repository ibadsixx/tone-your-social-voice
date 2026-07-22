import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Play, Pause, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioRecorder, AudioRecording } from '@/hooks/useAudioRecorder';
import { gateway } from '@/lib/gateway';
import { toast } from '@/hooks/use-toast';

interface AudioRecorderProps {
  onRecordingComplete: (audio: {
    id: string;
    url: string;
    duration: number;
    title: string;
  }) => void;
  onClose?: () => void;
}

export function AudioRecorder({ onRecordingComplete, onClose }: AudioRecorderProps) {
  const {
    isRecording,
    isPaused,
    recordingTime,
    audioLevel,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    formatTime,
    maxDuration,
  } = useAudioRecorder();

  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Handle playback preview
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  const handleStartRecording = async () => {
    const started = await startRecording();
    if (started) {
      setRecording(null);
    }
  };

  const handleStopRecording = async () => {
    const result = await stopRecording();
    if (result) {
      setRecording(result);
    }
  };

  const handleConfirmRecording = async () => {
    if (!recording) return;

    setIsUploading(true);
    try {
      // Upload to Supabase storage
      const fileName = `recording_${Date.now()}.webm`;
      const { data: uploadData, error: uploadError } = await gateway.storage
        .from('audio-recordings')
        .upload(fileName, recording.blob, {
          contentType: recording.blob.type,
        });

      if (uploadError) {
        // If bucket doesn't exist, try to create mock response for demo
        console.warn('Upload error (bucket may not exist):', uploadError);
        
        // Use blob URL as fallback for demo purposes
        onRecordingComplete({
          id: `local_${Date.now()}`,
          url: recording.url,
          duration: recording.duration,
          title: `Recording ${new Date().toLocaleTimeString()}`,
        });
        
        toast({
          title: 'Recording added',
          description: 'Using local recording (storage not configured)',
        });
        onClose?.();
        return;
      }

      // Get public URL
      const { data: urlData } = gateway.storage
        .from('audio-recordings')
        .getPublicUrl(uploadData.path);

      onRecordingComplete({
        id: uploadData.path,
        url: urlData.publicUrl,
        duration: recording.duration,
        title: `Recording ${new Date().toLocaleTimeString()}`,
      });

      toast({
        title: 'Recording uploaded',
        description: 'Your recording has been added to the project',
      });
      onClose?.();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload recording. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDiscardRecording = () => {
    if (recording) {
      URL.revokeObjectURL(recording.url);
    }
    setRecording(null);
    setIsPlaying(false);
  };

  const handleCancel = () => {
    if (isRecording) {
      cancelRecording();
    }
    if (recording) {
      URL.revokeObjectURL(recording.url);
    }
    onClose?.();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Mic className="h-4 w-4" />
          Audio Recorder
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Recording visualization */}
      <div className="bg-muted/50 rounded-lg p-6 flex flex-col items-center justify-center min-h-[120px]">
        {isRecording && (
          <div className="flex items-center gap-1 mb-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1 bg-primary rounded-full transition-all duration-75",
                  "animate-pulse"
                )}
                style={{
                  height: `${Math.max(8, audioLevel * 40 * Math.random())}px`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        )}

        {recording && !isRecording && (
          <audio
            ref={audioRef}
            src={recording.url}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
        )}

        <div className="text-3xl font-mono font-bold text-foreground">
          {formatTime(recording?.duration || recordingTime)}
        </div>

        <div className="text-xs text-muted-foreground mt-1">
          {isRecording
            ? isPaused
              ? 'Paused'
              : 'Recording...'
            : recording
            ? 'Recording complete'
            : `Max ${formatTime(maxDuration)}`}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        {!isRecording && !recording && (
          <Button
            size="lg"
            className="rounded-full h-14 w-14 bg-destructive hover:bg-destructive/90"
            onClick={handleStartRecording}
          >
            <Mic className="h-6 w-6" />
          </Button>
        )}

        {isRecording && (
          <>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-10 w-10"
              onClick={isPaused ? resumeRecording : pauseRecording}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button
              size="lg"
              className="rounded-full h-14 w-14"
              onClick={handleStopRecording}
            >
              <Square className="h-6 w-6" />
            </Button>
          </>
        )}

        {recording && !isRecording && (
          <>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-10 w-10"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="rounded-full h-10 w-10"
              onClick={handleDiscardRecording}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              className="rounded-full h-14 w-14"
              onClick={handleConfirmRecording}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Check className="h-6 w-6" />
              )}
            </Button>
          </>
        )}
      </div>

      {/* Progress bar for max duration */}
      {isRecording && (
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-100"
            style={{ width: `${(recordingTime / maxDuration) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
