import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Trash2,
  Send,
  Volume2
} from 'lucide-react';
import { useAudioRecorder, AudioRecording } from '@/hooks/useAudioRecorder';
import { cn } from '@/lib/utils';

interface MessageRecorderProps {
  onSendAudio: (recording: AudioRecording) => void;
  onCancel: () => void;
  disabled?: boolean;
}

// Messenger-style voice composer: the moment this component mounts, recording
// starts immediately, and the ONLY controls are:
//
//   🗑️  Delete — stop internally, discard the audio, upload nothing, create no
//                 message, release the mic, and return to the normal composer.
//   ➤  Send   — finalize the MediaRecorder (an internal detail), wait for the
//                 complete Blob, and hand it to onSendAudio for upload + send.
//
// There is deliberately NO Play/preview button, NO Pause button, and NO visible
// Stop button. No 60-second time limit is enforced here either — the hook is
// called with `maxDurationSeconds: 0` so recordings can run longer than a
// minute as long as the backend/storage limits allow.
export const MessageRecorder: React.FC<MessageRecorderProps> = ({
  onSendAudio,
  onCancel,
  disabled = false
}) => {
  // After Send finalizes the clip, we keep the blob in memory: if the send
  // fails (network/gateway), the same clip can be retried with Send or
  // discarded with Delete instead of silently pretending it was sent.
  const [finalized, setFinalized] = useState<AudioRecording | null>(null);
  const [isSending, setIsSending] = useState(false);
  const finalizedRef = useRef<AudioRecording | null>(null);

  const {
    isRecording,
    recordingTime,
    audioLevel,
    startRecording,
    stopRecording,
    cancelRecording,
    formatTime
  } = useAudioRecorder({ maxDurationSeconds: 0 });

  // Recording starts immediately on mount — there is no separate start button.
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const success = await startRecording();
      if (!success && !cancelled) {
        // Mic permission denied / unsupported — surface the hook's toast and
        // fall back to the normal composer.
        onCancel();
      }
    };
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release the finalized object URL on unmount. After a successful send the
  // parent already revoked it (revoking twice is a harmless no-op); after a
  // failed send or unmount this ensures it is never leaked.
  useEffect(() => {
    return () => {
      if (finalizedRef.current) {
        URL.revokeObjectURL(finalizedRef.current.url);
      }
    };
  }, []);

  const handleDelete = () => {
    // Stop recording internally, discard everything: no upload, no message.
    cancelRecording();
    if (finalizedRef.current) {
      URL.revokeObjectURL(finalizedRef.current.url);
      finalizedRef.current = null;
      setFinalized(null);
    }
    onCancel();
  };

  const handleSend = async () => {
    if (isSending || disabled) return;

    let recording = finalized;
    if (!recording) {
      // Finalize the MediaRecorder: stop() triggers the final dataavailable,
      // and stopRecording resolves only after the complete Blob is assembled.
      setIsSending(true);
      try {
        recording = await stopRecording();
      } finally {
        setIsSending(false);
      }

      if (!recording) {
        // stopRecording failed (e.g. audio exceeded the storage size limit) —
        // it already surfaced a toast; go back to the composer.
        onCancel();
        return;
      }

      if (recording.blob.size === 0) {
        // Send was pressed before any audio was captured (the first ~100ms).
        // Don't upload an empty file — start a fresh recording instead.
        URL.revokeObjectURL(recording.url);
        const restarted = await startRecording();
        if (!restarted) onCancel();
        return;
      }

      finalizedRef.current = recording;
      setFinalized(recording);
    }

    // A failed send keeps this recorder mounted so the same clip can be
    // retried or deleted; a successful send unmounts us from the parent.
    onSendAudio(recording);
  };

  const controlsDisabled = disabled || isSending;
  const canSend = isRecording || !!finalized || isSending;
  const durationShown = finalized ? finalized.duration : recordingTime;

  return (
    <Card className="p-3 bg-muted border-2 border-primary/20">
      <div className="flex items-center gap-2">
        {/* Delete: discards the recording without uploading or sending */}
        <Button
          onClick={handleDelete}
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-destructive"
          title="Delete recording"
          disabled={controlsDisabled}
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        {/* Live recording indicator / waveform + duration */}
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 font-mono text-sm shrink-0">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                isRecording ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40"
              )}
            />
            {formatTime(durationShown)}
          </div>

          {/* Live audio level (recording waveform) */}
          <div className="flex items-center gap-1 shrink-0">
            <Volume2 className="h-3 w-3 text-muted-foreground" />
            <div className="flex gap-[2px]">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-0.5 h-3 rounded-full transition-colors",
                    audioLevel * 6 > i ? "bg-green-500" : "bg-muted-foreground/20"
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Send: finalizes the recording and sends it */}
        <Button
          onClick={handleSend}
          disabled={controlsDisabled || !canSend}
          size="sm"
          className="h-9 w-9 p-0 shrink-0"
          title="Send voice message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
};