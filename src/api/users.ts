import { gateway } from './client';
import type { ApiResult } from './client';
import type {
  AudienceList,
  BugReport,
  CallHistory,
  College,
  Company,
  ContentPreference,
  EditorProject,
  EncryptionVerification,
  ExportRequest,
  FamilyRelationship,
  Follower,
  Follow,
  Friend,
  Friendship,
  HiddenContent,
  HiddenReel,
  HighSchool,
  LifeEvent,
  Live,
  Location,
  Mention,
  MutedUser,
  NotificationDeliverySetting,
  NotificationPreference,
  OtherName,
  Poke,
  PostNotification,
  PrivacySetting,
  Reaction,
  ReelPreferenceSignal,
  ReelReport,
  ReelsActivity,
  ReelsLike,
  SavedAd,
  SearchHistory,
  StatusVisibility,
  StickerPack,
  Sticker,
  TechnicalFeedback,
  UserActivity,
  UserAdInteraction,
  UserAdPartnerSetting,
  UserContact,
  UserDeviceKey,
  UserEncryptionKey,
  UserFeedback,
  UserPreference,
} from './users-types';

// ==================== AUDIENCE LISTS ====================

export async function createAudienceList(data: Partial<AudienceList>): Promise<ApiResult<AudienceList>> {
  return gateway.from('audience_lists').insert([data]).select().single() as Promise<ApiResult<AudienceList>>;
}

export async function getAudienceListById(id: string): Promise<ApiResult<AudienceList>> {
  return gateway.from('audience_lists').select('*').eq('id', id).single() as Promise<ApiResult<AudienceList>>;
}

export async function getAudienceListsByOwner(ownerId: string): Promise<ApiResult<AudienceList[]>> {
  return gateway.from('audience_lists').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }) as Promise<ApiResult<AudienceList[]>>;
}

