import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

interface CoverRepositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coverUrl: string | null;
  currentPosition: number;
  onPositionSave: (position: number) => void;
}

const CoverRepositionModal = ({ 
  open, 
  onOpenChange, 
  coverUrl, 
  currentPosition, 
  onPositionSave 
}: CoverRepositionModalProps) => {
  const [position, setPosition] = useState(currentPosition);
  const [maxMovement, setMaxMovement] = useState(0);
  const [boundsReady, setBoundsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate the maximum vertical shift (in px) from center that still
  // keeps the image covering the container under background-size: cover.
  const calculateBounds = useCallback(() => {
    if (!coverUrl || !containerRef.current) {
      setBoundsReady(true);
      return;
    }

    const { clientWidth: containerWidth, clientHeight: containerHeight } = containerRef.current;
    if (containerWidth === 0 || containerHeight === 0) {
      setBoundsReady(true);
      return;
    }

    const img = new Image();
    img.src = coverUrl;
    img.onload = () => {
      // background-size: cover scales to the smallest size that covers both dimensions.
      const scale = Math.max(
        containerWidth / img.naturalWidth,
        containerHeight / img.naturalHeight
      );
      const scaledHeight = img.naturalHeight * scale;
      const overflowY = Math.max(0, scaledHeight - containerHeight);
      // Half the overflow is the max shift from center in either direction.
      setMaxMovement(overflowY / 2);
      setBoundsReady(true);
    };
    img.onerror = () => {
      // If the image can't be probed, fall back to a safe default range so
      // the slider is never stuck disabled.
      setMaxMovement(100);
      setBoundsReady(true);
    };
  }, [coverUrl]);

  // Recalculate bounds whenever the modal opens, the cover URL changes,
  // or the preview container is resized.
  useEffect(() => {
    if (!open || !coverUrl || !containerRef.current) return;

    const container = containerRef.current;
    const observer = new ResizeObserver(() => {
      calculateBounds();
    });
    observer.observe(container);

    calculateBounds();

    // Fallback: if bounds haven't been resolved after 2s, mark ready so
    // the slider uses the default range and is never stuck disabled.
    const timer = setTimeout(() => setBoundsReady(true), 2000);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [open, coverUrl, calculateBounds]);

  // Position 0 = vertically centered. Reset to the saved position when opening.
  useEffect(() => {
    if (open) {
      setPosition(currentPosition);
      setBoundsReady(false);
    }
  }, [open, currentPosition]);

  // Effective range for the slider. Falls back to ±100px when bounds
  // can't be calculated so the slider is always usable.
  const effectiveMax = boundsReady ? Math.max(1, maxMovement) : 100;

  // Clamp to the valid range so the image always covers the container.
  const clampedPosition = Math.max(-effectiveMax, Math.min(effectiveMax, position));

  // Convert a pixel offset from center into a background-position percentage:
  //   -effectiveMax -> 0%   (top-aligned)
  //    0            -> 50%  (centered)
  //   +effectiveMax -> 100% (bottom-aligned)
  const backgroundPositionY = 50 + (clampedPosition / effectiveMax) * 50;

  const previewStyle = coverUrl ? {
    backgroundImage: `url(${coverUrl})`,
    backgroundPosition: `center ${backgroundPositionY}%`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat'
  } : {};

  const handleSave = () => {
    onPositionSave(clampedPosition);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reposition Cover Photo</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div 
              ref={containerRef}
              className="w-full h-48 rounded-lg border overflow-hidden bg-muted"
              style={previewStyle}
            >
              {!coverUrl && (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No cover photo selected
                </div>
              )}
            </div>
          </div>

          {/* Position Control */}
          {coverUrl && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Vertical Position: {Math.round(clampedPosition)}px</Label>
                <Slider
                  value={[clampedPosition]}
                  onValueChange={(value) => {
                    setPosition(Math.max(-effectiveMax, Math.min(effectiveMax, value[0])));
                  }}
                  min={-effectiveMax}
                  max={effectiveMax}
                  step={5}
                  className="w-full"
                />
              </div>

              <div className="text-sm text-muted-foreground">
                Drag the slider to adjust the vertical position of your cover photo.
                Negative values move the image up, positive values move it down.
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button 
              variant="outline" 
              onClick={() => {
                setPosition(currentPosition);
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!coverUrl}
            >
              Save Position
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CoverRepositionModal;
