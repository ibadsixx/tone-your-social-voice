export type { ApiResult } from './client';

export interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  type: string;
  visibility: string;
  status: string;
  shared_post_id: string | null;
  like_count: number;
  likes_count: number;
  comment_count: number;
  comments_count: number;
  share_count: number;
  shares_count: number;
  audience_type: string | null;
  audience_user_ids: string[] | null;
  audience_excluded_user_ids: string[] | null;
  feeling_activity_type: string | null;
  feeling_activity_emoji: string | null;
  feeling_activity_text: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  scheduled_at: string | null;
  duration: number | null;
  aspect_ratio: string | null;
  music_url: string | null;
  music_title: string | null;
  music_artist: string | null;
  music_start: number | null;
  thumbnail: string | null;
  alt_text: string | null;
  ai_label: boolean | null;
  comments_enabled: boolean | null;
  hide_like_count: boolean | null;
  hide_share_count: boolean | null;
  post_to_story: boolean | null;
  boost: boolean | null;
  tagged_people: unknown;
  product_details: unknown;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
  profiles?: { display_name: string; profile_pic: string | null } | null;
  [key: string]: unknown;
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  privacy: string;
  views: number;
  viewed_by: string[];
  caption: string | null;
  is_highlight: boolean | null;
  music_url: string | null;
  music_title: string | null;
  music_start_at: number | null;
  music_duration: number | null;
  duration: number | null;
  created_at: string;
  expires_at: string;
  [key: string]: unknown;
}

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  type: string;
  message: string;
  is_read: boolean;
  post_id: string | null;
  comment_id: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface Conversation {
  id: string;
  type: string;
  created_by: string;
  chat_theme: string | null;
  can_add_members: string | null;
  name: string | null;
  description: string | null;
  page_id: string | null;
  updated_at: string;
  created_at: string;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  encrypted_content: string | null;
  encryption_iv: string | null;
  attachment_url: string | null;
  image_url: string | null;
  media_url: string | null;
  is_image: boolean | null;
  is_gif: boolean | null;
  gif_url: string | null;
  is_sticker: boolean | null;
  sticker_url: string | null;
  sticker_id: string | null;
  audio_url: string | null;
  reply_to_id: string | null;
  message_type: string | null;
  is_system: boolean | null;
  created_at: string;
  sender_profile?: { username: string; display_name: string; profile_pic: string | null } | null;
  [key: string]: unknown;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  admin_id: string | null;
  created_by: string | null;
  privacy: string;
  invite_followers: boolean;
  cover_image: string | null;
  member_count?: number;
  created_at: string;
  [key: string]: unknown;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles?: { username: string; display_name: string; profile_pic: string | null };
  [key: string]: unknown;
}

export interface GroupPost {
  id: string;
  group_id: string;
  post_id: string;
  shared_by: string;
  message: string | null;
  created_at: string;
  post?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GroupFollow {
  id: string;
  group_id: string;
  user_id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface GroupPin {
  id: string;
  group_id: string;
  user_id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface Page {
  id: string;
  name: string;
  admin_id: string;
  description: string | null;
  category: string | null;
  cover_image: string | null;
  profile_pic: string | null;
  archived: boolean;
  created_at: string;
  [key: string]: unknown;
}

export interface Hashtag {
  id: string;
  tag: string;
  follower_count: number;
  created_at: string;
  [key: string]: unknown;
}
