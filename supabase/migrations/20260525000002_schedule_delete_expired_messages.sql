-- Schedule the delete-expired-messages Edge Function to run every minute.
-- No secrets or project URLs are stored in the repository. Set these at deploy
-- time (e.g. `ALTER DATABASE ... SET app.delete_expired_messages_url = '...'`
-- and `app.delete_expired_messages_headers` with the Authorization bearer token).
SELECT cron.schedule(
  'delete-expired-messages',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := COALESCE(
        current_setting('app.delete_expired_messages_url', true),
        'https://YOUR_GATEWAY_OR_EDGE_FUNCTION_URL/delete-expired-messages'
      ),
      headers := COALESCE(
        current_setting('app.delete_expired_messages_headers', true),
        '{"Content-Type": "application/json"}'
      )::jsonb,
      body := concat('{"triggered_at": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);
