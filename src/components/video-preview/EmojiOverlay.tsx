import { useState, useRef } from 'react';
import { VideoEditLayer } from '@/types/videoEditing';
import { X } from 'lucide-react';

interface EmojiOverlayProps {
  layers: VideoEditLayer[];
  onLayersChange: (layers: VideoEditLayer[]) => void;
  isEditing: boolean;
}

export function EmojiOverlay({ layers, onLayersChange, isEditing }: EmojiOverlayProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditing) return;
    e.preventDefault();
    setDragging(id);
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    onLayersChange(
      layers.map((layer) =>
        layer.id === dragging
          ? { ...layer, position: { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } }
          : layer
      )
    );
  };

  const handleDragEnd = () => {
    setDragging(null);
  };

  const handleRemove = (id: string) => {
    onLayersChange(layers.filter((l) => l.id !== id));
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ 
        pointerEvents: isEditing ? 'auto' : 'none',
        touchAction: 'none',
      }}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onTouchMove={handleDragMove}
      onTouchEnd={handleDragEnd}
    >
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="absolute cursor-move select-none"
          style={{
            left: `${layer.position.x}%`,
            top: `${layer.position.y}%`,
            transform: `translate(-50%, -50%) scale(${layer.scale}) rotate(${layer.rotation}deg)`,
            pointerEvents: isEditing ? 'auto' : 'none',
            touchAction: 'none',
          }}
          onMouseDown={(e) => handleDragStart(layer.id, e)}
          onTouchStart={(e) => handleDragStart(layer.id, e)}
        >
          {layer.type === 'emoji' && (
            layer.content.startsWith('/emoji/') ? (
              <img 
                src={layer.content} 
                alt="emoji" 
                className="w-12 h-12 object-contain select-none pointer-events-none" 
                draggable={false}
               loading="eager" decoding="async" />
            ) : (
              <span className="text-4xl select-none">{layer.content}</span>
            )
          )}
          {layer.type === 'gif' && (
            <img src={layer.content} alt="GIF" className="w-24 h-24 object-contain"  loading="eager" decoding="async" />
          )}
          {layer.type === 'text' && (
            <span className="text-white text-xl font-bold drop-shadow-lg">{layer.content}</span>
          )}
          {isEditing && (
            <button
              onClick={() => handleRemove(layer.id)}
              className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
