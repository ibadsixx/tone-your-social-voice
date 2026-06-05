ALTER TABLE public.export_requests
  ADD COLUMN download_url TEXT,
  ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;

DROP FUNCTION IF EXISTS public.get_my_export_requests();

CREATE OR REPLACE FUNCTION public.get_my_export_requests()
RETURNS TABLE(
  id UUID,
  data_type TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT,
  download_url TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
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
  SELECT er.id, er.data_type, er.start_date, er.end_date, er.status, er.download_url, er.completed_at, er.created_at
  FROM public.export_requests er
  WHERE er.user_id = auth.uid()
  ORDER BY er.created_at DESC;
END;
$$;
