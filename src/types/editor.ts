// Editor Types for CapCut-style Video Editor

export interface Position {
  x: number;
  y: number;
}

export interface VideoLayer {
  id: string;
  type: 'video';
  src: string;
  fileName: string;
  start: number;
  end: number;
  duration: number;
  volume: number;
  position: Position;
  scale: number;
  rotation: number;
  filter?: VideoFilter;
}

export interface ImageLayer {
  id: string;
  type: 'image';
  src: string;
  fileName: string;
  start: number;
  end: number;
  position: Position;
  scale: number;
  rotation: number;
  filter?: VideoFilter;
}

export interface TextLayer {
  id: string;
  type: 'text';
  content: string;
  start: number;
  end: number;
  position: Position;
  scale: number;
  rotation: number;
  style: TextStyle;
  animation?: TextAnimation;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  fontWeight: number; // 300, 400, 500, 600, 700, 800
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: 'none' | 'underline';
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  outline?: {
    color: string;
    width: number;
  };
}

export interface TextAnimation {
  type: 'none' | 'fade' | 'pop' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'typewriter';
  duration: number;
}

export interface EmojiLayer {
  id: string;
  type: 'emoji' | 'sticker' | 'gif';
  content: string; // emoji character or URL
  start: number;
  end: number;
  position: Position;
  scale: number;
  rotation: number;
}

export interface AudioTrack {
  id: string;
  type: 'audio';
  url: string;
  sourceType: 'youtube' | 'soundcloud' | 'spotify' | 'direct' | 'recorded' | 'library';
  videoId?: string;
  title: string;
  artist?: string;
  thumbnailUrl?: string;
  startAt: number;
  endAt: number;
  duration: number;
  volume: number;
  muted: boolean;
  effects?: AudioEffects;
}

export interface AudioEffects {
  volume: number; // 0-100
  bass: number; // -100 to 100
  treble: number; // -100 to 100
  reverb: number; // 0-100
  pan: number; // -100 (left) to 100 (right)
  speed: number; // 0.5 to 2.0
}

export interface VideoFilter {
  brightness: number; // 0-200, default 100
  contrast: number; // 0-200, default 100
  saturation: number; // 0-200, default 100
  temperature: number; // -100 to 100, default 0 (also accepts 'warmth' for compatibility)
  warmth?: number; // Alias for temperature for backward compatibility
  blur: number; // 0-20, default 0
  hueRotate?: number; // 0-360, default 0
}

export interface EditorSettings {
  duration: number;
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
}

export interface TranscriptSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface Transcript {
  id: string;
  audioTrackId: string;
  segments: TranscriptSegment[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  language?: string;
}

export interface EditorTemplate {
  id: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  duration: number;
  videoLayers?: VideoLayer[];
  imageLayers?: ImageLayer[];
  textLayers?: TextLayer[];
  emojiLayers?: EmojiLayer[];
  audioTrack?: AudioTrack | null;
  globalFilter?: VideoFilter;
  settings?: EditorSettings;
}

export interface AudioLibraryItem {
  id: string;
  url: string;
  title: string;
  artist?: string;
  duration: number;
  thumbnailUrl?: string;
  category?: string;
  waveformData?: number[];
}

/**
 * Audio state for project persistence
 * Stores volume levels (0-1) for video and each audio track
 */
export interface EditorAudioState {
  videoVolume: number; // 0-1
  tracks: Record<string, {
    volume: number; // 0-1
  }>;
}

export interface EditorProjectData {
  videoLayers: VideoLayer[];
  imageLayers: ImageLayer[];
  textLayers: TextLayer[];
  emojiLayers: EmojiLayer[];
  audioTrack: AudioTrack | null;
  globalFilter: VideoFilter;
  settings: EditorSettings;
  transcripts?: Transcript[];
  audio?: EditorAudioState;
  publishSettings?: PublishSettings;
}

export const defaultVideoFilter: VideoFilter = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  temperature: 0,
  blur: 0,
  hueRotate: 0,
};

export const defaultAudioEffects: AudioEffects = {
  volume: 100,
  bass: 0,
  treble: 0,
  reverb: 0,
  pan: 0,
  speed: 1.0,
};

// Helper to normalize filter from either format (must be after defaultVideoFilter)
export function normalizeVideoFilter(filter: any): VideoFilter {
  if (!filter) return defaultVideoFilter;
  
  return {
    brightness: filter.brightness ?? 100,
    contrast: filter.contrast ?? 100,
    saturation: filter.saturation ?? 100,
    temperature: filter.temperature ?? filter.warmth ?? 0,
    blur: filter.blur ?? 0,
    hueRotate: filter.hueRotate ?? 0,
  };
}

export const defaultTextStyle: TextStyle = {
  fontFamily: 'Inter',
  fontSize: 32,
  color: '#ffffff',
  fontWeight: 700,
  fontStyle: 'normal',
  textAlign: 'center',
  textTransform: 'none',
  lineHeight: 1.2,
  letterSpacing: 0,
};

export const defaultEditorSettings: EditorSettings = {
  duration: 30,
  fps: 30,
  resolution: {
    width: 1080,
    height: 1920,
  },
};

export const createDefaultProjectData = (): EditorProjectData => ({
  videoLayers: [],
  imageLayers: [],
  textLayers: [],
  emojiLayers: [],
  audioTrack: null,
  globalFilter: defaultVideoFilter,
  settings: defaultEditorSettings,
  transcripts: [],
  audio: {
    videoVolume: 1,
    tracks: {},
  },
  publishSettings: defaultPublishSettings,
});

// Publish Settings Types
export interface TaggedPerson {
  id: string;
  username: string;
  display_name?: string;
  profile_pic?: string | null;
}

export interface PublishLocation {
  id?: string;
  name: string;
  lat?: number;
  lng?: number;
}

export interface ProductDetails {
  name: string;
  price: number;
  currency: string;
  url: string;
}

export type AudienceType = 'public' | 'friends' | 'only_me';

export interface PublishSettings {
  taggedPeople: TaggedPerson[];
  location?: PublishLocation;
  aiLabel: boolean;
  audience: AudienceType;
  reminderAt?: number;
  boost: boolean;
  product?: ProductDetails;
  scheduledAt?: number;
  commentsEnabled: boolean;
  hideLikeCount: boolean;
  hideShareCount: boolean;
  postToStory: boolean;
  altText?: string;
  caption: string;
}

export const defaultPublishSettings: PublishSettings = {
  taggedPeople: [],
  location: undefined,
  aiLabel: false,
  audience: 'public',
  reminderAt: undefined,
  boost: false,
  product: undefined,
  scheduledAt: undefined,
  commentsEnabled: true,
  hideLikeCount: false,
  hideShareCount: false,
  postToStory: false,
  altText: '',
  caption: '',
};
