import { useState, useRef, useCallback, useEffect } from 'react';
import { EmojiLayer } from '@/types/editor';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface EmojiLayerCanvasProps {
  layer: EmojiLayer;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<EmojiLayer>) => void;
  onDelete: () => void;
  containerWidth: number;
  containerHeight: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function EmojiLayerCanvas({
  layer,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  containerWidth,
  containerHeight,
  onDragStart,
  onDragEnd,
}: EmojiLayerCanvasProps) {
  const emojiRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });
  const [initialScale, setInitialScale] = useState(1);

  const pixelX = (layer.position.x / 100) * containerWidth;
  const pixelY = (layer.position.y / 100) * containerHeight;

  // Drag handling - select on pointer down, NOT on click
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialPosition({ x: layer.position.x, y: layer.position.y });
    onDragStart?.();
    console.log('[EMOJI] pointer down id=', layer.id);
  }, [layer.position, layer.id, onSelect, onDragStart]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      const newX = initialPosition.x + (deltaX / containerWidth) * 100;
      const newY = initialPosition.y + (deltaY / containerHeight) * 100;

      onUpdate({
        position: {
          x: Math.max(0, Math.min(100, newX)),
          y: Math.max(0, Math.min(100, newY)),
        },
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onDragEnd?.();
      console.log('[EMOJI] drag end id=', layer.id, '(selection kept)');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, initialPosition, containerWidth, containerHeight, onUpdate, layer.id, onDragEnd]);

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialScale(layer.scale);
    onDragStart?.();
    console.log('[EMOJI] resize start id=', layer.id, 'scale=', layer.scale);
  }, [layer.scale, layer.id, onDragStart]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      // Use the larger delta for scaling
      const delta = Math.max(deltaX, deltaY);
      const scaleDelta = delta / 50; // Scale sensitivity
      
      const newScale = Math.max(0.2, Math.min(6, initialScale + scaleDelta));
      
      onUpdate({ scale: newScale });
      console.log('[EMOJI] updated scale=', newScale.toFixed(2));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      onDragEnd?.();
      console.log('[EMOJI] resize end id=', layer.id, 'final scale=', layer.scale, '(selection kept)');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, dragStart, initialScale, onUpdate, layer.id, layer.scale, onDragEnd]);

  // Delete handler
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[EMOJI] removed id=', layer.id);
    onDelete();
  }, [layer.id, onDelete]);

  return (
    <div
      ref={emojiRef}
      className={cn(
        'absolute cursor-move select-none',
        isSelected && 'z-50'
      )}
      style={{
        left: pixelX,
        top: pixelY,
        transform: `translate(-50%, -50%) scale(${layer.scale}) rotate(${layer.rotation || 0}deg)`,
        transformOrigin: 'center center',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Emoji content */}
      <div className="relative">
        {layer.content.startsWith('/') || layer.content.startsWith('http') ? (
          <img 
            src={layer.content} 
            alt="sticker" 
            className="w-16 h-16 object-contain pointer-events-none"
            draggable={false}
           loading="eager" decoding="async" />
        ) : (
          <span className="text-5xl pointer-events-none select-none">{layer.content}</span>
        )}

        {/* Selection box + controls - only when selected */}
        {isSelected && (
          <>
            {/* Selection border */}
            <div className="absolute inset-[-8px] border-2 border-primary rounded-md pointer-events-none" />
            
            {/* Delete button (top-right) */}
            <button
              className="absolute -top-3 -right-3 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors z-10"
              onClick={handleDelete}
              onMouseDown={(e) => e.stopPropagation()}
              title="Delete emoji"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Resize handle (bottom-right corner) */}
            <div
              className="absolute -bottom-2 -right-2 w-5 h-5 bg-primary rounded-full cursor-se-resize shadow-md hover:bg-primary/90 transition-colors z-10 flex items-center justify-center"
              onMouseDown={handleResizeStart}
              title="Resize"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-primary-foreground">
                <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
            </div>

            {/* Corner indicators */}
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-primary rounded-full" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full" />
            <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-primary rounded-full" />
          </>
        )}
      </div>
    </div>
  );
}
