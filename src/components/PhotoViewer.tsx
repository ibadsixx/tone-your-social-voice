import { Dialog, DialogContent } from '@/components/ui/dialog';

interface PhotoViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt: string;
}

const PhotoViewer = ({
  open,
  onOpenChange,
  src,
  alt,
}: PhotoViewerProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 bg-background max-w-full w-full">
        {/* DialogContent already renders a built-in close (X) button at top-right
            and handles Escape key + overlay click to close. */}

        {/* Image viewer — contained so the image is never stretched or cropped.
            Clicking the image itself does not close the viewer (stopPropagation). */}
        <div
          className="flex items-center justify-center min-h-[40vh] bg-black/90 p-6"
          onClick={(e) => {
            // Clicking outside the image (on the dark backdrop inside the
            // viewer) closes the viewer. Clicks on the image are stopped
            // below so they don't propagate to this handler.
            if ((e.target as HTMLElement).tagName === 'IMG') return;
            onOpenChange(false);
          }}
        >
          <div
            className="relative max-w-[90vw] max-h-[80vh] inline-block"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <img
              src={src}
              alt={alt}
              className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoViewer;
