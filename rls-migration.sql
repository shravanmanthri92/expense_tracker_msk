-- ================================================================
-- Spendly — RLS Recursion Fix (run this NOW in Supabase SQL Editor)
-- ================================================================
-- Root cause: profiles_select_household queries "profiles" inside
-- a policy ON profiles → PostgreSQL detects infinite recursion and
-- silently fails all household / expense queries.
-- Fix: a SECURITY DEFINER function reads profiles without RLS.
-- ================================================================

BEGIN;

-- ── Helper function (bypasses RLS — safe, read-only) ─────────────
CREATE OR REPLACE FUNCTION public.get_my_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_household_id() TO authenticated;

-- ── Rebuild profiles policies (fix the recursive one) ────────────
DROP POLICY IF EXISTS "profiles_select_own"       ON profiles;
DROP POLICY IF EXISTS "profiles_select_household" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"       ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own"       ON profiles;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Now safe: uses the security-definer function, not a raw subquery
CREATE POLICY "profiles_select_household"
  ON profiles FOR SELECT
  USING (
    household_id IS NOT NULL
    AND household_id = public.get_my_household_id()
  );

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── Rebuild households policies ──────────────────────────────────
DROP POLICY IF EXISTS "households_select_member" ON households;
DROP POLICY IF EXISTS "households_insert_creator" ON households;
DROP POLICY IF EXISTS "households_update_member" ON households;

CREATE POLICY "households_select_member"
  ON households FOR SELECT
  USING (id = public.get_my_household_id());

CREATE POLICY "households_insert_creator"
  ON households FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "households_update_member"
  ON households FOR UPDATE
  USING (id = public.get_my_household_id());

-- ── Rebuild expenses policies ────────────────────────────────────
DROP POLICY IF EXISTS "expenses_select_own_household" ON expenses;
DROP POLICY IF EXISTS "expenses_insert_own_household" ON expenses;
DROP POLICY IF EXISTS "expenses_update_own_household" ON expenses;
DROP POLICY IF EXISTS "expenses_delete_own_household" ON expenses;

CREATE POLICY "expenses_select_own_household"
  ON expenses FOR SELECT
  USING (household_id = public.get_my_household_id());

CREATE POLICY "expenses_insert_own_household"
  ON expenses FOR INSERT
  WITH CHECK (household_id = public.get_my_household_id());

CREATE POLICY "expenses_update_own_household"
  ON expenses FOR UPDATE
  USING (household_id = public.get_my_household_id());

CREATE POLICY "expenses_delete_own_household"
  ON expenses FOR DELETE
  USING (household_id = public.get_my_household_id());

-- ── Rebuild settings policies ────────────────────────────────────
DROP POLICY IF EXISTS "settings_select_own_household" ON settings;
DROP POLICY IF EXISTS "settings_insert_own_household" ON settings;
DROP POLICY IF EXISTS "settings_update_own_household" ON settings;

CREATE POLICY "settings_select_own_household"
  ON settings FOR SELECT
  USING (household_id = public.get_my_household_id());

CREATE POLICY "settings_insert_own_household"
  ON settings FOR INSERT
  WITH CHECK (household_id = public.get_my_household_id());

CREATE POLICY "settings_update_own_household"
  ON settings FOR UPDATE
  USING (household_id = public.get_my_household_id());

-- ── Rebuild household_budgets policies ──────────────────────────
DROP POLICY IF EXISTS "budgets_select_own_household" ON household_budgets;
DROP POLICY IF EXISTS "budgets_insert_own_household" ON household_budgets;
DROP POLICY IF EXISTS "budgets_update_own_household" ON household_budgets;
DROP POLICY IF EXISTS "budgets_delete_own_household" ON household_budgets;

CREATE POLICY "budgets_select_own_household"
  ON household_budgets FOR SELECT
  USING (household_id = public.get_my_household_id());

CREATE POLICY "budgets_insert_own_household"
  ON household_budgets FOR INSERT
  WITH CHECK (household_id = public.get_my_household_id());

CREATE POLICY "budgets_update_own_household"
  ON household_budgets FOR UPDATE
  USING (household_id = public.get_my_household_id());

CREATE POLICY "budgets_delete_own_household"
  ON household_budgets FOR DELETE
  USING (household_id = public.get_my_household_id());

COMMIT;
