// EditorPublish - Final step for publishing editor projects
// Complete post configuration with persistence

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  ArrowLeft, Play, Pause, Upload, Loader2, Check, 
  Video, Music, Type, Image, Sparkles, Users, MapPin,
  Bot, Globe, Lock, UserPlus, Bell, Zap,
  ShoppingBag, Calendar as CalendarIcon, MessageSquareOff,
  Eye, EyeOff, Share2, X, ChevronRight, Clock
} from 'lucide-react';
import PageContainer from '@/components/PageContainer';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { EditorProject } from '@/hooks/useEditorProject';
import { PublishSettings, TaggedPerson, PublishLocation, ProductDetails, AudienceType, defaultPublishSettings } from '@/types/editor';
import TagPeopleModal from '@/components/TagPeopleModal';
import { LocationSelector } from '@/components/LocationSelector';
import { LocationData } from '@/hooks/useLocation';
import { format, isBefore, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

type SupabaseErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  status?: unknown;
};

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatPublishError = (err: unknown) => {
  if (err instanceof Error && err.message) return err.message;

  if (err && typeof err === 'object') {
    const e = err as SupabaseErrorLike;
    const message = typeof e.message === 'string' ? e.message : undefined;
    const details = typeof e.details === 'string' ? e.details : undefined;
    const hint = typeof e.hint === 'string' ? e.hint : undefined;
    const code = typeof e.code === 'string' ? e.code : undefined;

    const parts = [code ? `(${code})` : null, message, details, hint].filter(Boolean);
    if (parts.length) return parts.join(' — ');
  }

  return typeof err === 'string' ? err : 'Unknown error';
};

