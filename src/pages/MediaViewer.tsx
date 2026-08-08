import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mediaAppUrlToSrc } from '@/lib/mediaUrl';

const isVideoUrl = (url: string) =>
  /\.(mp4|webm|mov|ogg|m4v)$/i.test(url.split('?')[0]);

const MediaViewer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const src = useMemo(() => mediaAppUrlToSrc(id || ''), [id]);
  const isVideo = isVideoUrl(src);

  useEffect(() => {
    document.title = 'Tone — Media';
    const setMeta = (prop: string, content: string) => {
      let el = document.head.querySelector(`meta[property="${prop}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', prop);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    if (src) {
      setMeta('og:image', src);
      setMeta('og:title', 'Tone — Media');
      setMeta('og:type', isVideo ? 'video' : 'image');
    }
    return () => {
      document.title = 'Tone — Connect through mood & emotion';
    };
  }, [src, isVideo]);

  if (!src) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">This media is unavailable.</p>
        <Button variant="outline" onClick={() => navigate('/', { replace: true })}>
          Go home
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        {isVideo ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <img
            src={src}
            alt="Media"
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>
    </div>
  );
};

export default MediaViewer;
