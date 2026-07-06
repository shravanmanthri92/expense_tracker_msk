import { supabase } from "../supabaseClient";

/**
 * Fetch all expenses belonging to a household, newest first.
 * Returns { data, error }.
 */
export async function fetchExpenses(householdId) {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });
  return { data: data || [], error };
}

/**
 * Insert a new expense linked to a household and user.
 * Returns { data, error }.
 */
export async function insertExpense({ amount, category, date, notes, spentBy, householdId, userId }) {
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      amount,
      category,
      date,
      notes,
      spent_by: spentBy,
      household_id: householdId,
      created_by: userId,
    })
    .select()
    .single();
  return { data, error };
}

/**
 * Update an existing expense (scoped to household for safety).
 * Returns { error }.
 */
export async function updateExpense({ id, amount, category, date, notes, spentBy, householdId }) {
  const { error } = await supabase
    .from("expenses")
    .update({
      amount,
      category,
      date,
      notes,
      spent_by: spentBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("household_id", householdId);
  return { error };
}

/**
 * Delete an expense (scoped to household for safety).
 * Returns { error }.
 */
export async function deleteExpense({ id, householdId }) {
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);
  return { error };
}
