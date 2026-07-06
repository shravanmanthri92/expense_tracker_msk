import { supabase } from "../supabaseClient";

/**
 * Create a new household and link the creating user's profile to it.
 * Returns { data: household, error }.
 */
export async function createHousehold({ name, userId }) {
  const { data: household, error: hError } = await supabase
    .from("households")
    .insert({ name: name.trim(), created_by: userId })
    .select()
    .single();

  if (hError) return { data: null, error: hError };

  const { error: pError } = await supabase
    .from("profiles")
    .update({ household_id: household.id, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (pError) return { data: null, error: pError };

  return { data: household, error: null };
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
