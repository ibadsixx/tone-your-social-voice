-- RPC to change the auth user's primary email without sending a verification email.
-- The frontend handles profiles.email updates separately.
DROP FUNCTION IF EXISTS public.set_primary_email(TEXT);
CREATE FUNCTION public.set_primary_email(new_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID;
  old_email TEXT;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO old_email FROM auth.users WHERE id = uid;
  IF old_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE auth.users
  SET email = new_email,
      email_confirmed_at = NOW(),
      updated_at = NOW()
  WHERE id = uid;

  RETURN old_email;
END;
$$;

-- Fix corrupted profiles.email data
DO $$ DECLARE
  rec RECORD;
  fixed TEXT[];
  elem TEXT;
  parsed TEXT[];
BEGIN
  FOR rec IN SELECT id, email FROM public.profiles WHERE email IS NOT NULL LOOP
    fixed := '{}';
    FOREACH elem IN ARRAY rec.email LOOP
      IF elem LIKE '[%' THEN
        BEGIN
          parsed := ARRAY(SELECT jsonb_array_elements_text(elem::jsonb));
          fixed := fixed || parsed;
        EXCEPTION WHEN OTHERS THEN
          fixed := fixed || elem;
        END;
      ELSE
        fixed := fixed || elem;
      END IF;
    END LOOP;
    UPDATE public.profiles SET email = fixed WHERE id = rec.id;
  END LOOP;
END $$;
