import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { ImageIcon, FileText, Play, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface MediaItem {
  postId: string;
  url: string;
  type: 'image' | 'video' | 'file';
  created_at: string;
}

const VIDEO_RE = /\.(mp4|webm|ogg|mov|avi|mkv|m4v)(\?|$)/i;
const IMAGE_RE = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)(\?|$)/i;

function classify(url: string, mediaType?: string | null): 'image' | 'video' | 'file' {
  if (mediaType === 'video' || VIDEO_RE.test(url)) return 'video';
  if (mediaType === 'image' || IMAGE_RE.test(url)) return 'image';
  return 'file';
}

interface Props {
  groupId: string;
}

export default function GroupMediaFiles({ groupId }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MediaItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('group_posts')
        .select('post_id, post:posts(id, media_url, media_type, created_at)')
        .eq('group_id', groupId);

      if (cancelled) return;
      if (error) {
        console.error('GroupMediaFiles fetch error', error);
        setItems([]);
        setLoading(false);
        return;
      }
      const collected: MediaItem[] = [];
      (data || []).forEach((row: any) => {
        const p = row.post;
        if (!p?.media_url) return;
        collected.push({
          postId: p.id,
          url: p.media_url,
          type: classify(p.media_url, p.media_type),
          created_at: p.created_at,
        });
      });
      collected.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      setItems(collected);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [groupId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-muted-foreground">No media or files shared yet</p>
        </CardContent>
      </Card>
    );
  }

  const mediaItems = items.filter(i => i.type !== 'file');
  const fileItems = items.filter(i => i.type === 'file');

  return (
    <div className="space-y-6">
      {mediaItems.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Media</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {mediaItems.map((item) => (
                <button
                  key={`${item.postId}-${item.url}`}
                  onClick={() => setSelected(item)}
                  className="relative aspect-square overflow-hidden rounded-md bg-muted hover:opacity-80 transition-opacity"
                >
                  {item.type === 'video' ? (
                    <>
                      <video src={item.url} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="h-6 w-6 text-white" />
                      </div>
                    </>
                  ) : (
                    <img src={item.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {fileItems.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Files</h3>
            <div className="space-y-2">
              {fileItems.map((file) => {
                const filename = decodeURIComponent(file.url.split('?')[0].split('/').pop() || 'File');
                return (
                  <a
                    key={`${file.postId}-${file.url}`}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{filename}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-4xl p-2">
          {selected?.type === 'video' ? (
            <video src={selected.url} controls autoPlay className="w-full max-h-[80vh] object-contain" />
          ) : (
            <img src={selected?.url} alt="" className="w-full max-h-[80vh] object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}