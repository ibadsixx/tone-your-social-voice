-- Widen comment_reactions.emoji to accept the canonical reaction keys.
--
-- The table was created with a CHECK limited to the original unicode emoji
-- ('❤️', '👍', '😆', '😮', '😢', '😡'). The reaction picker writes the same
-- canonical keys used by public.reaction_type ('ok', 'red_heart', 'laughing',
-- 'astonished', 'cry', 'rage', 'hug_face'), so those inserts were rejected by
-- the database.
--
-- Both the legacy emoji and the canonical keys are accepted from here on. The
-- Gateway normalizes either form to a canonical key when it counts or filters
-- reactions, so old rows keep rendering and old clients keep working.
--
-- The legacy name is the one Postgres generated for the original inline CHECK.
ALTER TABLE public.comment_reactions
  DROP CONSTRAINT IF EXISTS comment_reactions_emoji_check;

ALTER TABLE public.comment_reactions
  ADD CONSTRAINT comment_reactions_emoji_check
  CHECK (emoji IN (
    -- canonical keys (shared with public.reaction_type)
    'ok',
    'red_heart',
    'laughing',
    'astonished',
    'cry',
    'rage',
    'hug_face',
    -- legacy unicode emoji from the original constraint
    '❤️',
    '❤',
    '👍',
    '😆',
    '😮',
    '😢',
    '😡'
  ));
