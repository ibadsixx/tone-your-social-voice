-- Add conversation_settings to supabase_realtime publication so we can listen for read_receipts_enabled preference changes in real-time
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_settings;
