import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';

export interface SharedMedia {
  id: string;
  url: string;
  type: 'image' | 'video' | 'gif' | 'sticker';
  created_at: string;
  sender_id: string;
}

export interface SharedFile {
  id: string;
  url: string;
  filename: string;
  created_at: string;
  sender_id: string;
}

export interface SharedLink {
  id: string;
  url: string;
  content: string;
  created_at: string;
  sender_id: string;
}

export function useConversationMedia(conversationId: string | undefined) {
  const [media, setMedia] = useState<SharedMedia[]>([]);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMedia = async () => {
    if (!conversationId) {
      return;
    }
    setLoading(true);

    try {
      // Fetch images, videos, gifs, stickers, and attachments from both sender and receiver
      const { data, error } = await gateway
        .from('messages')
        .select('id, image_url, media_url, gif_url, sticker_url, attachment_url, is_image, is_gif, is_sticker, created_at, sender_id')
        .eq('conversation_id', conversationId)
        .or('image_url.neq.null,media_url.neq.null,gif_url.neq.null,sticker_url.neq.null,attachment_url.neq.null')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mediaItems: SharedMedia[] = [];
      
      data?.forEach(msg => {
        if (msg.image_url) {
          mediaItems.push({
            id: msg.id,
            url: msg.image_url,
            type: 'image',
            created_at: msg.created_at,
            sender_id: msg.sender_id
          });
        }
        if (msg.gif_url) {
          mediaItems.push({
            id: msg.id,
            url: msg.gif_url,
            type: 'gif',
            created_at: msg.created_at,
            sender_id: msg.sender_id
          });
        }
        if (msg.media_url) {
          const isVideo = msg.media_url.match(/\.(mp4|webm|ogg|mov)$/i);
          mediaItems.push({
            id: msg.id,
            url: msg.media_url,
            type: isVideo ? 'video' : 'image',
            created_at: msg.created_at,
            sender_id: msg.sender_id
          });
        }
        if (msg.sticker_url) {
          mediaItems.push({
            id: `${msg.id}-sticker`,
            url: msg.sticker_url,
            type: 'sticker',
            created_at: msg.created_at,
            sender_id: msg.sender_id
          });
        }
        // Check attachment_url for images/videos (handle URLs with or without query params)
        if (msg.attachment_url) {
          // Extract filename from URL path, ignoring query params
          const urlPath = msg.attachment_url.split('?')[0];
          const isImage = urlPath.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i);
          const isVideo = urlPath.match(/\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i);
          if (isImage || isVideo) {
            mediaItems.push({
              id: `${msg.id}-attachment`,
              url: msg.attachment_url,
              type: isVideo ? 'video' : 'image',
              created_at: msg.created_at,
              sender_id: msg.sender_id
            });
          }
        }
      });

      setMedia(mediaItems);
    } catch (error) {
      console.error('Error fetching media:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFiles = async () => {
    if (!conversationId) return;
    setLoading(true);

    try {
      const { data, error } = await gateway
        .from('messages')
        .select('id, attachment_url, created_at, sender_id')
        .eq('conversation_id', conversationId)
        .not('attachment_url', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const fileItems: SharedFile[] = (data || []).map(msg => ({
        id: msg.id,
        url: msg.attachment_url!,
        filename: msg.attachment_url!.split('/').pop() || 'File',
        created_at: msg.created_at,
        sender_id: msg.sender_id
      }));

      setFiles(fileItems);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLinks = async () => {
    if (!conversationId) return;
    setLoading(true);

    try {
      // Fetch messages that contain URLs
      const { data, error } = await gateway
        .from('messages')
        .select('id, content, created_at, sender_id')
        .eq('conversation_id', conversationId)
        .not('content', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const linkItems: SharedLink[] = [];

      data?.forEach(msg => {
        if (msg.content) {
          const matches = msg.content.match(urlRegex);
          if (matches) {
            matches.forEach(url => {
              linkItems.push({
                id: `${msg.id}-${url}`,
                url: url,
                content: msg.content || '',
                created_at: msg.created_at,
                sender_id: msg.sender_id
              });
            });
          }
        }
      });

      setLinks(linkItems);
    } catch (error) {
      console.error('Error fetching links:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    media,
    files,
    links,
    loading,
    fetchMedia,
    fetchFiles,
    fetchLinks
  };
}
