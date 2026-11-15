import { useState } from 'react';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { X } from 'lucide-react';

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
        <DialogClose className="absolute right-4 top-4 z-20 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>

        {/* Image viewer — contained so the image is never stretched or cropped.
            Clicking the image itself does not close the viewer (stopPropagation). */}
        <div
          className="flex items-center justify-center min-h-[40vh] bg-black/90 p-6"
          onClick={(e) => {
            // Clicking outside the image (on the backdrop) closes the viewer.
            // Clicking inside the image container is handled below.
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
