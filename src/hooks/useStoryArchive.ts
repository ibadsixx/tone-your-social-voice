import { useState } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

export const useStoryArchive = () => {
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const downloadStory = async (storyId: string, mediaUrl: string, fileName?: string) => {
    setDownloading(true);
    try {
      // Fetch the file
      const response = await fetch(mediaUrl);
      if (!response.ok) throw new Error('Failed to fetch story');

      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Set filename with timestamp
      const timestamp = new Date().getTime();
      const extension = mediaUrl.split('.').pop()?.split('?')[0] || 'jpg';
      link.download = fileName || `story-${timestamp}.${extension}`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Story downloaded',
        description: 'Your story has been saved to your device',
      });
    } catch (error: any) {
      console.error('Error downloading story:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to download story',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  const downloadMultipleStories = async (stories: Array<{ id: string; media_url: string }>) => {
    setDownloading(true);
    try {
      for (const story of stories) {
        await downloadStory(story.id, story.media_url);
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      toast({
        title: 'Stories downloaded',
        description: `${stories.length} stories have been saved to your device`,
      });
    } catch (error: any) {
      console.error('Error downloading stories:', error);
      toast({
        title: 'Error',
        description: 'Failed to download some stories',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  return {
    downloading,
    downloadStory,
    downloadMultipleStories,
  };
};
