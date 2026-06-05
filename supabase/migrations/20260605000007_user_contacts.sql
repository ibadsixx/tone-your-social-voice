CREATE TABLE public.user_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own contacts"
  ON public.user_contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contacts"
  ON public.user_contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contacts"
  ON public.user_contacts FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_contacts_user_id ON public.user_contacts(user_id);

INSERT INTO public.user_contacts (user_id, name, phone, email) VALUES
  ('07d4672e-bbdf-4e59-94c2-dd4fbc3d117f', 'Alice Johnson', '+1-555-0101', 'alice@example.com'),
  ('07d4672e-bbdf-4e59-94c2-dd4fbc3d117f', 'Bob Martinez', '+1-555-0102', 'bob@example.com'),
  ('07d4672e-bbdf-4e59-94c2-dd4fbc3d117f', 'Catherine Lee', '+1-555-0103', 'catherine@example.com'),
  ('07d4672e-bbdf-4e59-94c2-dd4fbc3d117f', 'David Kim', '+1-555-0104', 'david@example.com'),
  ('07d4672e-bbdf-4e59-94c2-dd4fbc3d117f', 'Emma Wilson', '+1-555-0105', 'emma@example.com');

INSERT INTO public.privacy_settings (user_id, setting_name, setting_value)
SELECT '07d4672e-bbdf-4e59-94c2-dd4fbc3d117f', setting_name, setting_value
FROM (VALUES
  ('contact_upload_enabled', 'false'),
  ('friend_suggestions_enabled', 'true'),
  ('contact_sync_enabled', 'true')
) AS s(setting_name, setting_value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.privacy_settings ps
  WHERE ps.user_id = '07d4672e-bbdf-4e59-94c2-dd4fbc3d117f'
    AND ps.setting_name = s.setting_name
);

CREATE OR REPLACE FUNCTION public.get_my_contacts()
RETURNS TABLE(
  id UUID,
  name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT uc.id, uc.name, uc.phone, uc.email, uc.created_at
  FROM public.user_contacts uc
  WHERE uc.user_id = auth.uid()
  ORDER BY uc.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_contact(p_contact_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.user_contacts
  WHERE id = p_contact_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_all_my_contacts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.user_contacts WHERE user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_contact_settings()
RETURNS TABLE(
  setting_name TEXT,
  setting_value TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT ps.setting_name, ps.setting_value
  FROM public.privacy_settings ps
  WHERE ps.user_id = auth.uid()
    AND ps.setting_name IN ('contact_upload_enabled', 'friend_suggestions_enabled', 'contact_sync_enabled');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_contact_setting(p_setting_name TEXT, p_setting_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.privacy_settings (user_id, setting_name, setting_value)
  VALUES (v_user_id, p_setting_name, p_setting_value)
  ON CONFLICT (user_id, setting_name)
  DO UPDATE SET setting_value = p_setting_value, updated_at = NOW();
END;
$$;
