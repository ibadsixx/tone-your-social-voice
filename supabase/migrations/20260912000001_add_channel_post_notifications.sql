-- Channel posts notify followers through the EXISTING notifications system
-- (messages.md). This adds a channel_id column so an unread notification can
-- navigate to /messages/<channelId>, and extends the type CHECK to accept
-- 'channel_post'.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'mention', 'follow', 'tag', 'share',
    'post_from_followed', 'group_post', 'poke', 'hashtag_post',
    'friend_request', 'message_request', 'invitation',
    'group_membership_accepted', 'security_login', 'channel_post'
  ));

CREATE INDEX IF NOT EXISTS idx_notifications_channel_id ON public.notifications(channel_id);