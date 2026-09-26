import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Image, FileText, Link as LinkIcon, Play, ExternalLink, Download, Loader2 } from 'lucide-react';
import { useConversationMedia, SharedMedia, SharedFile, SharedLink } from '@/hooks/useConversationMedia';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface SharedMediaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | undefined;
  initialTab?: 'media' | 'files' | 'links';
}

export const SharedMediaModal: React.FC<SharedMediaModalProps> = ({
  open,
  onOpenChange,
  conversationId,
  initialTab = 'media'
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { media, files, links, loading, fetchMedia, fetchFiles, fetchLinks } = useConversationMedia(conversationId);

  useEffect(() => {
    if (open && conversationId) {
      // Fetch data based on active tab
      if (activeTab === 'media') fetchMedia();
      else if (activeTab === 'files') fetchFiles();
      else if (activeTab === 'links') fetchLinks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId, activeTab]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Shared Content</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'media' | 'files' | 'links')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="media" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Media
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Files
            </TabsTrigger>
            <TabsTrigger value="links" className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Links
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <TabsContent value="media" className="mt-0">
                  <MediaGrid media={media} />
                </TabsContent>

                <TabsContent value="files" className="mt-0">
                  <FilesList files={files} />
                </TabsContent>

                <TabsContent value="links" className="mt-0">
                  <LinksList links={links} />
                </TabsContent>
              </>
            )}
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

const MediaGrid: React.FC<{ media: SharedMedia[] }> = ({ media }) => {
  const [selectedMedia, setSelectedMedia] = useState<SharedMedia | null>(null);

  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Image className="h-12 w-12 mb-2" />
        <p>No media shared yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {media.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedMedia(item)}
            className="relative aspect-square overflow-hidden rounded-lg bg-muted hover:opacity-80 transition-opacity"
          >
            {item.type === 'video' ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Play className="h-8 w-8 text-white" />
                <video 
                  src={item.url} 
                  playsInline
                  preload="auto"
                  className="absolute inset-0 w-full h-full object-cover -z-10"
                />
              </div>
            ) : item.type === 'sticker' ? (
              <img
                src={item.url}
                alt="Sticker"
                className="w-full h-full object-contain p-2 bg-muted"
                loading="lazy"
              />
            ) : (
              <img
                src={item.url}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            )}
          </button>
        ))}
      </div>

      {/* Full view modal */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent className="max-w-4xl p-2">
          {selectedMedia?.type === 'video' ? (
            <video
              src={selectedMedia.url}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="w-full max-h-[80vh] object-contain"
            />
          ) : (
            <img
              src={selectedMedia?.url}
              alt=""
              className="w-full max-h-[80vh] object-contain"
             loading="eager" decoding="async" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const FilesList: React.FC<{ files: SharedFile[] }> = ({ files }) => {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <FileText className="h-12 w-12 mb-2" />
        <p>No files shared yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{file.filename}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(file.created_at), 'MMM d, yyyy')}
            </p>
          </div>
          <Download className="h-4 w-4 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
};

const LinksList: React.FC<{ links: SharedLink[] }> = ({ links }) => {
  if (links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <LinkIcon className="h-12 w-12 mb-2" />
        <p>No links shared yet</p>
      </div>
    );
  }

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <LinkIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate text-primary">{getDomain(link.url)}</p>
            <p className="text-xs text-muted-foreground truncate">{link.url}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(link.created_at), 'MMM d, yyyy')}
            </p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
        </a>
      ))}
    </div>
  );
};
