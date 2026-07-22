import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FileText, Wand2, Plus, Loader2, Edit2, Check, X, Clock, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TranscriptSegment, Transcript, TextLayer, defaultTextStyle } from '@/types/editor';
import { toast } from '@/hooks/use-toast';
import { gateway } from '@/lib/gateway';

interface TranscriptPanelProps {
  audioUrl?: string;
  transcript: Transcript | null;
  onTranscriptUpdate: (transcript: Transcript) => void;
  onAddTextLayer: (text: Omit<TextLayer, 'id'>) => void;
  onSeek?: (time: number) => void;
}

export function TranscriptPanel({
  audioUrl,
  transcript,
  onTranscriptUpdate,
  onAddTextLayer,
  onSeek,
}: TranscriptPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());

  const handleGenerateTranscript = async () => {
    if (!audioUrl) {
      toast({
        title: 'No audio',
        description: 'Please add an audio track first',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Call transcription edge function
      const { data, error } = await gateway.functions.invoke('transcribe-audio', {
        body: { audioUrl },
      });

      if (error) throw error;

      if (data.status === 'processing') {
        // Start polling for result
        pollTranscriptStatus(data.jobId);
      } else if (data.transcript) {
        onTranscriptUpdate(data.transcript);
        toast({
          title: 'Transcript generated',
          description: 'Your audio has been transcribed',
        });
        setIsGenerating(false);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      
      // For demo purposes, generate a mock transcript
      const mockTranscript: Transcript = {
        id: `transcript_${Date.now()}`,
        audioTrackId: 'audio-1',
        status: 'completed',
        language: 'en',
        segments: [
          { id: '1', text: 'Hello and welcome to this video.', start: 0, end: 3, confidence: 0.95 },
          { id: '2', text: 'Today we will explore something amazing.', start: 3, end: 6, confidence: 0.92 },
          { id: '3', text: 'Stay tuned for more great content.', start: 6, end: 9, confidence: 0.89 },
          { id: '4', text: "Don't forget to like and subscribe!", start: 9, end: 12, confidence: 0.94 },
          { id: '5', text: 'Thanks for watching!', start: 12, end: 14, confidence: 0.97 },
        ],
      };

      onTranscriptUpdate(mockTranscript);
      toast({
        title: 'Demo transcript generated',
        description: 'Using sample transcript for demo',
      });
      setIsGenerating(false);
    }
  };

  const pollTranscriptStatus = async (jobId: string) => {
    const maxAttempts = 30;
    let attempts = 0;

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        setIsGenerating(false);
        toast({
          title: 'Timeout',
          description: 'Transcription is taking too long. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      try {
        const { data, error } = await gateway.functions.invoke('transcribe-audio', {
          body: { jobId },
        });

        if (error) throw error;

        if (data.status === 'completed' && data.transcript) {
          onTranscriptUpdate(data.transcript);
          setIsGenerating(false);
          toast({
            title: 'Transcript ready',
            description: 'Your audio has been transcribed',
          });
        } else if (data.status === 'failed') {
          setIsGenerating(false);
          toast({
            title: 'Transcription failed',
            description: data.error || 'Please try again',
            variant: 'destructive',
          });
        } else {
          // Still processing, poll again
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error('Polling error:', error);
        setTimeout(poll, 2000);
      }
    };

    poll();
  };

  const handleEditSegment = (segment: TranscriptSegment) => {
    setEditingSegmentId(segment.id);
    setEditText(segment.text);
  };

  const handleSaveEdit = (segmentId: string) => {
    if (!transcript) return;

    const updatedSegments = transcript.segments.map((seg) =>
      seg.id === segmentId ? { ...seg, text: editText } : seg
    );

    onTranscriptUpdate({
      ...transcript,
      segments: updatedSegments,
    });

    setEditingSegmentId(null);
    setEditText('');
  };

  const handleCancelEdit = () => {
    setEditingSegmentId(null);
    setEditText('');
  };

  const handleSegmentClick = useCallback((segment: TranscriptSegment, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If shift-clicking, toggle selection
    if (e.shiftKey) {
      const newSelected = new Set(selectedSegments);
      if (newSelected.has(segment.id)) {
        newSelected.delete(segment.id);
      } else {
        newSelected.add(segment.id);
      }
      setSelectedSegments(newSelected);
    } else {
      // Regular click - seek to time
      if (onSeek) {
        onSeek(segment.start);
        toast({
          title: 'Jumped to timestamp',
          description: `${formatTime(segment.start)}`,
        });
      }
    }
  }, [selectedSegments, onSeek]);

  const toggleSegmentSelection = (segmentId: string) => {
    const newSelected = new Set(selectedSegments);
    if (newSelected.has(segmentId)) {
      newSelected.delete(segmentId);
    } else {
      newSelected.add(segmentId);
    }
    setSelectedSegments(newSelected);
  };

  const handleInsertAsTextLayer = () => {
    if (selectedSegments.size === 0 || !transcript) return;

    const selectedSegs = transcript.segments.filter((seg) => selectedSegments.has(seg.id));
    const combinedText = selectedSegs.map((seg) => seg.text).join(' ');
    const startTime = Math.min(...selectedSegs.map((seg) => seg.start));
    const endTime = Math.max(...selectedSegs.map((seg) => seg.end));

    onAddTextLayer({
      type: 'text',
      content: combinedText,
      start: startTime,
      end: endTime,
      position: { x: 50, y: 85 },
      scale: 1,
      rotation: 0,
      style: {
        ...defaultTextStyle,
        fontSize: 20,
        backgroundColor: 'rgba(0,0,0,0.75)',
        color: '#ffffff',
      },
    });

    setSelectedSegments(new Set());
    toast({
      title: 'Caption added',
      description: `Added text layer from ${formatTime(startTime)} to ${formatTime(endTime)}`,
    });
  };

  const handleInsertAllAsCaptions = () => {
    if (!transcript || transcript.segments.length === 0) return;

    // Add each segment as a separate text layer (captions)
    transcript.segments.forEach((segment) => {
      onAddTextLayer({
        type: 'text',
        content: segment.text,
        start: segment.start,
        end: segment.end,
        position: { x: 50, y: 88 },
        scale: 1,
        rotation: 0,
        style: {
          ...defaultTextStyle,
          fontSize: 18,
          backgroundColor: 'rgba(0,0,0,0.75)',
          color: '#ffffff',
        },
      });
    });

    toast({
      title: 'All captions added',
      description: `Added ${transcript.segments.length} caption layers`,
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Transcript
          </h3>
          {transcript && (
            <Badge variant="outline" className="text-xs">
              {transcript.segments.length} segments
            </Badge>
          )}
        </div>

        {/* Action buttons */}
        {transcript && selectedSegments.size > 0 && (
          <Button size="sm" className="w-full h-8" onClick={handleInsertAsTextLayer}>
            <Plus className="h-3 w-3 mr-1" />
            Add {selectedSegments.size} Selected as Caption
          </Button>
        )}

        {transcript && transcript.segments.length > 0 && selectedSegments.size === 0 && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full h-8" 
            onClick={handleInsertAllAsCaptions}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add All as Captions
          </Button>
        )}

        {!transcript && (
          <Button
            onClick={handleGenerateTranscript}
            disabled={isGenerating || !audioUrl}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generate Transcript
              </>
            )}
          </Button>
        )}

        {!audioUrl && !transcript && (
          <p className="text-xs text-muted-foreground text-center">
            Add an audio track to generate a transcript
          </p>
        )}

        {transcript && (
          <p className="text-xs text-muted-foreground">
            Click to jump • Shift+click to select • Edit inline
          </p>
        )}
      </div>

      {/* Transcript segments */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {transcript?.segments.map((segment) => (
            <div
              key={segment.id}
              className={cn(
                'group p-2.5 rounded-lg border transition-colors cursor-pointer',
                selectedSegments.has(segment.id)
                  ? 'bg-primary/10 border-primary'
                  : 'border-transparent hover:bg-muted/50'
              )}
              onClick={(e) => handleSegmentClick(segment, e)}
            >
              <div className="flex items-start gap-2">
                {/* Timestamp */}
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap pt-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek?.(segment.start);
                  }}
                >
                  <PlayCircle className="h-3 w-3" />
                  {formatTime(segment.start)}
                </button>

                {/* Text content */}
                <div className="flex-1">
                  {editingSegmentId === segment.id ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="min-h-[60px] text-sm"
                      />
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6"
                          onClick={handleCancelEdit}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-6"
                          onClick={() => handleSaveEdit(segment.id)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">{segment.text}</p>
                  )}
                </div>

                {/* Selection checkbox & edit button */}
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selectedSegments.has(segment.id)}
                    onChange={() => toggleSegmentSelection(segment.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3.5 w-3.5 rounded border-muted-foreground/50"
                  />
                  {editingSegmentId !== segment.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditSegment(segment);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Confidence bar */}
              {segment.confidence && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        segment.confidence > 0.9 ? 'bg-green-500' :
                        segment.confidence > 0.7 ? 'bg-yellow-500' : 'bg-red-500'
                      )}
                      style={{ width: `${segment.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(segment.confidence * 100)}%
                  </span>
                </div>
              )}
            </div>
          ))}

          {transcript?.status === 'processing' && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Processing...</span>
            </div>
          )}

          {!transcript && !isGenerating && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No transcript yet
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