export default function EditorPublish() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { user } = useAuth();

  const [project, setProject] = useState<EditorProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Publish settings state
  const [settings, setSettings] = useState<PublishSettings>(defaultPublishSettings);
  
  // Modal states
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('12:00');
  
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load project and restore settings
  useEffect(() => {
    if (projectId && user) {
      loadProject(projectId);
    } else if (!projectId) {
      toast({ title: 'No project selected', variant: 'destructive' });
      navigate('/editor');
    }
  }, [projectId, user]);

  const loadProject = async (id: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('editor_projects')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      console.log('[EditorPublish] Project loaded:', data.id);
      setProject(data as EditorProject);
      
      // Check if there's an existing draft post
      const projectJson = data.project_json as any;
      const existingDraftId = projectJson?.draftPostId;
      
      if (existingDraftId) {
        // Load draft post data from database
        const { data: draftPost, error: draftError } = await supabase
          .from('posts')
          .select('*')
          .eq('id', existingDraftId)
          .single();
        
        if (!draftError && draftPost) {
          console.log('[EditorPublish] LOADED DRAFT FROM DB:', draftPost);
          
          // Restore settings from draft post
          const loadedSettings: PublishSettings = {
            caption: draftPost.content || '',
            altText: draftPost.alt_text || '',
            aiLabel: draftPost.ai_label ?? false,
            // Prefer DB audience_type; fallback to legacy visibility
            audience: draftPost.audience_type === 'friends' || draftPost.visibility === 'friends' ? 'followers' : 'public',
            commentsEnabled: draftPost.comments_enabled ?? true,
            hideLikeCount: draftPost.hide_like_count ?? false,
            hideShareCount: draftPost.hide_share_count ?? false,
            postToStory: draftPost.post_to_story ?? false,
            boost: draftPost.boost ?? false,
            scheduledAt: draftPost.scheduled_at ? new Date(draftPost.scheduled_at).getTime() : undefined,
            reminderAt: draftPost.reminder_at ? new Date(draftPost.reminder_at).getTime() : undefined,
            taggedPeople: Array.isArray(draftPost.tagged_people) ? (draftPost.tagged_people as unknown as TaggedPerson[]) : [],
            location: draftPost.location_name ? {
              name: draftPost.location_name,
              lat: draftPost.location_lat,
              lng: draftPost.location_lng,
            } : undefined,
            product: draftPost.product_details ? (draftPost.product_details as unknown as ProductDetails) : undefined,
          };
          
          setSettings(loadedSettings);
          console.log('[EditorPublish] Restored settings from draft:', loadedSettings);
          return;
        }
      }
      
      // Fallback: restore from project json publishSettings
      if (projectJson?.publishSettings) {
        setSettings({ ...defaultPublishSettings, ...projectJson.publishSettings });
        console.log('[EditorPublish] Restored settings from project JSON');
      } else {
        setSettings({ ...defaultPublishSettings, caption: data.title || '' });
        console.log('[EditorPublish] Using default settings');
      }
    } catch (err) {
      console.error('[EditorPublish] Failed to load project:', err);
      toast({ title: 'Failed to load project', variant: 'destructive' });
      navigate('/editor');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save settings when they change
  const saveSettings = useCallback(async (newSettings: PublishSettings) => {
    if (!project || !projectId) return;
    
    setIsSaving(true);
    try {
      const projectJson = project.project_json as any;
      const updatedJson = { ...projectJson, publishSettings: newSettings };
      
      const { error } = await supabase
        .from('editor_projects')
        .update({ 
          project_json: updatedJson,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);

      if (error) throw error;
      
      // Update local project state
      setProject(prev => prev ? { ...prev, project_json: updatedJson } : null);
    } catch (err) {
      console.error('[EditorPublish] Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  }, [project, projectId]);

  // Update settings with auto-save
  const updateSettings = useCallback((updates: Partial<PublishSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    saveSettings(newSettings);
  }, [settings, saveSettings]);

  const handleBack = () => {
    navigate(`/editor?projectId=${projectId}`);
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Validation
  const validateForPublish = (): string | null => {
    if (!settings.audience) {
      return 'Please select an audience';
    }
    if (settings.scheduledAt && settings.scheduledAt < Date.now()) {
      return 'Scheduled time cannot be in the past';
    }
    if (settings.boost && settings.audience !== 'public') {
      return 'Boost is only available for public posts';
    }
    return null;
  };

  // Save as draft to posts table
  const handleSaveDraft = async () => {
    if (!project || !user) {
      toast({ title: 'Missing project or user', variant: 'destructive' });
      return;
    }

    setIsSaving(true);

    console.log('[EditorPublish] DRAFT SETTINGS:', settings);

    try {
      // Get video URL from project
      const videoTrack = project.project_json.tracks?.find((t: any) => t.type === 'video');
      const videoClip = videoTrack?.clips?.[0];

      // Map audience to DB audience_type (used by RLS) + legacy visibility
      const audienceTypeMap: Record<AudienceType, string> = {
        public: 'public',
        followers: 'friends',
      };

      // Build draft post data with ALL settings
      const draftData = {
        user_id: user.id,
        type: 'reel' as const,
        content: settings.caption || null,
        media_url: videoClip?.src || null,
        media_type: videoClip ? 'video' : null,
        duration: videoClip?.duration || project.project_json.settings?.duration || 30,
        aspect_ratio: '9:16',
        audience_type: audienceTypeMap[settings.audience],
        visibility: audienceTypeMap[settings.audience],
        status: 'draft',
        scheduled_at: settings.scheduledAt ? new Date(settings.scheduledAt).toISOString() : null,
        // Music data if present
        music_url: getAudioUrl(),
        music_title: getAudioTitle(),
        music_artist: getAudioArtist(),
        // Location
        location_name: settings.location?.name || null,
        location_lat: settings.location?.lat || null,
        location_lng: settings.location?.lng || null,
        // NEW FIELDS - Review & Publish options
        alt_text: settings.altText || null,
        ai_label: settings.aiLabel,
        comments_enabled: settings.commentsEnabled,
        hide_like_count: settings.hideLikeCount,
        hide_share_count: settings.hideShareCount,
        post_to_story: settings.postToStory,
        boost: settings.boost,
        reminder_at: settings.reminderAt ? new Date(settings.reminderAt).toISOString() : null,
        tagged_people: (settings.taggedPeople.length > 0 ? settings.taggedPeople : []) as unknown as any,
        product_details: (settings.product || null) as unknown as any,
      };

      console.log('[EditorPublish] DRAFT SAVE PAYLOAD:', draftData);

      // Check if draft already exists for this project
      const projectJson = project.project_json as any;
      const existingDraftId = projectJson?.draftPostId;

      let result;
      if (existingDraftId) {
        // Update existing draft
        const { data, error } = await supabase
          .from('posts')
          .update(draftData)
          .eq('id', existingDraftId)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
        console.log('[EditorPublish] Draft updated:', result.id);
      } else {
        // Create new draft
        const { data, error } = await supabase
          .from('posts')
          .insert([draftData])
          .select()
          .single();
        
        if (error) throw error;
        result = data;
        
        // Store draft post ID in project
        const updatedJson = { ...projectJson, draftPostId: result.id };
        await supabase
          .from('editor_projects')
          .update({ project_json: updatedJson })
          .eq('id', project.id);
        
        console.log('[EditorPublish] New draft created:', result.id);
      }

      toast({ title: 'Draft saved!' });
      console.log('[EditorPublish] SAVED DRAFT:', result);
    } catch (err) {
      console.error('[EditorPublish] Draft save failed:', err);
      console.error('[EditorPublish] Draft save failed (serialized):', safeStringify(err));

      toast({
        title: 'Failed to save draft',
        description: formatPublishError(err),
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!project || !user) {
      toast({ title: 'Missing project or user', variant: 'destructive' });
      return;
    }

    console.log('[EditorPublish] PUBLISH SETTINGS:', settings);

    // Validate
    const validationError = validateForPublish();
    if (validationError) {
      toast({ title: 'Validation Error', description: validationError, variant: 'destructive' });
      return;
    }

    setIsPublishing(true);

    try {
      // Get video URL from project
      const videoTrack = project.project_json.tracks?.find((t: any) => t.type === 'video');
      const videoClip = videoTrack?.clips?.[0];
      
      if (!videoClip?.src) {
        throw new Error('No video found in project');
      }

      // Map audience to DB audience_type (used by RLS) + legacy visibility
      const audienceTypeMap: Record<AudienceType, string> = {
        public: 'public',
        followers: 'friends',
      };

      // Determine status based on schedule
      const status = settings.scheduledAt ? 'scheduled' : 'published';

      // Create post from project with ALL settings
      const postData = {
        user_id: user.id,
        type: 'reel' as const,
        content: settings.caption || null,
        media_url: videoClip.src,
        media_type: 'video',
        duration: Math.round(videoClip.duration || project.project_json.settings?.duration || 30),
        aspect_ratio: '9:16',
        audience_type: audienceTypeMap[settings.audience],
        visibility: audienceTypeMap[settings.audience],
        status: status,
        scheduled_at: settings.scheduledAt ? new Date(settings.scheduledAt).toISOString() : null,
        // Music data if present
        music_url: getAudioUrl(),
        music_title: getAudioTitle(),
        music_artist: getAudioArtist(),
        // Location
        location_name: settings.location?.name || null,
        location_lat: settings.location?.lat || null,
        location_lng: settings.location?.lng || null,
        // ALL Review & Publish options
        alt_text: settings.altText || null,
        ai_label: settings.aiLabel,
        comments_enabled: settings.commentsEnabled,
        hide_like_count: settings.hideLikeCount,
        hide_share_count: settings.hideShareCount,
        post_to_story: settings.postToStory,
        boost: settings.boost,
        reminder_at: settings.reminderAt ? new Date(settings.reminderAt).toISOString() : null,
        tagged_people: (settings.taggedPeople.length > 0 ? settings.taggedPeople : []) as unknown as any,
        product_details: (settings.product || null) as unknown as any,
      };

      console.log('[EditorPublish] PUBLISH PAYLOAD:', postData);

      // Check if there's an existing draft to update
      const projectJson = project.project_json as any;
      const existingDraftId = projectJson?.draftPostId;

      let postResult;
      if (existingDraftId) {
        // Update existing draft to published
        const { data, error } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', existingDraftId)
          .select()
          .single();
        
        if (error) throw error;
        postResult = data;
        console.log('[EditorPublish] Draft promoted to published:', postResult.id);
      } else {
        // Create new post
        const { data, error } = await supabase
          .from('posts')
          .insert([postData])
          .select()
          .single();

        if (error) throw error;
        postResult = data;
        console.log('[EditorPublish] New post created:', postResult.id);
      }

      console.log('[EditorPublish] PUBLISHED POST:', postResult);

      // Handle story posting if enabled
      if (settings.postToStory && postResult) {
        // Calculate story duration: min(video duration, 15 seconds)
        const videoDuration = videoClip.duration || project.project_json.settings?.duration || 5;
        const storyDuration = Math.min(Math.round(videoDuration), 15);
        
        await supabase.from('stories').insert([
          {
            user_id: user.id,
            media_url: videoClip.src,
            media_type: 'video',
            caption: settings.caption,
            duration: storyDuration,
            privacy: settings.audience === 'followers' ? 'friends' : 'public',
          },
        ]);
        console.log('[EditorPublish] Story created with duration:', storyDuration, 's');
      }

      // Update project status to 'done'
      await supabase
        .from('editor_projects')
        .update({ status: 'done' })
        .eq('id', project.id);

      // Handle boost redirect
      if (settings.boost) {
        toast({ title: 'Published! Redirecting to boost...' });
        navigate('/');
      } else {
        toast({ title: settings.scheduledAt ? 'Post scheduled!' : 'Published successfully!' });
        navigate('/');
      }
    } catch (err) {
      console.error('[EditorPublish] Publish failed:', err);
      console.error('[EditorPublish] Publish failed (serialized):', safeStringify(err));
      console.error('[EditorPublish] Publish settings snapshot:', settings);

      toast({
        title: 'Failed to publish',
        description: formatPublishError(err),
        variant: 'destructive'
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Helper functions
  const getVideoUrl = (): string | null => {
    const videoTrack = project?.project_json.tracks?.find((t: any) => t.type === 'video');
    return videoTrack?.clips?.[0]?.src || null;
  };

  const getAudioUrl = (): string | null => {
    const audioTrack = project?.project_json.tracks?.find((t: any) => t.type === 'audio');
    return audioTrack?.clips?.[0]?.src || null;
  };

  const getAudioTitle = (): string | null => {
    const audioTrack = project?.project_json.tracks?.find((t: any) => t.type === 'audio');
    return audioTrack?.clips?.[0]?.title || null;
  };

  const getAudioArtist = (): string | null => {
    const audioTrack = project?.project_json.tracks?.find((t: any) => t.type === 'audio');
    return audioTrack?.clips?.[0]?.artist || null;
  };

  const getProjectStats = () => {
    const tracks = project?.project_json.tracks || [];
    const videoCount = tracks.find((t: any) => t.type === 'video')?.clips?.length || 0;
    const textCount = tracks.find((t: any) => t.type === 'text')?.clips?.length || 0;
    const emojiCount = tracks.find((t: any) => t.type === 'overlay')?.clips?.length || 0;
    const hasAudio = !!tracks.find((t: any) => t.type === 'audio')?.clips?.length;
    const hasFilter = project?.project_json.tracks?.find((t: any) => t.type === 'video')?.clips?.[0]?.filter;
    
    return { videoCount, textCount, emojiCount, hasAudio, hasFilter };
  };

  // Handle tagged people from modal
  const handleTaggedPeopleChange = (users: any[]) => {
    const taggedPeople: TaggedPerson[] = users.map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      profile_pic: u.profile_pic
    }));
    updateSettings({ taggedPeople });
  };

  // Handle location selection
  const handleLocationSelect = (location: LocationData) => {
    const publishLocation: PublishLocation = {
      id: location.id,
      name: location.name,
      lat: location.lat,
      lng: location.lng
    };
    updateSettings({ location: publishLocation });
  };

  // Handle schedule date selection
  const handleScheduleDate = (date: Date | undefined) => {
    if (date) {
      const [hours, minutes] = scheduleTime.split(':').map(Number);
      date.setHours(hours, minutes, 0, 0);
      updateSettings({ scheduledAt: date.getTime() });
    } else {
      updateSettings({ scheduledAt: undefined });
    }
    setScheduleOpen(false);
  };

  const audienceOptions: { value: AudienceType; label: string; icon: any; description: string }[] = [
    { value: 'public', label: 'Public', icon: Globe, description: 'Anyone can see' },
    { value: 'followers', label: 'Followers', icon: Users, description: 'Your followers' },
  ];

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">Project not found</p>
          <Button onClick={() => navigate('/editor')}>Go to Editor</Button>
        </div>
      </div>
    );
  }

  const stats = getProjectStats();
  const videoUrl = getVideoUrl();
  const validationError = validateForPublish();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 bg-card sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold">Review & Publish</h1>
          {isSaving && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={handleSaveDraft} 
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save Draft
          </Button>
          <Button 
            onClick={handlePublish} 
            disabled={isPublishing || !videoUrl || !!validationError}
            className="gap-2"
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : settings.scheduledAt ? (
              <CalendarIcon className="h-4 w-4" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {settings.scheduledAt ? 'Schedule' : 'Publish'}
          </Button>
        </div>
      </header>

      {/* Validation Warning */}
      {validationError && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-sm text-destructive">
          {validationError}
        </div>
      )}

      {/* Main content */}
      <ScrollArea className="h-[calc(100vh-3.5rem)]">
        <PageContainer size="md" className="grid md:grid-cols-2 gap-6">
          {/* Video Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden max-h-[400px]">
                {videoUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full h-full object-contain"
                      loop
                      playsInline
                      onEnded={() => setIsPlaying(false)}
                    />
                    <button
                      onClick={togglePlayPause}
                      className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="h-12 w-12 text-white" />
                      ) : (
                        <Play className="h-12 w-12 text-white" />
                      )}
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No video preview
                  </div>
                )}
              </div>

              {/* Project stats */}
              <div className="flex flex-wrap gap-2 mt-4">
                {stats.videoCount > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Video className="h-3 w-3" />
                    {stats.videoCount} clip{stats.videoCount > 1 ? 's' : ''}
                  </Badge>
                )}
                {stats.textCount > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Type className="h-3 w-3" />
                    {stats.textCount} text
                  </Badge>
                )}
                {stats.emojiCount > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    {stats.emojiCount} emoji
                  </Badge>
                )}
                {stats.hasAudio && (
                  <Badge variant="outline" className="gap-1">
                    <Music className="h-3 w-3" />
                    Music
                  </Badge>
                )}
                {stats.hasFilter && (
                  <Badge variant="outline" className="gap-1">
                    <Image className="h-3 w-3" />
                    Filter
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Post Settings */}
          <div className="space-y-4">
            {/* Caption */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="caption">Caption</Label>
                  <Textarea
                    id="caption"
                    placeholder="Write a caption..."
                    value={settings.caption}
                    onChange={(e) => updateSettings({ caption: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Alt Text (Optional) */}
                <div className="space-y-2">
                  <Label htmlFor="altText">Alt Text</Label>
                  <Input
                    id="altText"
                    placeholder="Describe your video for accessibility..."
                    value={settings.altText || ''}
                    onChange={(e) => updateSettings({ altText: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Optional: helps with accessibility</p>
                </div>
              </CardContent>
            </Card>

            {/* Audience */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Audience</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {audienceOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateSettings({ audience: opt.value })}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border text-left transition-colors",
                        settings.audience === opt.value 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <div>
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.description}</div>
                      </div>
                      {settings.audience === opt.value && (
                        <Check className="h-4 w-4 text-primary ml-auto" />
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Options */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Tag People */}
                <button
                  onClick={() => setTagModalOpen(true)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Tag People</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.taggedPeople.length > 0 && (
                      <Badge variant="secondary">{settings.taggedPeople.length}</Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>

                {/* Location */}
                <button
                  onClick={() => setLocationModalOpen(true)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Add Location</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.location && (
                      <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                        {settings.location.name}
                      </span>
                    )}
                    {settings.location ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSettings({ location: undefined });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Schedule */}
                <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                  <PopoverTrigger asChild>
                    <button className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Schedule Post</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {settings.scheduledAt && (
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(settings.scheduledAt), 'MMM d, h:mm a')}
                          </span>
                        )}
                        {settings.scheduledAt ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateSettings({ scheduledAt: undefined });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-3 border-b">
                      <Label>Time</Label>
                      <Input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <Calendar
                      mode="single"
                      selected={settings.scheduledAt ? new Date(settings.scheduledAt) : undefined}
                      onSelect={handleScheduleDate}
                      disabled={(date) => isBefore(date, startOfDay(new Date()))}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>

                <Separator />

                {/* AI Label */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm">AI-Generated Content</span>
                      <p className="text-xs text-muted-foreground">Label content as AI-generated</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.aiLabel}
                    onCheckedChange={(checked) => updateSettings({ aiLabel: checked })}
                  />
                </div>

                {/* Post to Story */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm">Post to Story</span>
                      <p className="text-xs text-muted-foreground">Also share as a story</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.postToStory}
                    onCheckedChange={(checked) => updateSettings({ postToStory: checked })}
                  />
                </div>

                {/* Boost */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm">Boost Post</span>
                      <p className="text-xs text-muted-foreground">
                        {settings.audience !== 'public' ? 'Only for public posts' : 'Promote to more people'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.boost}
                    onCheckedChange={(checked) => updateSettings({ boost: checked })}
                    disabled={settings.audience !== 'public'}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Advanced Options */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Advanced</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Turn off commenting */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <MessageSquareOff className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Allow Comments</span>
                  </div>
                  <Switch
                    checked={settings.commentsEnabled}
                    onCheckedChange={(checked) => updateSettings({ commentsEnabled: checked })}
                  />
                </div>

                {/* Hide like count */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    {settings.hideLikeCount ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm">Hide Like Count</span>
                  </div>
                  <Switch
                    checked={settings.hideLikeCount}
                    onCheckedChange={(checked) => updateSettings({ hideLikeCount: checked })}
                  />
                </div>

                {/* Hide share count */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Hide Share Count</span>
                  </div>
                  <Switch
                    checked={settings.hideShareCount}
                    onCheckedChange={(checked) => updateSettings({ hideShareCount: checked })}
                  />
                </div>

                <Separator />

                {/* Product Details */}
                <button
                  onClick={() => setProductModalOpen(true)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Add Product</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.product && (
                      <span className="text-sm text-muted-foreground">
                        {settings.product.name}
                      </span>
                    )}
                    {settings.product ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSettings({ product: undefined });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Reminder */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm">Send Reminder</span>
                      <p className="text-xs text-muted-foreground">Notify followers</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings.reminderAt}
                    onCheckedChange={(checked) => 
                      updateSettings({ reminderAt: checked ? Date.now() + 86400000 : undefined })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Audio Info */}
            {getAudioTitle() && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm">
                    <Music className="h-4 w-4" />
                    <span className="font-medium">{getAudioTitle()}</span>
                  </div>
                  {getAudioArtist() && (
                    <p className="text-xs text-muted-foreground mt-1">{getAudioArtist()}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Meta Info */}
            <div className="text-xs text-muted-foreground px-1">
              <p>Duration: {project.project_json.settings?.duration || 30}s</p>
              <p>Last saved: {new Date(project.updated_at).toLocaleString()}</p>
            </div>
          </div>
        </PageContainer>
      </ScrollArea>

      {/* Modals */}
      <TagPeopleModal
        open={tagModalOpen}
        onOpenChange={setTagModalOpen}
        selectedUsers={settings.taggedPeople.map(p => ({
          id: p.id,
          username: p.username,
          display_name: p.display_name || p.username,
          profile_pic: p.profile_pic || null
        }))}
        onUsersChange={handleTaggedPeopleChange}
      />

      <LocationSelector
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onSelect={handleLocationSelect}
        selectedLocation={settings.location ? {
          name: settings.location.name,
          display_name: settings.location.name,
          address: settings.location.name,
          lat: settings.location.lat || 0,
          lng: settings.location.lng || 0,
          provider: 'saved'
        } : undefined}
      />

      {/* Product Modal */}
      {productModalOpen && (
        <ProductModal
          open={productModalOpen}
          onClose={() => setProductModalOpen(false)}
          product={settings.product}
          onSave={(product) => {
            updateSettings({ product });
            setProductModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Product Modal Component
function ProductModal({ 
  open, 
  onClose, 
  product, 
  onSave 
}: { 
  open: boolean; 
  onClose: () => void; 
  product?: ProductDetails; 
  onSave: (product: ProductDetails) => void;
}) {
  const [name, setName] = useState(product?.name || '');
  const [price, setPrice] = useState(product?.price?.toString() || '');
  const [currency, setCurrency] = useState(product?.currency || 'USD');
  const [url, setUrl] = useState(product?.url || '');

  const handleSave = () => {
    if (!name || !price || !url) {
      toast({ title: 'Please fill all fields', variant: 'destructive' });
      return;
    }
    onSave({
      name,
      price: parseFloat(price),
      currency,
      url
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Add Product</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Product Name</Label>
            <Input
              placeholder="Product name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Price</Label>
              <Input
                type="number"
                placeholder="99.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                placeholder="USD"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Product URL</Label>
            <Input
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save Product</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}