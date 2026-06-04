-- Change profiles.email to TEXT[] to support multiple emails
ALTER TABLE public.profiles
  ALTER COLUMN email TYPE TEXT[]
  USING CASE
    WHEN email IS NULL THEN ARRAY[]::TEXT[]
    ELSE ARRAY[email]
  END;

-- Update handle_new_user to store email as array
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    ARRAY[new.email]
  );
  RETURN new;
END;
$$;

-- RPC to resolve any email (checks profiles.email array and auth.users.email)
CREATE OR REPLACE FUNCTION public.resolve_auth_email(p_email TEXT)
RETURNS TABLE(auth_email TEXT, user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Check if it's in the profiles.email array
  RETURN QUERY
  SELECT au.email::TEXT, p.id
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.email IS NOT NULL AND p.email @> ARRAY[p_email];

  IF FOUND THEN
    RETURN;
  END IF;

  -- Check if it's a primary auth email
  RETURN QUERY
  SELECT u.email::TEXT, u.id
  FROM auth.users u
  WHERE u.email = p_email;
END;
$$;
