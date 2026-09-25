-- Reactor identities are private by default at the database boundary too.
--
-- The product's normal reads go through the API Gateway, whose dedicated
-- reaction-users routes apply the owner's reactions_visibility setting and
-- return a paginated public-profile projection.  The old direct-table SELECT
-- policies below exposed every user_id to any Supabase client and would have
-- bypassed that Gateway policy.  Keep direct RLS reads narrowly scoped to the
-- actor and the content owner; public reactor lists are intentionally served
-- by the Gateway, not by an anon-key table scan.

-- Idempotent: a project that never ran the original table migrations still
-- ends up with RLS on rather than silently exposing every reactor.
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reactions are viewable by everyone" ON public.reactions;
DROP POLICY IF EXISTS "Anyone can view reactions" ON public.reactions;

CREATE POLICY "Reaction rows are visible to actor or content owner"
  ON public.reactions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.posts AS p
      WHERE p.id = reactions.post_id
        AND p.user_id = auth.uid()
    )
  );

ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view reactions" ON public.comment_reactions;
DROP POLICY IF EXISTS "Comment reactions are viewable by everyone" ON public.comment_reactions;

CREATE POLICY "Comment reaction rows are visible to actor or comment owner"
  ON public.comment_reactions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.comments AS c
      WHERE c.id = comment_reactions.comment_id
        AND c.user_id = auth.uid()
    )
  );