export async function updateAudienceList(id: string, data: Partial<AudienceList>): Promise<ApiResult<null>> {
  return gateway.from('audience_lists').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteAudienceList(id: string): Promise<ApiResult<null>> {
  return gateway.from('audience_lists').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== BUG REPORTS ====================

export async function createBugReport(data: Partial<BugReport>): Promise<ApiResult<BugReport>> {
  return gateway.from('bug_reports').insert([data]).select().single() as Promise<ApiResult<BugReport>>;
}

export async function getBugReportById(id: string): Promise<ApiResult<BugReport>> {
  return gateway.from('bug_reports').select('*').eq('id', id).single() as Promise<ApiResult<BugReport>>;
}

export async function getBugReportsByUser(userId: string): Promise<ApiResult<BugReport[]>> {
  return gateway.from('bug_reports').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<BugReport[]>>;
}

export async function updateBugReport(id: string, data: Partial<BugReport>): Promise<ApiResult<null>> {
  return gateway.from('bug_reports').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteBugReport(id: string): Promise<ApiResult<null>> {
  return gateway.from('bug_reports').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== CALL HISTORY ====================

export async function createCallHistory(data: Partial<CallHistory>): Promise<ApiResult<CallHistory>> {
  return gateway.from('call_history').insert([data]).select().single() as Promise<ApiResult<CallHistory>>;
}

export async function getCallHistoryById(id: string): Promise<ApiResult<CallHistory>> {
  return gateway.from('call_history').select('*').eq('id', id).single() as Promise<ApiResult<CallHistory>>;
}

export async function getCallHistoryByUser(userId: string): Promise<ApiResult<CallHistory[]>> {
  return gateway.from('call_history').select('*').or(`caller_id=eq.${userId},receiver_id=eq.${userId}`).order('created_at', { ascending: false }) as Promise<ApiResult<CallHistory[]>>;
}

export async function updateCallHistory(id: string, data: Partial<CallHistory>): Promise<ApiResult<null>> {
  return gateway.from('call_history').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteCallHistory(id: string): Promise<ApiResult<null>> {
  return gateway.from('call_history').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== COLLEGES ====================

export async function createCollege(data: Partial<College>): Promise<ApiResult<College>> {
  return gateway.from('colleges').insert([data]).select().single() as Promise<ApiResult<College>>;
}

export async function getCollegeById(id: string): Promise<ApiResult<College>> {
  return gateway.from('colleges').select('*').eq('id', id).single() as Promise<ApiResult<College>>;
}

export async function searchColleges(query: string): Promise<ApiResult<College[]>> {
  return gateway.from('colleges').select('*').ilike('name', `%${query}%`).order('name') as Promise<ApiResult<College[]>>;
}

export async function updateCollege(id: string, data: Partial<College>): Promise<ApiResult<null>> {
  return gateway.from('colleges').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteCollege(id: string): Promise<ApiResult<null>> {
  return gateway.from('colleges').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== COMPANIES ====================

export async function createCompany(data: Partial<Company>): Promise<ApiResult<Company>> {
  return gateway.from('companies').insert([data]).select().single() as Promise<ApiResult<Company>>;
}

export async function getCompanyById(id: string): Promise<ApiResult<Company>> {
  return gateway.from('companies').select('*').eq('id', id).single() as Promise<ApiResult<Company>>;
}

export async function searchCompanies(query: string): Promise<ApiResult<Company[]>> {
  return gateway.from('companies').select('*').ilike('name', `%${query}%`).order('name') as Promise<ApiResult<Company[]>>;
}

export async function updateCompany(id: string, data: Partial<Company>): Promise<ApiResult<null>> {
  return gateway.from('companies').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteCompany(id: string): Promise<ApiResult<null>> {
  return gateway.from('companies').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== CONTENT PREFERENCES ====================

export async function createContentPreference(data: Partial<ContentPreference>): Promise<ApiResult<ContentPreference>> {
  return gateway.from('content_preferences').insert([data]).select().single() as Promise<ApiResult<ContentPreference>>;
}

export async function getContentPreferenceById(id: string): Promise<ApiResult<ContentPreference>> {
  return gateway.from('content_preferences').select('*').eq('id', id).single() as Promise<ApiResult<ContentPreference>>;
}

export async function getContentPreferencesByUser(userId: string): Promise<ApiResult<ContentPreference[]>> {
  return gateway.from('content_preferences').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<ContentPreference[]>>;
}

export async function updateContentPreference(id: string, data: Partial<ContentPreference>): Promise<ApiResult<null>> {
  return gateway.from('content_preferences').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteContentPreference(id: string): Promise<ApiResult<null>> {
  return gateway.from('content_preferences').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== EDITOR PROJECTS ====================

export async function createEditorProject(data: Partial<EditorProject>): Promise<ApiResult<EditorProject>> {
  return gateway.from('editor_projects').insert([data]).select().single() as Promise<ApiResult<EditorProject>>;
}

export async function getEditorProjectById(id: string): Promise<ApiResult<EditorProject>> {
  return gateway.from('editor_projects').select('*').eq('id', id).single() as Promise<ApiResult<EditorProject>>;
}

export async function getEditorProjectsByOwner(ownerId: string): Promise<ApiResult<EditorProject[]>> {
  return gateway.from('editor_projects').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }) as Promise<ApiResult<EditorProject[]>>;
}

export async function updateEditorProject(id: string, data: Partial<EditorProject>): Promise<ApiResult<null>> {
  return gateway.from('editor_projects').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteEditorProject(id: string): Promise<ApiResult<null>> {
  return gateway.from('editor_projects').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== ENCRYPTION VERIFICATIONS ====================

export async function createEncryptionVerification(data: Partial<EncryptionVerification>): Promise<ApiResult<EncryptionVerification>> {
  return gateway.from('encryption_verifications').insert([data]).select().single() as Promise<ApiResult<EncryptionVerification>>;
}

export async function getEncryptionVerificationById(id: string): Promise<ApiResult<EncryptionVerification>> {
  return gateway.from('encryption_verifications').select('*').eq('id', id).single() as Promise<ApiResult<EncryptionVerification>>;
}

export async function getEncryptionVerificationsByConversation(conversationId: string): Promise<ApiResult<EncryptionVerification[]>> {
  return gateway.from('encryption_verifications').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }) as Promise<ApiResult<EncryptionVerification[]>>;
}

export async function updateEncryptionVerification(id: string, data: Partial<EncryptionVerification>): Promise<ApiResult<null>> {
  return gateway.from('encryption_verifications').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteEncryptionVerification(id: string): Promise<ApiResult<null>> {
  return gateway.from('encryption_verifications').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== EXPORT REQUESTS ====================

export async function createExportRequest(data: Partial<ExportRequest>): Promise<ApiResult<ExportRequest>> {
  return gateway.from('export_requests').insert([data]).select().single() as Promise<ApiResult<ExportRequest>>;
}

export async function getExportRequestById(id: string): Promise<ApiResult<ExportRequest>> {
  return gateway.from('export_requests').select('*').eq('id', id).single() as Promise<ApiResult<ExportRequest>>;
}

export async function getExportRequestsByUser(userId: string): Promise<ApiResult<ExportRequest[]>> {
  return gateway.from('export_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<ExportRequest[]>>;
}

export async function updateExportRequest(id: string, data: Partial<ExportRequest>): Promise<ApiResult<null>> {
  return gateway.from('export_requests').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteExportRequest(id: string): Promise<ApiResult<null>> {
  return gateway.from('export_requests').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== FAMILY RELATIONSHIPS ====================

export async function createFamilyRelationship(data: Partial<FamilyRelationship>): Promise<ApiResult<FamilyRelationship>> {
  return gateway.from('family_relationships').insert([data]).select().single() as Promise<ApiResult<FamilyRelationship>>;
}

export async function getFamilyRelationshipById(id: string): Promise<ApiResult<FamilyRelationship>> {
  return gateway.from('family_relationships').select('*').eq('id', id).single() as Promise<ApiResult<FamilyRelationship>>;
}

export async function getFamilyRelationshipsByUser(userId: string): Promise<ApiResult<FamilyRelationship[]>> {
  return gateway.from('family_relationships').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<FamilyRelationship[]>>;
}

export async function updateFamilyRelationship(id: string, data: Partial<FamilyRelationship>): Promise<ApiResult<null>> {
  return gateway.from('family_relationships').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteFamilyRelationship(id: string): Promise<ApiResult<null>> {
  return gateway.from('family_relationships').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== FOLLOWERS ====================

export async function createFollower(data: Partial<Follower>): Promise<ApiResult<Follower>> {
  return gateway.from('followers').insert([data]).select().single() as Promise<ApiResult<Follower>>;
}

export async function getFollowerById(id: string): Promise<ApiResult<Follower>> {
  return gateway.from('followers').select('*').eq('id', id).single() as Promise<ApiResult<Follower>>;
}

export async function getFollowersByUser(userId: string): Promise<ApiResult<Follower[]>> {
  return gateway.from('followers').select('*').eq('following_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Follower[]>>;
}

export async function getFollowingByUser(userId: string): Promise<ApiResult<Follower[]>> {
  return gateway.from('followers').select('*').eq('follower_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Follower[]>>;
}

export async function deleteFollower(id: string): Promise<ApiResult<null>> {
  return gateway.from('followers').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== FOLLOWS ====================

export async function createFollow(data: Partial<Follow>): Promise<ApiResult<Follow>> {
  return gateway.from('follows').insert([data]).select().single() as Promise<ApiResult<Follow>>;
}

export async function getFollowByUsers(followerId: string, followingId: string): Promise<ApiResult<Follow>> {
  return gateway.from('follows').select('*').eq('follower_id', followerId).eq('following_id', followingId).single() as Promise<ApiResult<Follow>>;
}

export async function getFollowsByFollower(followerId: string): Promise<ApiResult<Follow[]>> {
  return gateway.from('follows').select('*').eq('follower_id', followerId).order('created_at', { ascending: false }) as Promise<ApiResult<Follow[]>>;
}

export async function getFollowsByFollowing(followingId: string): Promise<ApiResult<Follow[]>> {
  return gateway.from('follows').select('*').eq('following_id', followingId).order('created_at', { ascending: false }) as Promise<ApiResult<Follow[]>>;
}

export async function deleteFollow(followerId: string, followingId: string): Promise<ApiResult<null>> {
  return gateway.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId) as Promise<ApiResult<null>>;
}

// ==================== FRIENDS ====================

export async function createFriend(data: Partial<Friend>): Promise<ApiResult<Friend>> {
  return gateway.from('friends').insert([data]).select().single() as Promise<ApiResult<Friend>>;
}

export async function getFriendById(id: string): Promise<ApiResult<Friend>> {
  return gateway.from('friends').select('*').eq('id', id).single() as Promise<ApiResult<Friend>>;
}

export async function getFriendsByUser(userId: string): Promise<ApiResult<Friend[]>> {
  return gateway.from('friends').select('*').or(`requester_id=eq.${userId},receiver_id=eq.${userId}`).eq('status', 'accepted').order('created_at', { ascending: false }) as Promise<ApiResult<Friend[]>>;
}

export async function getPendingFriendRequests(userId: string): Promise<ApiResult<Friend[]>> {
  return gateway.from('friends').select('*').eq('receiver_id', userId).eq('status', 'pending').order('created_at', { ascending: false }) as Promise<ApiResult<Friend[]>>;
}

export async function updateFriend(id: string, data: Partial<Friend>): Promise<ApiResult<null>> {
  return gateway.from('friends').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteFriend(id: string): Promise<ApiResult<null>> {
  return gateway.from('friends').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== FRIENDSHIPS ====================

export async function createFriendship(data: Partial<Friendship>): Promise<ApiResult<Friendship>> {
  return gateway.from('friendships').insert([data]).select().single() as Promise<ApiResult<Friendship>>;
}

export async function getFriendshipById(id: string): Promise<ApiResult<Friendship>> {
  return gateway.from('friendships').select('*').eq('id', id).single() as Promise<ApiResult<Friendship>>;
}

export async function getFriendshipsByUser(userId: string): Promise<ApiResult<Friendship[]>> {
  return gateway.from('friendships').select('*').or(`sender_id=eq.${userId},receiver_id=eq.${userId}`).order('created_at', { ascending: false }) as Promise<ApiResult<Friendship[]>>;
}

export async function updateFriendship(id: string, data: Partial<Friendship>): Promise<ApiResult<null>> {
  return gateway.from('friendships').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteFriendship(id: string): Promise<ApiResult<null>> {
  return gateway.from('friendships').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== HIDDEN CONTENT ====================

export async function createHiddenContent(data: Partial<HiddenContent>): Promise<ApiResult<HiddenContent>> {
  return gateway.from('hidden_content').insert([data]).select().single() as Promise<ApiResult<HiddenContent>>;
}

export async function getHiddenContentById(id: string): Promise<ApiResult<HiddenContent>> {
  return gateway.from('hidden_content').select('*').eq('id', id).single() as Promise<ApiResult<HiddenContent>>;
}

export async function getHiddenContentByUser(userId: string): Promise<ApiResult<HiddenContent[]>> {
  return gateway.from('hidden_content').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<HiddenContent[]>>;
}

export async function deleteHiddenContent(id: string): Promise<ApiResult<null>> {
  return gateway.from('hidden_content').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== HIDDEN REELS ====================

export async function createHiddenReel(data: Partial<HiddenReel>): Promise<ApiResult<HiddenReel>> {
  return gateway.from('hidden_reels').insert([data]).select().single() as Promise<ApiResult<HiddenReel>>;
}

export async function getHiddenReelById(id: string): Promise<ApiResult<HiddenReel>> {
  return gateway.from('hidden_reels').select('*').eq('id', id).single() as Promise<ApiResult<HiddenReel>>;
}

export async function getHiddenReelsByUser(userId: string): Promise<ApiResult<HiddenReel[]>> {
  return gateway.from('hidden_reels').select('*').eq('hidden_by_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<HiddenReel[]>>;
}

export async function deleteHiddenReel(id: string): Promise<ApiResult<null>> {
  return gateway.from('hidden_reels').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== HIGH SCHOOLS ====================

export async function createHighSchool(data: Partial<HighSchool>): Promise<ApiResult<HighSchool>> {
  return gateway.from('high_schools').insert([data]).select().single() as Promise<ApiResult<HighSchool>>;
}

export async function getHighSchoolById(id: string): Promise<ApiResult<HighSchool>> {
  return gateway.from('high_schools').select('*').eq('id', id).single() as Promise<ApiResult<HighSchool>>;
}

export async function searchHighSchools(query: string): Promise<ApiResult<HighSchool[]>> {
  return gateway.from('high_schools').select('*').ilike('name', `%${query}%`).order('name') as Promise<ApiResult<HighSchool[]>>;
}

export async function updateHighSchool(id: string, data: Partial<HighSchool>): Promise<ApiResult<null>> {
  return gateway.from('high_schools').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteHighSchool(id: string): Promise<ApiResult<null>> {
  return gateway.from('high_schools').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== LIFE EVENTS ====================

export async function createLifeEvent(data: Partial<LifeEvent>): Promise<ApiResult<LifeEvent>> {
  return gateway.from('life_events').insert([data]).select().single() as Promise<ApiResult<LifeEvent>>;
}

export async function getLifeEventById(id: string): Promise<ApiResult<LifeEvent>> {
  return gateway.from('life_events').select('*').eq('id', id).single() as Promise<ApiResult<LifeEvent>>;
}

export async function getLifeEventsByUser(userId: string): Promise<ApiResult<LifeEvent[]>> {
  return gateway.from('life_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<LifeEvent[]>>;
}

export async function updateLifeEvent(id: string, data: Partial<LifeEvent>): Promise<ApiResult<null>> {
  return gateway.from('life_events').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteLifeEvent(id: string): Promise<ApiResult<null>> {
  return gateway.from('life_events').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== LIVES ====================

export async function createLive(data: Partial<Live>): Promise<ApiResult<Live>> {
  return gateway.from('lives').insert([data]).select().single() as Promise<ApiResult<Live>>;
}

export async function getLiveById(id: string): Promise<ApiResult<Live>> {
  return gateway.from('lives').select('*').eq('id', id).single() as Promise<ApiResult<Live>>;
}

export async function getActiveLives(): Promise<ApiResult<Live[]>> {
  return gateway.from('lives').select('*').is('ended_at', null).order('started_at', { ascending: false }) as Promise<ApiResult<Live[]>>;
}

export async function getLivesByUser(userId: string): Promise<ApiResult<Live[]>> {
  return gateway.from('lives').select('*').eq('user_id', userId).order('started_at', { ascending: false }) as Promise<ApiResult<Live[]>>;
}

export async function updateLive(id: string, data: Partial<Live>): Promise<ApiResult<null>> {
  return gateway.from('lives').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteLive(id: string): Promise<ApiResult<null>> {
  return gateway.from('lives').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== LOCATIONS ====================

export async function createLocation(data: Partial<Location>): Promise<ApiResult<Location>> {
  return gateway.from('locations').insert([data]).select().single() as Promise<ApiResult<Location>>;
}

export async function getLocationById(id: string): Promise<ApiResult<Location>> {
  return gateway.from('locations').select('*').eq('id', id).single() as Promise<ApiResult<Location>>;
}

export async function searchLocations(query: string): Promise<ApiResult<Location[]>> {
  return gateway.from('locations').select('*').ilike('name', `%${query}%`).order('name') as Promise<ApiResult<Location[]>>;
}

export async function updateLocation(id: string, data: Partial<Location>): Promise<ApiResult<null>> {
  return gateway.from('locations').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteLocation(id: string): Promise<ApiResult<null>> {
  return gateway.from('locations').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== MENTIONS ====================

export async function createMention(data: Partial<Mention>): Promise<ApiResult<Mention>> {
  return gateway.from('mentions').insert([data]).select().single() as Promise<ApiResult<Mention>>;
}

export async function getMentionById(id: string): Promise<ApiResult<Mention>> {
  return gateway.from('mentions').select('*').eq('id', id).single() as Promise<ApiResult<Mention>>;
}

export async function getMentionsByUser(userId: string): Promise<ApiResult<Mention[]>> {
  return gateway.from('mentions').select('*').eq('mentioned_user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Mention[]>>;
}

export async function getMentionsBySource(sourceType: string, sourceId: string): Promise<ApiResult<Mention[]>> {
  return gateway.from('mentions').select('*').eq('source_type', sourceType).eq('source_id', sourceId).order('created_at', { ascending: false }) as Promise<ApiResult<Mention[]>>;
}

export async function deleteMention(id: string): Promise<ApiResult<null>> {
  return gateway.from('mentions').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== MUTED USERS ====================

export async function createMutedUser(data: Partial<MutedUser>): Promise<ApiResult<MutedUser>> {
  return gateway.from('muted_users').insert([data]).select().single() as Promise<ApiResult<MutedUser>>;
}

export async function getMutedUserById(id: string): Promise<ApiResult<MutedUser>> {
  return gateway.from('muted_users').select('*').eq('id', id).single() as Promise<ApiResult<MutedUser>>;
}

export async function getMutedUsersByUser(userId: string): Promise<ApiResult<MutedUser[]>> {
  return gateway.from('muted_users').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<MutedUser[]>>;
}

export async function isMuted(userId: string, mutedUserId: string): Promise<ApiResult<MutedUser>> {
  return gateway.from('muted_users').select('*').eq('user_id', userId).eq('muted_user_id', mutedUserId).single() as Promise<ApiResult<MutedUser>>;
}

export async function deleteMutedUser(id: string): Promise<ApiResult<null>> {
  return gateway.from('muted_users').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== NOTIFICATION DELIVERY SETTINGS ====================

export async function createNotificationDeliverySetting(data: Partial<NotificationDeliverySetting>): Promise<ApiResult<NotificationDeliverySetting>> {
  return gateway.from('notification_delivery_settings').insert([data]).select().single() as Promise<ApiResult<NotificationDeliverySetting>>;
}

export async function getNotificationDeliverySettingById(id: string): Promise<ApiResult<NotificationDeliverySetting>> {
  return gateway.from('notification_delivery_settings').select('*').eq('id', id).single() as Promise<ApiResult<NotificationDeliverySetting>>;
}

export async function getNotificationDeliverySettingsByUser(userId: string): Promise<ApiResult<NotificationDeliverySetting[]>> {
  return gateway.from('notification_delivery_settings').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<NotificationDeliverySetting[]>>;
}

export async function updateNotificationDeliverySetting(id: string, data: Partial<NotificationDeliverySetting>): Promise<ApiResult<null>> {
  return gateway.from('notification_delivery_settings').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteNotificationDeliverySetting(id: string): Promise<ApiResult<null>> {
  return gateway.from('notification_delivery_settings').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== NOTIFICATION PREFERENCES ====================

export async function createNotificationPreference(data: Partial<NotificationPreference>): Promise<ApiResult<NotificationPreference>> {
  return gateway.from('notification_preferences').insert([data]).select().single() as Promise<ApiResult<NotificationPreference>>;
}

export async function getNotificationPreferenceById(id: string): Promise<ApiResult<NotificationPreference>> {
  return gateway.from('notification_preferences').select('*').eq('id', id).single() as Promise<ApiResult<NotificationPreference>>;
}

export async function getNotificationPreferencesByUser(userId: string): Promise<ApiResult<NotificationPreference[]>> {
  return gateway.from('notification_preferences').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<NotificationPreference[]>>;
}

export async function updateNotificationPreference(id: string, data: Partial<NotificationPreference>): Promise<ApiResult<null>> {
  return gateway.from('notification_preferences').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteNotificationPreference(id: string): Promise<ApiResult<null>> {
  return gateway.from('notification_preferences').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== OTHER NAMES ====================

export async function createOtherName(data: Partial<OtherName>): Promise<ApiResult<OtherName>> {
  return gateway.from('other_names').insert([data]).select().single() as Promise<ApiResult<OtherName>>;
}

export async function getOtherNameById(id: string): Promise<ApiResult<OtherName>> {
  return gateway.from('other_names').select('*').eq('id', id).single() as Promise<ApiResult<OtherName>>;
}

export async function getOtherNamesByUser(userId: string): Promise<ApiResult<OtherName[]>> {
  return gateway.from('other_names').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<OtherName[]>>;
}

export async function updateOtherName(id: string, data: Partial<OtherName>): Promise<ApiResult<null>> {
  return gateway.from('other_names').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteOtherName(id: string): Promise<ApiResult<null>> {
  return gateway.from('other_names').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== POKES ====================

export async function createPoke(data: Partial<Poke>): Promise<ApiResult<Poke>> {
  return gateway.from('pokes').insert([data]).select().single() as Promise<ApiResult<Poke>>;
}

export async function getPokeById(id: string): Promise<ApiResult<Poke>> {
  return gateway.from('pokes').select('*').eq('id', id).single() as Promise<ApiResult<Poke>>;
}

export async function getPokesByUser(userId: string): Promise<ApiResult<Poke[]>> {
  return gateway.from('pokes').select('*').or(`poking_user_id=eq.${userId},poked_user_id=eq.${userId}`).order('created_at', { ascending: false }) as Promise<ApiResult<Poke[]>>;
}

export async function getPokesReceived(userId: string): Promise<ApiResult<Poke[]>> {
  return gateway.from('pokes').select('*').eq('poked_user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Poke[]>>;
}

export async function deletePoke(id: string): Promise<ApiResult<null>> {
  return gateway.from('pokes').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== POST NOTIFICATIONS ====================

export async function createPostNotification(data: Partial<PostNotification>): Promise<ApiResult<PostNotification>> {
  return gateway.from('post_notifications').insert([data]).select().single() as Promise<ApiResult<PostNotification>>;
}

export async function getPostNotificationById(id: string): Promise<ApiResult<PostNotification>> {
  return gateway.from('post_notifications').select('*').eq('id', id).single() as Promise<ApiResult<PostNotification>>;
}

export async function getPostNotificationsByUser(userId: string): Promise<ApiResult<PostNotification[]>> {
  return gateway.from('post_notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<PostNotification[]>>;
}

export async function getPostNotificationByPost(userId: string, postId: string): Promise<ApiResult<PostNotification>> {
  return gateway.from('post_notifications').select('*').eq('user_id', userId).eq('post_id', postId).single() as Promise<ApiResult<PostNotification>>;
}

export async function updatePostNotification(id: string, data: Partial<PostNotification>): Promise<ApiResult<null>> {
  return gateway.from('post_notifications').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deletePostNotification(id: string): Promise<ApiResult<null>> {
  return gateway.from('post_notifications').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== PRIVACY SETTINGS ====================

export async function createPrivacySetting(data: Partial<PrivacySetting>): Promise<ApiResult<PrivacySetting>> {
  return gateway.from('privacy_settings').insert([data]).select().single() as Promise<ApiResult<PrivacySetting>>;
}

export async function getPrivacySettingById(id: string): Promise<ApiResult<PrivacySetting>> {
  return gateway.from('privacy_settings').select('*').eq('id', id).single() as Promise<ApiResult<PrivacySetting>>;
}

export async function getPrivacySettingsByUser(userId: string): Promise<ApiResult<PrivacySetting[]>> {
  return gateway.from('privacy_settings').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<PrivacySetting[]>>;
}

export async function getPrivacySettingByName(userId: string, settingName: string): Promise<ApiResult<PrivacySetting>> {
  return gateway.from('privacy_settings').select('*').eq('user_id', userId).eq('setting_name', settingName).single() as Promise<ApiResult<PrivacySetting>>;
}

export async function updatePrivacySetting(id: string, data: Partial<PrivacySetting>): Promise<ApiResult<null>> {
  return gateway.from('privacy_settings').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deletePrivacySetting(id: string): Promise<ApiResult<null>> {
  return gateway.from('privacy_settings').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== REACTIONS ====================

export async function createReaction(data: Partial<Reaction>): Promise<ApiResult<Reaction>> {
  return gateway.from('reactions').insert([data]).select().single() as Promise<ApiResult<Reaction>>;
}

export async function getReactionById(id: string): Promise<ApiResult<Reaction>> {
  return gateway.from('reactions').select('*').eq('id', id).single() as Promise<ApiResult<Reaction>>;
}

export async function getReactionsByPost(postId: string): Promise<ApiResult<Reaction[]>> {
  return gateway.from('reactions').select('*').eq('post_id', postId).order('created_at', { ascending: false }) as Promise<ApiResult<Reaction[]>>;
}

export async function getReactionsByUser(userId: string): Promise<ApiResult<Reaction[]>> {
  return gateway.from('reactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Reaction[]>>;
}

export async function getReactionByUserAndPost(userId: string, postId: string): Promise<ApiResult<Reaction>> {
  return gateway.from('reactions').select('*').eq('user_id', userId).eq('post_id', postId).single() as Promise<ApiResult<Reaction>>;
}

export async function deleteReaction(id: string): Promise<ApiResult<null>> {
  return gateway.from('reactions').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== REEL PREFERENCE SIGNALS ====================

export async function createReelPreferenceSignal(data: Partial<ReelPreferenceSignal>): Promise<ApiResult<ReelPreferenceSignal>> {
  return gateway.from('reel_preference_signals').insert([data]).select().single() as Promise<ApiResult<ReelPreferenceSignal>>;
}

export async function getReelPreferenceSignalById(id: string): Promise<ApiResult<ReelPreferenceSignal>> {
  return gateway.from('reel_preference_signals').select('*').eq('id', id).single() as Promise<ApiResult<ReelPreferenceSignal>>;
}

export async function getReelPreferenceSignalsByUser(userId: string): Promise<ApiResult<ReelPreferenceSignal[]>> {
  return gateway.from('reel_preference_signals').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<ReelPreferenceSignal[]>>;
}

export async function updateReelPreferenceSignal(id: string, data: Partial<ReelPreferenceSignal>): Promise<ApiResult<null>> {
  return gateway.from('reel_preference_signals').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteReelPreferenceSignal(id: string): Promise<ApiResult<null>> {
  return gateway.from('reel_preference_signals').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== REEL REPORTS ====================

export async function createReelReport(data: Partial<ReelReport>): Promise<ApiResult<ReelReport>> {
  return gateway.from('reel_reports').insert([data]).select().single() as Promise<ApiResult<ReelReport>>;
}

export async function getReelReportById(id: string): Promise<ApiResult<ReelReport>> {
  return gateway.from('reel_reports').select('*').eq('id', id).single() as Promise<ApiResult<ReelReport>>;
}

export async function getReelReportsByReel(reelId: string): Promise<ApiResult<ReelReport[]>> {
  return gateway.from('reel_reports').select('*').eq('reel_id', reelId).order('created_at', { ascending: false }) as Promise<ApiResult<ReelReport[]>>;
}

export async function getReelReportsByUser(userId: string): Promise<ApiResult<ReelReport[]>> {
  return gateway.from('reel_reports').select('*').eq('reported_by', userId).order('created_at', { ascending: false }) as Promise<ApiResult<ReelReport[]>>;
}

export async function updateReelReport(id: string, data: Partial<ReelReport>): Promise<ApiResult<null>> {
  return gateway.from('reel_reports').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteReelReport(id: string): Promise<ApiResult<null>> {
  return gateway.from('reel_reports').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== REELS ACTIVITY ====================

export async function createReelsActivity(data: Partial<ReelsActivity>): Promise<ApiResult<ReelsActivity>> {
  return gateway.from('reels_activity').insert([data]).select().single() as Promise<ApiResult<ReelsActivity>>;
}

export async function getReelsActivityById(id: string): Promise<ApiResult<ReelsActivity>> {
  return gateway.from('reels_activity').select('*').eq('id', id).single() as Promise<ApiResult<ReelsActivity>>;
}

export async function getReelsActivityByReel(reelId: string): Promise<ApiResult<ReelsActivity[]>> {
  return gateway.from('reels_activity').select('*').eq('reel_id', reelId).order('created_at', { ascending: false }) as Promise<ApiResult<ReelsActivity[]>>;
}

export async function getReelsActivityByActor(actorId: string): Promise<ApiResult<ReelsActivity[]>> {
  return gateway.from('reels_activity').select('*').eq('actor_id', actorId).order('created_at', { ascending: false }) as Promise<ApiResult<ReelsActivity[]>>;
}

export async function deleteReelsActivity(id: string): Promise<ApiResult<null>> {
  return gateway.from('reels_activity').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== REELS LIKES ====================

export async function createReelsLike(data: Partial<ReelsLike>): Promise<ApiResult<ReelsLike>> {
  return gateway.from('reels_likes').insert([data]).select().single() as Promise<ApiResult<ReelsLike>>;
}

export async function getReelsLikeById(id: string): Promise<ApiResult<ReelsLike>> {
  return gateway.from('reels_likes').select('*').eq('id', id).single() as Promise<ApiResult<ReelsLike>>;
}

export async function getReelsLikesByReel(reelId: string): Promise<ApiResult<ReelsLike[]>> {
  return gateway.from('reels_likes').select('*').eq('reel_id', reelId).order('created_at', { ascending: false }) as Promise<ApiResult<ReelsLike[]>>;
}

export async function getReelsLikesByUser(userId: string): Promise<ApiResult<ReelsLike[]>> {
  return gateway.from('reels_likes').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<ReelsLike[]>>;
}

export async function getReelsLikeByUserAndReel(userId: string, reelId: string): Promise<ApiResult<ReelsLike>> {
  return gateway.from('reels_likes').select('*').eq('user_id', userId).eq('reel_id', reelId).single() as Promise<ApiResult<ReelsLike>>;
}

export async function deleteReelsLike(id: string): Promise<ApiResult<null>> {
  return gateway.from('reels_likes').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== SAVED ADS ====================

export async function createSavedAd(data: Partial<SavedAd>): Promise<ApiResult<SavedAd>> {
  return gateway.from('saved_ads').insert([data]).select().single() as Promise<ApiResult<SavedAd>>;
}

export async function getSavedAdById(id: string): Promise<ApiResult<SavedAd>> {
  return gateway.from('saved_ads').select('*').eq('id', id).single() as Promise<ApiResult<SavedAd>>;
}

export async function getSavedAdsByUser(userId: string): Promise<ApiResult<SavedAd[]>> {
  return gateway.from('saved_ads').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<SavedAd[]>>;
}

export async function updateSavedAd(id: string, data: Partial<SavedAd>): Promise<ApiResult<null>> {
  return gateway.from('saved_ads').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteSavedAd(id: string): Promise<ApiResult<null>> {
  return gateway.from('saved_ads').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== SEARCH HISTORY ====================

export async function createSearchHistory(data: Partial<SearchHistory>): Promise<ApiResult<SearchHistory>> {
  return gateway.from('search_history').insert([data]).select().single() as Promise<ApiResult<SearchHistory>>;
}

export async function getSearchHistoryById(id: string): Promise<ApiResult<SearchHistory>> {
  return gateway.from('search_history').select('*').eq('id', id).single() as Promise<ApiResult<SearchHistory>>;
}

export async function getSearchHistoryByUser(userId: string): Promise<ApiResult<SearchHistory[]>> {
  return gateway.from('search_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<SearchHistory[]>>;
}

export async function deleteSearchHistory(id: string): Promise<ApiResult<null>> {
  return gateway.from('search_history').delete().eq('id', id) as Promise<ApiResult<null>>;
}

export async function clearSearchHistory(userId: string): Promise<ApiResult<null>> {
  return gateway.from('search_history').delete().eq('user_id', userId) as Promise<ApiResult<null>>;
}

// ==================== STATUS VISIBILITY ====================

export async function createStatusVisibility(data: Partial<StatusVisibility>): Promise<ApiResult<StatusVisibility>> {
  return gateway.from('status_visibility').insert([data]).select().single() as Promise<ApiResult<StatusVisibility>>;
}

export async function getStatusVisibilityById(id: string): Promise<ApiResult<StatusVisibility>> {
  return gateway.from('status_visibility').select('*').eq('id', id).single() as Promise<ApiResult<StatusVisibility>>;
}

export async function getStatusVisibilityByUser(userId: string): Promise<ApiResult<StatusVisibility[]>> {
  return gateway.from('status_visibility').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<StatusVisibility[]>>;
}

export async function getStatusVisibilityByTarget(targetUserId: string): Promise<ApiResult<StatusVisibility[]>> {
  return gateway.from('status_visibility').select('*').eq('target_user_id', targetUserId).order('created_at', { ascending: false }) as Promise<ApiResult<StatusVisibility[]>>;
}

export async function updateStatusVisibility(id: string, data: Partial<StatusVisibility>): Promise<ApiResult<null>> {
  return gateway.from('status_visibility').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteStatusVisibility(id: string): Promise<ApiResult<null>> {
  return gateway.from('status_visibility').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== STICKER PACKS ====================

export async function createStickerPack(data: Partial<StickerPack>): Promise<ApiResult<StickerPack>> {
  return gateway.from('sticker_packs').insert([data]).select().single() as Promise<ApiResult<StickerPack>>;
}

export async function getStickerPackById(id: string): Promise<ApiResult<StickerPack>> {
  return gateway.from('sticker_packs').select('*').eq('id', id).single() as Promise<ApiResult<StickerPack>>;
}

export async function getAllStickerPacks(): Promise<ApiResult<StickerPack[]>> {
  return gateway.from('sticker_packs').select('*').order('name') as Promise<ApiResult<StickerPack[]>>;
}

export async function updateStickerPack(id: string, data: Partial<StickerPack>): Promise<ApiResult<null>> {
  return gateway.from('sticker_packs').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteStickerPack(id: string): Promise<ApiResult<null>> {
  return gateway.from('sticker_packs').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== STICKERS ====================

export async function createSticker(data: Partial<Sticker>): Promise<ApiResult<Sticker>> {
  return gateway.from('stickers').insert([data]).select().single() as Promise<ApiResult<Sticker>>;
}

export async function getStickerById(id: string): Promise<ApiResult<Sticker>> {
  return gateway.from('stickers').select('*').eq('id', id).single() as Promise<ApiResult<Sticker>>;
}

export async function getStickersByPack(packId: string): Promise<ApiResult<Sticker[]>> {
  return gateway.from('stickers').select('*').eq('pack_id', packId).order('name') as Promise<ApiResult<Sticker[]>>;
}

export async function searchStickers(query: string): Promise<ApiResult<Sticker[]>> {
  return gateway.from('stickers').select('*').ilike('name', `%${query}%`).order('name') as Promise<ApiResult<Sticker[]>>;
}

export async function updateSticker(id: string, data: Partial<Sticker>): Promise<ApiResult<null>> {
  return gateway.from('stickers').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteSticker(id: string): Promise<ApiResult<null>> {
  return gateway.from('stickers').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== TECHNICAL FEEDBACK ====================

export async function createTechnicalFeedback(data: Partial<TechnicalFeedback>): Promise<ApiResult<TechnicalFeedback>> {
  return gateway.from('technical_feedback').insert([data]).select().single() as Promise<ApiResult<TechnicalFeedback>>;
}

export async function getTechnicalFeedbackById(id: string): Promise<ApiResult<TechnicalFeedback>> {
  return gateway.from('technical_feedback').select('*').eq('id', id).single() as Promise<ApiResult<TechnicalFeedback>>;
}

export async function getTechnicalFeedbackByUser(userId: string): Promise<ApiResult<TechnicalFeedback[]>> {
  return gateway.from('technical_feedback').select('*').eq('reporter_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<TechnicalFeedback[]>>;
}

export async function updateTechnicalFeedback(id: string, data: Partial<TechnicalFeedback>): Promise<ApiResult<null>> {
  return gateway.from('technical_feedback').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteTechnicalFeedback(id: string): Promise<ApiResult<null>> {
  return gateway.from('technical_feedback').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== USER ACTIVITY ====================

export async function createUserActivity(data: Partial<UserActivity>): Promise<ApiResult<UserActivity>> {
  return gateway.from('user_activity').insert([data]).select().single() as Promise<ApiResult<UserActivity>>;
}

export async function getUserActivityById(id: string): Promise<ApiResult<UserActivity>> {
  return gateway.from('user_activity').select('*').eq('id', id).single() as Promise<ApiResult<UserActivity>>;
}

export async function getUserActivityByUser(userId: string): Promise<ApiResult<UserActivity[]>> {
  return gateway.from('user_activity').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<UserActivity[]>>;
}

export async function getUserActivityByType(userId: string, type: string): Promise<ApiResult<UserActivity[]>> {
  return gateway.from('user_activity').select('*').eq('user_id', userId).eq('type', type).order('created_at', { ascending: false }) as Promise<ApiResult<UserActivity[]>>;
}

export async function deleteUserActivity(id: string): Promise<ApiResult<null>> {
  return gateway.from('user_activity').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== USER AD INTERACTIONS ====================

export async function createUserAdInteraction(data: Partial<UserAdInteraction>): Promise<ApiResult<UserAdInteraction>> {
  return gateway.from('user_ad_interactions').insert([data]).select().single() as Promise<ApiResult<UserAdInteraction>>;
}

export async function getUserAdInteractionById(id: string): Promise<ApiResult<UserAdInteraction>> {
  return gateway.from('user_ad_interactions').select('*').eq('id', id).single() as Promise<ApiResult<UserAdInteraction>>;
}

export async function getUserAdInteractionsByUser(userId: string): Promise<ApiResult<UserAdInteraction[]>> {
  return gateway.from('user_ad_interactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<UserAdInteraction[]>>;
}

export async function deleteUserAdInteraction(id: string): Promise<ApiResult<null>> {
  return gateway.from('user_ad_interactions').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== USER AD PARTNER SETTINGS ====================

export async function createUserAdPartnerSetting(data: Partial<UserAdPartnerSetting>): Promise<ApiResult<UserAdPartnerSetting>> {
  return gateway.from('user_ad_partner_settings').insert([data]).select().single() as Promise<ApiResult<UserAdPartnerSetting>>;
}

export async function getUserAdPartnerSettingByUser(userId: string): Promise<ApiResult<UserAdPartnerSetting[]>> {
  return gateway.from('user_ad_partner_settings').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<UserAdPartnerSetting[]>>;
}

export async function getUserAdPartnerSettingByPartner(userId: string, partnerId: string): Promise<ApiResult<UserAdPartnerSetting>> {
  return gateway.from('user_ad_partner_settings').select('*').eq('user_id', userId).eq('partner_id', partnerId).single() as Promise<ApiResult<UserAdPartnerSetting>>;
}

export async function updateUserAdPartnerSetting(userId: string, partnerId: string, data: Partial<UserAdPartnerSetting>): Promise<ApiResult<null>> {
  return gateway.from('user_ad_partner_settings').update(data).eq('user_id', userId).eq('partner_id', partnerId) as Promise<ApiResult<null>>;
}

export async function deleteUserAdPartnerSetting(userId: string, partnerId: string): Promise<ApiResult<null>> {
  return gateway.from('user_ad_partner_settings').delete().eq('user_id', userId).eq('partner_id', partnerId) as Promise<ApiResult<null>>;
}

// ==================== USER CONTACTS ====================

export async function createUserContact(data: Partial<UserContact>): Promise<ApiResult<UserContact>> {
  return gateway.from('user_contacts').insert([data]).select().single() as Promise<ApiResult<UserContact>>;
}

export async function getUserContactById(id: string): Promise<ApiResult<UserContact>> {
  return gateway.from('user_contacts').select('*').eq('id', id).single() as Promise<ApiResult<UserContact>>;
}

export async function getUserContactsByUser(userId: string): Promise<ApiResult<UserContact[]>> {
  return gateway.from('user_contacts').select('*').eq('user_id', userId).order('name') as Promise<ApiResult<UserContact[]>>;
}

export async function searchUserContacts(userId: string, query: string): Promise<ApiResult<UserContact[]>> {
  return gateway.from('user_contacts').select('*').eq('user_id', userId).ilike('name', `%${query}%`).order('name') as Promise<ApiResult<UserContact[]>>;
}

export async function updateUserContact(id: string, data: Partial<UserContact>): Promise<ApiResult<null>> {
  return gateway.from('user_contacts').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteUserContact(id: string): Promise<ApiResult<null>> {
  return gateway.from('user_contacts').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== USER DEVICE KEYS ====================

export async function createUserDeviceKey(data: Partial<UserDeviceKey>): Promise<ApiResult<UserDeviceKey>> {
  return gateway.from('user_device_keys').insert([data]).select().single() as Promise<ApiResult<UserDeviceKey>>;
}

export async function getUserDeviceKeyById(id: string): Promise<ApiResult<UserDeviceKey>> {
  return gateway.from('user_device_keys').select('*').eq('id', id).single() as Promise<ApiResult<UserDeviceKey>>;
}

export async function getUserDeviceKeysByUser(userId: string): Promise<ApiResult<UserDeviceKey[]>> {
  return gateway.from('user_device_keys').select('*').eq('user_id', userId).order('last_seen_at', { ascending: false }) as Promise<ApiResult<UserDeviceKey[]>>;
}

export async function updateUserDeviceKey(id: string, data: Partial<UserDeviceKey>): Promise<ApiResult<null>> {
  return gateway.from('user_device_keys').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteUserDeviceKey(id: string): Promise<ApiResult<null>> {
  return gateway.from('user_device_keys').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== USER ENCRYPTION KEYS ====================

export async function createUserEncryptionKey(data: Partial<UserEncryptionKey>): Promise<ApiResult<UserEncryptionKey>> {
  return gateway.from('user_encryption_keys').insert([data]).select().single() as Promise<ApiResult<UserEncryptionKey>>;
}

export async function getUserEncryptionKeyById(id: string): Promise<ApiResult<UserEncryptionKey>> {
  return gateway.from('user_encryption_keys').select('*').eq('id', id).single() as Promise<ApiResult<UserEncryptionKey>>;
}

export async function getUserEncryptionKeysByUser(userId: string): Promise<ApiResult<UserEncryptionKey[]>> {
  return gateway.from('user_encryption_keys').select('*').eq('user_id', userId).order('last_seen_at', { ascending: false }) as Promise<ApiResult<UserEncryptionKey[]>>;
}

export async function getUserEncryptionKeyByFingerprint(userId: string, fingerprint: string): Promise<ApiResult<UserEncryptionKey>> {
  return gateway.from('user_encryption_keys').select('*').eq('user_id', userId).eq('key_fingerprint', fingerprint).single() as Promise<ApiResult<UserEncryptionKey>>;
}

export async function updateUserEncryptionKey(id: string, data: Partial<UserEncryptionKey>): Promise<ApiResult<null>> {
  return gateway.from('user_encryption_keys').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteUserEncryptionKey(id: string): Promise<ApiResult<null>> {
  return gateway.from('user_encryption_keys').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== USER FEEDBACK ====================

export async function createUserFeedback(data: Partial<UserFeedback>): Promise<ApiResult<UserFeedback>> {
  return gateway.from('user_feedback').insert([data]).select().single() as Promise<ApiResult<UserFeedback>>;
}

export async function getUserFeedbackById(id: string): Promise<ApiResult<UserFeedback>> {
  return gateway.from('user_feedback').select('*').eq('id', id).single() as Promise<ApiResult<UserFeedback>>;
}

export async function getUserFeedbackByUser(userId: string): Promise<ApiResult<UserFeedback[]>> {
  return gateway.from('user_feedback').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<UserFeedback[]>>;
}

export async function updateUserFeedback(id: string, data: Partial<UserFeedback>): Promise<ApiResult<null>> {
  return gateway.from('user_feedback').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteUserFeedback(id: string): Promise<ApiResult<null>> {
  return gateway.from('user_feedback').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== USER PREFERENCES ====================

export async function createUserPreference(data: Partial<UserPreference>): Promise<ApiResult<UserPreference>> {
  return gateway.from('user_preferences').insert([data]).select().single() as Promise<ApiResult<UserPreference>>;
}

export async function getUserPreferenceById(id: string): Promise<ApiResult<UserPreference>> {
  return gateway.from('user_preferences').select('*').eq('id', id).single() as Promise<ApiResult<UserPreference>>;
}

export async function getUserPreferenceByUser(userId: string): Promise<ApiResult<UserPreference>> {
  return gateway.from('user_preferences').select('*').eq('user_id', userId).single() as Promise<ApiResult<UserPreference>>;
}

export async function updateUserPreference(id: string, data: Partial<UserPreference>): Promise<ApiResult<null>> {
  return gateway.from('user_preferences').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteUserPreference(id: string): Promise<ApiResult<null>> {
  return gateway.from('user_preferences').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// ==================== BULK OPERATIONS ====================

export async function getMultipleUsers(userIds: string[]): Promise<ApiResult<{ id: string; display_name: string; profile_pic: string | null }[]>> {
  return gateway.from('profiles').select('id, display_name, profile_pic').in('id', userIds) as Promise<ApiResult<{ id: string; display_name: string; profile_pic: string | null }[]>>;
}

export async function searchUsers(query: string, limit: number = 20): Promise<ApiResult<{ id: string; username: string; display_name: string; profile_pic: string | null }[]>> {
  return gateway.from('profiles').select('id, username, display_name, profile_pic').or(`display_name=ilike.%${query}%,username=ilike.%${query}%`).limit(limit) as Promise<ApiResult<{ id: string; username: string; display_name: string; profile_pic: string | null }[]>>;
}

export async function getUserStats(userId: string): Promise<ApiResult<{ posts: number; followers: number; following: number; friends: number }>> {
  const [posts, followers, following, friends] = await Promise.all([
    gateway.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId) as Promise<ApiResult<null>>,
    gateway.from('followers').select('id', { count: 'exact', head: true }).eq('following_id', userId) as Promise<ApiResult<null>>,
    gateway.from('followers').select('id', { count: 'exact', head: true }).eq('follower_id', userId) as Promise<ApiResult<null>>,
    gateway.from('friends').select('id', { count: 'exact', head: true }).or(`requester_id=eq.${userId},receiver_id=eq.${userId}`).eq('status', 'accepted') as Promise<ApiResult<null>>,
  ]);
  
  return {
    data: {
      posts: (posts as any)?.data ?? 0,
      followers: (followers as any)?.data ?? 0,
      following: (following as any)?.data ?? 0,
      friends: (friends as any)?.data ?? 0,
    },
    error: null,
  };
}
