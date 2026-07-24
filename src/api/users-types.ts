export type { ApiResult } from './client';

export interface AudienceList {
  id: string;
  owner_id: string;
  name: string;
  member_ids: string[];
  created_at: string | null;
  updated_at: string | null;
  [key: string]: unknown;
}

export interface BugReport {
  id: string;
  user_id: string;
  description: string;
  context: string | null;
  screenshot_url: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface CallHistory {
  id: string;
  caller_id: string;
  receiver_id: string;
  call_type: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  [key: string]: unknown;
}

export interface College {
  id: string;
  name: string;
  created_at: string;
  [key: string]: unknown;
}

export interface Company {
  id: string;
  name: string;
  type: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface ContentPreference {
  id: string;
  user_id: string;
  owner_id: string;
  content_type: string;
  preference: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface EditorProject {
  id: string;
  owner_id: string;
  title: string;
  project_json: unknown;
  status: string;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface EncryptionVerification {
  id: string;
  conversation_id: string;
  verified_by: string;
  verified_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ExportRequest {
  id: string;
  user_id: string;
  data_type: string;
  status: string;
  request_url: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface FamilyRelationship {
  id: string;
  user_id: string;
  member_id: string;
  relation_type: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Follower {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface Friend {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Friendship {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface HiddenContent {
  id: string;
  user_id: string;
  content_type: string;
  content_id: string;
  reason: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface HiddenReel {
  id: string;
  reel_id: string;
  reel_owner_id: string;
  hidden_by_id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface HighSchool {
  id: string;
  name: string;
  location: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface LifeEvent {
  id: string;
  user_id: string;
  category: string;
  title: string;
  description: string | null;
  date: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Live {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  viewer_count: number;
  created_at: string;
  [key: string]: unknown;
}

export interface Location {
  id: string;
  provider: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Mention {
  id: string;
  source_type: string;
  source_id: string;
  mentioned_user_id: string;
  created_by: string;
  created_at: string;
  [key: string]: unknown;
}

export interface MutedUser {
  id: string;
  user_id: string;
  muted_user_id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface NotificationDeliverySetting {
  id: string;
  user_id: string;
  channel: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  category: string;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface OtherName {
  id: string;
  user_id: string;
  type: string;
  name: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Poke {
  id: string;
  poking_user_id: string;
  poked_user_id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface PostNotification {
  id: string;
  user_id: string;
  post_id: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface PrivacySetting {
  id: string;
  user_id: string;
  setting_name: string;
  setting_value: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Reaction {
  id: string;
  post_id: string;
  user_id: string;
  type: string;
  created_at: string;
  [key: string]: unknown;
}

export interface ReelPreferenceSignal {
  id: string;
  user_id: string;
  reel_id: string;
  signal_type: string;
  signal_value: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface ReelReport {
  id: string;
  reel_id: string;
  reported_by: string;
  reason: string;
  description: string | null;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ReelsActivity {
  id: string;
  reel_id: string;
  actor_id: string;
  verb: string;
  metadata: unknown;
  created_at: string;
  [key: string]: unknown;
}

export interface ReelsLike {
  id: string;
  reel_id: string;
  user_id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface SavedAd {
  id: string;
  user_id: string;
  title: string;
  ad_url: string | null;
  notes: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface SearchHistory {
  id: string;
  user_id: string;
  query: string;
  created_at: string;
  [key: string]: unknown;
}

export interface StatusVisibility {
  id: string;
  user_id: string;
  target_user_id: string;
  visibility: string;
  created_at: string;
  [key: string]: unknown;
}

export interface StickerPack {
  id: string;
  name: string;
  author: string | null;
  is_premium: boolean;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Sticker {
  id: string;
  name: string;
  file_path: string;
  file_url: string;
  pack_id: string | null;
  is_animated: boolean;
  keywords: string[] | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface TechnicalFeedback {
  id: string;
  reporter_id: string;
  post_id: string;
  post_type: string;
  post_url: string;
  post_owner_id: string;
  status: string;
  description: string | null;
  browser_info: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface UserActivity {
  id: string;
  user_id: string;
  type: string;
  metadata: unknown;
  created_at: string;
  [key: string]: unknown;
}

export interface UserAdInteraction {
  id: string;
  user_id: string;
  advertiser_id: string;
  interaction_type: string;
  created_at: string;
  [key: string]: unknown;
}

export interface UserAdPartnerSetting {
  user_id: string;
  partner_id: string;
  enabled: boolean;
  created_at: string;
  [key: string]: unknown;
}

export interface UserContact {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface UserDeviceKey {
  id: string;
  user_id: string;
  device_name: string;
  last_seen_at: string;
  hex_key: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface UserEncryptionKey {
  id: string;
  user_id: string;
  public_key: string;
  key_fingerprint: string;
  device_info: string;
  created_at: string;
  last_seen_at: string;
  [key: string]: unknown;
}

export interface UserFeedback {
  id: string;
  user_id: string;
  feedback_type: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface UserPreference {
  id: string;
  user_id: string;
  theme: string | null;
  language: string | null;
  notification_sound: boolean;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}
