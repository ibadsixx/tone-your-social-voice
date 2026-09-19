-- Group member management + moderation (message.md).
--
-- Extends the EXISTING standalone Groups feature (groups / group_members /
-- group_rules) with real member management backed by the API Gateway:
--
--   * group_member_bans         -> banned members (banned members lose their
--                                  membership row and cannot rejoin while the
--                                  ban is active)
--   * group_member_restrictions -> active restrictions on a member (posting
--                                  only, or all interactions). Expiry is
--                                  evaluated at read/write time, so no cron
--                                  job is needed.
--   * group_moderation_actions  -> remove/ban/unban/restrict/unrestrict
--                                  history shown to the owner & moderators
--   * group_reports             -> member reports, mirroring profile_reports
--
-- notifications.group_id          -> lets member-moderation notifications
--                                    navigate back to the Group. No FK is
--                                    added because notifications live on a
--                                    different host than groups.
--
-- All writes go through the API Gateway (service role). Clients are granted
-- SELECT only; no INSERT/UPDATE/DELETE policies are created here, so the
-- browser can never mutate bans/restrictions/reports directly.
--
-- Defense in depth: BEFORE INSERT triggers on group_members (banned users can
-- not rejoin) and group_posts (restricted users can not share posts) enforce
-- the invariants for EVERY write path, including the service role.

CREATE TABLE IF NOT EXISTS public.group_member_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  banned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS group_member_bans_one_active_per_user_idx
  ON public.group_member_bans (group_id, user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS group_member_bans_group_created_idx
  ON public.group_member_bans (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.group_member_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  restriction_type text NOT NULL
    CHECK (restriction_type IN ('posting', 'all')),
  restricted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  rule_id uuid REFERENCES public.group_rules(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS group_member_restrictions_one_active_per_user_idx
  ON public.group_member_restrictions (group_id, user_id, restriction_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS group_member_restrictions_group_created_idx
  ON public.group_member_restrictions (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.group_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  action text NOT NULL
    CHECK (action IN ('remove', 'ban', 'unban', 'restrict', 'unrestrict', 'post_removed')),
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  rule_id uuid REFERENCES public.group_rules(id) ON DELETE SET NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_moderation_actions_group_created_idx
  ON public.group_moderation_actions (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.group_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL
    CHECK (reason IN ('fake_account', 'harassment', 'inappropriate_content', 'other')),
  description text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_report_description_length_check CHECK (char_length(description) <= 500),
  CONSTRAINT unique_pending_group_report
    UNIQUE (group_id, reported_user_id, reporter_user_id, status) INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS group_reports_group_created_idx
  ON public.group_reports (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS group_reports_reported_user_idx
  ON public.group_reports (reported_user_id);

ALTER TABLE public.group_member_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_member_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bans are viewable by everyone" ON public.group_member_bans;
CREATE POLICY "Bans are viewable by everyone"
  ON public.group_member_bans FOR SELECT USING (true);

DROP POLICY IF EXISTS "Restrictions are viewable by everyone" ON public.group_member_restrictions;
CREATE POLICY "Restrictions are viewable by everyone"
  ON public.group_member_restrictions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Moderation actions are viewable by everyone" ON public.group_moderation_actions;
CREATE POLICY "Moderation actions are viewable by everyone"
  ON public.group_moderation_actions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Group reports are viewable by everyone" ON public.group_reports;
CREATE POLICY "Group reports are viewable by everyone"
  ON public.group_reports FOR SELECT USING (true);

-- --- Defense in depth: enforce bans/restrictions at the database level ---

CREATE OR REPLACE FUNCTION public.assert_group_member_can_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.group_member_bans b
    WHERE b.group_id = NEW.group_id
      AND b.user_id = NEW.user_id
      AND b.status = 'active'
      AND (b.expires_at IS NULL OR b.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'user is banned from this group'
      USING ERRCODE = '22000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_members_block_banned_join ON public.group_members;
CREATE TRIGGER group_members_block_banned_join
  BEFORE INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.assert_group_member_can_join();

CREATE OR REPLACE FUNCTION public.assert_group_member_can_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.group_member_restrictions r
    WHERE r.group_id = NEW.group_id
      AND r.user_id = NEW.shared_by
      AND r.status = 'active'
      AND r.restriction_type IN ('posting', 'all')
      AND (r.ends_at IS NULL OR r.ends_at > now())
  ) THEN
    RAISE EXCEPTION 'user is restricted from posting in this group'
      USING ERRCODE = '22000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_posts_block_restricted_share ON public.group_posts;
CREATE TRIGGER group_posts_block_restricted_share
  BEFORE INSERT ON public.group_posts
  FOR EACH ROW EXECUTE FUNCTION public.assert_group_member_can_post();

-- --- Notifications: navigate member-moderation alerts back to the Group ---

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS group_id uuid;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'mention', 'follow', 'tag', 'share',
    'post_from_followed', 'group_post', 'poke', 'hashtag_post',
    'friend_request', 'message_request', 'invitation',
    'group_membership_accepted', 'security_login', 'channel_post',
    'group_member_removed', 'group_member_banned', 'group_member_unbanned',
    'group_member_restricted', 'group_member_unrestricted'
  ));

CREATE INDEX IF NOT EXISTS idx_notifications_group_id ON public.notifications(group_id);