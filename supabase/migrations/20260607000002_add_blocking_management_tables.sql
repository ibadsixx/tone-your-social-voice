-- Blocked Nicknames
CREATE TABLE IF NOT EXISTS public.blocked_nicknames (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nickname TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, nickname)
);

ALTER TABLE public.blocked_nicknames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their blocked nicknames"
  ON public.blocked_nicknames FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add blocked nicknames"
  ON public.blocked_nicknames FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove blocked nicknames"
  ON public.blocked_nicknames FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_blocked_nicknames_user_id ON public.blocked_nicknames(user_id);

-- Blocked Message Senders
CREATE TABLE IF NOT EXISTS public.blocked_message_senders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  blocked_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, blocked_user_id)
);

ALTER TABLE public.blocked_message_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view blocked message senders"
  ON public.blocked_message_senders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can block message senders"
  ON public.blocked_message_senders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unblock message senders"
  ON public.blocked_message_senders FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_blocked_message_senders_user_id ON public.blocked_message_senders(user_id);

-- Blocked App Invite Senders
CREATE TABLE IF NOT EXISTS public.blocked_app_invite_senders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  blocked_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, blocked_user_id)
);

ALTER TABLE public.blocked_app_invite_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view blocked app invite senders"
  ON public.blocked_app_invite_senders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can block app invite senders"
  ON public.blocked_app_invite_senders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unblock app invite senders"
  ON public.blocked_app_invite_senders FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_blocked_app_invite_senders_user_id ON public.blocked_app_invite_senders(user_id);

-- Blocked Event Invite Senders
CREATE TABLE IF NOT EXISTS public.blocked_event_invite_senders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  blocked_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, blocked_user_id)
);

ALTER TABLE public.blocked_event_invite_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view blocked event invite senders"
  ON public.blocked_event_invite_senders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can block event invite senders"
  ON public.blocked_event_invite_senders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unblock event invite senders"
  ON public.blocked_event_invite_senders FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_blocked_event_invite_senders_user_id ON public.blocked_event_invite_senders(user_id);
