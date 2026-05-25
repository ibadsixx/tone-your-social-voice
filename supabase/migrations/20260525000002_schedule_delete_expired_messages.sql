-- Schedule the delete-expired-messages Edge Function to run every minute
SELECT cron.schedule(
  'delete-expired-messages',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ojdhztcetykgvrcwlwen.supabase.co/functions/v1/delete-expired-messages',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZGh6dGNldHlrZ3ZyY3dsd2VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMjA4NDIsImV4cCI6MjA3MjU5Njg0Mn0.PduCJ07zGbBM9X3BLzTpGz3e7TxiavkMMQ_sPK0JnB4"}'::jsonb,
      body := concat('{"triggered_at": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);
