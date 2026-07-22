export { gateway, API_URL } from './client';
export type { ApiResult } from './client';
export type {
  Post, Comment, Story, Notification, Conversation, Message,
  Group, Page, Hashtag,
} from './types';
export type { Profile } from './profiles';

import * as postsApi from './posts';
import * as commentsApi from './comments';
import * as storiesApi from './stories';
import * as profilesApi from './profiles';
import * as notificationsApi from './notifications';
import * as conversationsApi from './conversations';
import * as groupsApi from './groups';
import * as pagesApi from './pages';
import * as blockingApi from './blocking';
import * as hashtagsApi from './hashtags';
import * as musicApi from './music';
import * as advertisersApi from './advertisers';

export {
  postsApi,
  commentsApi,
  storiesApi,
  profilesApi,
  notificationsApi,
  conversationsApi,
  groupsApi,
  pagesApi,
  blockingApi,
  hashtagsApi,
  musicApi,
  advertisersApi,
};
