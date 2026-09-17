-- Group settings + optional "Group Rules" feature (message.md).
--
-- Reuses the existing `groups` table for everything that already exists:
--   * name        -> GROUP NAME (already NOT NULL)
--   * description -> GROUP DESCRIPTION (already nullable)
--   * privacy     -> PRIVACY (already present)
--   * created_by  -> group owner (already present)
--
-- Adds only the minimum structures that do not exist yet:
--   * groups.rules_enabled -> the Group Rules ON/OFF control
--   * group_rules          -> owner-managed, ordered list of rules
--
-- All writes go through the API Gateway (service role). Clients are granted
-- SELECT only; no INSERT/UPDATE/DELETE policies are created here, so the
-- browser can never mutate rules or settings directly.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS rules_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.group_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  rule_text text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_rules_group_id_position_idx
  ON public.group_rules (group_id, position, created_at);

ALTER TABLE public.group_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group rules are viewable by everyone" ON public.group_rules;
CREATE POLICY "Group rules are viewable by everyone"
  ON public.group_rules FOR SELECT USING (true);
