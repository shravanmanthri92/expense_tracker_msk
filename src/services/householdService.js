import { supabase } from "../supabaseClient";

/**
 * Create a new household and link the creating user's profile to it.
 * Returns { data: household, error }.
 */
export async function createHousehold({ name, userId }) {
  // Pre-generate the ID so we don't need a SELECT after INSERT.
  // The SELECT policy would fail for new users (no household_id in profile yet),
  // so chaining .select().single() on INSERT would return null and look like an error.
  const newId = crypto.randomUUID();

  const { error: hError } = await supabase
    .from("households")
    .insert({ id: newId, name: name.trim(), created_by: userId });

  if (hError) return { data: null, error: hError };

  const { error: pError } = await supabase
    .from("profiles")
    .update({ household_id: newId, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (pError) return { data: null, error: pError };

  return { data: { id: newId, name: name.trim(), created_by: userId }, error: null };
}

/**
 * Fetch a single household by id.
 * Returns { data: household, error }.
 */
export async function fetchHousehold(householdId) {
  const { data, error } = await supabase
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();
  return { data: data || null, error };
}

/**
 * Fetch all member profiles that belong to a household.
 * Returns { data: profile[], error }.
 */
export async function fetchHouseholdMembers(householdId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  return { data: data || [], error };
}

/**
 * Fetch the monthly budget row for a household+month pair.
 * month format: 'YYYY-MM'.
 * Returns { data: row | null, error }.
 */
export async function fetchHouseholdBudget(householdId, month) {
  const { data, error } = await supabase
    .from("household_budgets")
    .select("*")
    .eq("household_id", householdId)
    .eq("month", month)
    .maybeSingle();
  return { data: data || null, error };
}

/**
 * Upsert (insert or update) the monthly budget for a household.
 * Returns { data, error }.
 */
export async function upsertHouseholdBudget(householdId, month, budgetAmount, currency = "INR") {
  const { data, error } = await supabase
    .from("household_budgets")
    .upsert(
      {
        household_id: householdId,
        month,
        budget_amount: budgetAmount,
        currency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id,month" }
    )
    .select()
    .single();
  return { data, error };
}
