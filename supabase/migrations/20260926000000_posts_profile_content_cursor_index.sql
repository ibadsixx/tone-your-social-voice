-- Composite index for the one-item-at-a-time profile content cursor
-- (do.md "Profile content pages").
--
-- `GET /api/profiles/:id/content` pages a profile with a keyset cursor:
--
--   WHERE user_id = $1
--     AND (created_at, id) < ($2, $3)
--   ORDER BY created_at DESC
--   LIMIT 12
--
-- The only `posts` indexes that exist are `idx_posts_user_id (user_id)` and
-- `idx_posts_created_at (created_at DESC)`, and neither can serve that plan:
-- the first filters by user and then sorts that user's whole history on every
-- request, the second walks the global timeline in order and filters `user_id`
-- row by row with no bound. `id` appears in no index at all, yet it is the
-- tie-break the cursor needs -- `created_at` is not unique, so without `id` the
-- ordering is ambiguous and a page boundary can fall inside a run of equal
-- timestamps, which is how a post gets served twice or not at all.
--
-- This index makes the read an index seek that stops after a dozen rows, so
-- scrolling a profile costs the same whether the profile has six posts or six
-- thousand, and the scan is bounded by `LIMIT` rather than by history depth.
--
-- Apply on EVERY posts-domain project: `posts` is sharded across several
-- Supabase projects and the Gateway fans the same predicate out to each.

CREATE INDEX IF NOT EXISTS idx_posts_user_created_at_id
  ON public.posts (user_id, created_at DESC, id DESC);
