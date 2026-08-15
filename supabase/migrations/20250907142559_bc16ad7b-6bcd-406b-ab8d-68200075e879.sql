-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to publish scheduled posts every minute.
-- No secrets or project URLs are stored in the repository. Set these at deploy
-- time (e.g. `ALTER DATABASE ... SET app.publish_scheduled_posts_url = '...'`
-- and `app.publish_scheduled_posts_headers` with the Authorization bearer token).
SELECT cron.schedule(
  'publish-scheduled-posts',
  '* * * * *', -- every minute
  $$
  SELECT
    net.http_post(
      url := COALESCE(
        current_setting('app.publish_scheduled_posts_url', true),
        'https://YOUR_GATEWAY_OR_EDGE_FUNCTION_URL/publish-scheduled-posts'
      ),
      headers := COALESCE(
        current_setting('app.publish_scheduled_posts_headers', true),
        '{"Content-Type": "application/json"}'
      )::jsonb,
      body := concat('{"triggered_at": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);