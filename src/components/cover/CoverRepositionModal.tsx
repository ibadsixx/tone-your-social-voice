import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  normalizeCoverPosition,
  getCoverBackgroundPosition,
  getCoverMaxMovement,
  pxToPositionPercent,
  positionPercentToPx,
} from '@/lib/coverPosition';

interface CoverRepositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coverUrl: string | null;
  currentPosition: number; // stored cover_position_y (legacy pixels or new 0-100%)
  onPositionSave: (positionPercent: number) => void;
}

const CoverRepositionModal = ({ 
  open, 
  onOpenChange, 
  coverUrl, 
  currentPosition, 
  onPositionSave 
}: CoverRepositionModalProps) => {
  // Normalized position (0-100, 50 = center) read from the stored value.
  const [positionPercent, setPositionPercent] = useState(() =>
    normalizeCoverPosition(currentPosition)
  );
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
      const scale = Math.max(
        containerWidth / img.naturalWidth,
        containerHeight / img.naturalHeight
      );
      const scaledHeight = img.naturalHeight * scale;
      const overflowY = Math.max(0, scaledHeight - containerHeight);
      setMaxMovement(overflowY / 2);
      setBoundsReady(true);
    };
    img.onerror = () => {
      setMaxMovement(100);
      setBoundsReady(true);
    };
  }, [coverUrl]);

  // Recalculate bounds when the modal opens, URL changes, or container resizes.
  useEffect(() => {
    if (!open || !coverUrl || !containerRef.current) return;

    const container = containerRef.current;
    const observer = new ResizeObserver(() => {
      calculateBounds();
    });
    observer.observe(container);

    calculateBounds();

    const timer = setTimeout(() => setBoundsReady(true), 2000);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [open, coverUrl, calculateBounds]);

  // Reset to the stored position when opening.
  useEffect(() => {
    if (open) {
      setPositionPercent(normalizeCoverPosition(currentPosition));
      setBoundsReady(false);
    }
  }, [open, currentPosition]);

  // Effective slider range. Falls back to ±100px so the slider is never stuck.
  const effectiveMax = boundsReady ? Math.max(1, maxMovement) : 100;

  // Current slider pixel position (for the UI), derived from normalized %.
  const positionPx = positionPercentToPx(positionPercent, effectiveMax);

  // Preview uses the normalized percentage directly — container-agnostic.
  const previewStyle = coverUrl ? {
    backgroundImage: `url(${coverUrl})`,
    backgroundPosition: getCoverBackgroundPosition(positionPercent),
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat'
  } : {};

  const handleSave = () => {
    onPositionSave(positionPercent);
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
                <Label>Vertical Position: {Math.round(positionPx)}px</Label>
                <Slider
                  value={[positionPx]}
                  onValueChange={(value) => {
                    const percent = pxToPositionPercent(value[0], effectiveMax);
                    setPositionPercent(percent);
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
                setPositionPercent(normalizeCoverPosition(currentPosition));
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
