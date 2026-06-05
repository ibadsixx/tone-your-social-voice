CREATE TABLE public.export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  data_type TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.export_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own export requests"
  ON public.export_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own export requests"
  ON public.export_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_export_requests_user_id ON public.export_requests(user_id);
CREATE INDEX idx_export_requests_status ON public.export_requests(status);
CREATE INDEX idx_export_requests_created_at ON public.export_requests(created_at DESC);

CREATE OR REPLACE FUNCTION public.create_export_request(
  p_data_type TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_export_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_data_type IS NULL OR p_data_type = '' THEN
    RAISE EXCEPTION 'Data type is required';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Start date must be before end date';
  END IF;

  INSERT INTO public.export_requests (user_id, data_type, start_date, end_date)
  VALUES (v_user_id, p_data_type, p_start_date, p_end_date)
  RETURNING id INTO v_export_id;

  RETURN v_export_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_export_requests()
RETURNS TABLE(
  id UUID,
  data_type TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT,
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
  SELECT er.id, er.data_type, er.start_date, er.end_date, er.status, er.created_at
  FROM public.export_requests er
  WHERE er.user_id = auth.uid()
  ORDER BY er.created_at DESC;
END;
$$;
