# Spendly — Test Checklist
**App URL (local):** http://localhost:5173  
**App URL (prod):** Your Netlify URL  
Legend: ☐ Not tested &nbsp;|&nbsp; ✅ Pass &nbsp;|&nbsp; ❌ Fail

> **Pre-requisite:** Run `rls-migration.sql` in Supabase SQL Editor before testing §3 (RLS).

---

## 1. Authentication

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1.1 | Sign Up (new user) | Click "Sign up", fill name/email/password, submit | Account created, redirected to "Create Household" screen |
| 1.2 | Login (existing user) | Enter valid email+password, click Sign In | Dashboard loads with expenses |
| 1.3 | Wrong password | Enter correct email, wrong password | Error message shown, no login |
| 1.4 | Forgot Password — send link | Click "Forgot password", enter email, submit | "Email sent" confirmation shown |
| 1.5 | Forgot Password — set new password | Click link in email, enter new password (6+ chars), confirm, submit | "Password updated" success message |
| 1.6 | Forgot Password — expired link | Click an old/already-used reset link | "This reset link has expired…" message shown (not a raw error) |
| 1.7 | Sign Out | Click "Sign out" in header | Returns to Login screen, session cleared |
| 1.8 | Session persistence | Log in, close tab, reopen app | User still logged in (session restored) |

---

## 2. Household Setup

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 2.1 | Create household (first login) | After sign up, enter household name, click Create | Dashboard shown with household name visible |
| 2.2 | Household name in header | After login | Logo area shows "Spendly" + household name below it |
| 2.3 | Household name in hero | On Dashboard | Hero eyebrow shows household name, not hardcoded names |
| 2.4 | Member names dynamic | On Dashboard + Add Expense | "Spent by" toggle shows actual member names from DB, not "Shravan"/"Nikhitha" |

---

## 3. Household Members (Add Partner)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 3.1 | Members card visible | Open Dashboard | "Household Members" card appears above Monthly Budget |
| 3.2 | Signed-in user shown | Open Dashboard | Your own name appears as a chip (no × button — cannot remove yourself) |
| 3.3 | Add partner name | Type partner name in the input, click Add | New chip appears with a coloured badge and × button |
| 3.4 | Add via Enter key | Type a name, press Enter | Same as clicking Add — name added as a chip |
| 3.5 | Duplicate blocked | Type the same name (any case) a second time, click Add | Name is NOT added twice; input stays filled |
| 3.6 | Remove partner | Click × on a partner chip | Chip disappears immediately |
| 3.7 | Partner in Spent-by toggle | After adding partner, open Add Expense form | Both member names appear as toggleable buttons in "Spent by" |
| 3.8 | Partner in History filter | Open History tab | Partner name appears in the "All members" dropdown |
| 3.9 | Per-member stat card | On Dashboard after adding expenses for both members | Separate stat card appears for each member |
| 3.10 | Partner in Analytics | Open Analytics → "Who Spent How Much" | Partner's spending shown in member breakdown |
| 3.11 | Partner name persists | Add partner name, refresh the page | Partner chip still visible (saved in settings table) |
| 3.12 | Partner name persists across sessions | Add partner, sign out, sign back in | Partner chip still present on Dashboard |

---

## 4. Row Level Security (Critical)

> Requires two separate accounts in different households.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 4.1 | Household isolation — read | Log in as User A, note expense count. Log in as User B in another browser/incognito | User B sees 0 of User A's expenses |
| 4.2 | Household isolation — add | Log in as User A, add a new expense | Log in as User B — the new expense is NOT visible |
| 4.3 | RLS on expenses table | In Supabase SQL Editor (as service role): `SELECT COUNT(*) FROM expenses WHERE household_id NOT IN (SELECT household_id FROM profiles WHERE id = auth.uid())` | Returns 0 (your JWT only sees own household) |
| 4.4 | No unsafe "Allow all" policies | Run: `SELECT tablename, policyname FROM pg_policies WHERE policyname ILIKE '%allow all%'` | 0 rows returned |
| 4.5 | household_budgets table exists | Run: `SELECT column_name FROM information_schema.columns WHERE table_name='household_budgets'` | 7 columns returned |
| 4.6 | settings.household_id exists | Run: `SELECT column_name FROM information_schema.columns WHERE table_name='settings' AND column_name='household_id'` | 1 row returned |

---

## 5. Add / Edit / Delete Expense

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 5.1 | Add expense | Click "Add Expense", fill amount + description, pick category + date, select member, click "Add Expense" | Expense appears in dashboard Recent Transactions, toast "Expense added!" |
| 5.2 | Add expense — validation | Submit with empty amount or description | Error toast shown, expense NOT saved |
| 5.3 | Add expense — recurring | Toggle "Recurring expense" to Yes, save | 🔁 badge appears on the expense in lists |
| 5.4 | Save & Add Another | Click "Save & Add Another" | Expense saved, form resets, stays on Add screen |
| 5.5 | Edit expense | In History, click ✏️ on an expense, change amount, save | Expense updated, toast "Expense updated!" |
| 5.6 | Cancel edit | Click ✏️, then click Cancel | Returns to History, original values unchanged |
| 5.7 | Delete expense — confirm | Click 🗑️ on any expense | Confirm dialog appears with "Delete this expense?" |
| 5.8 | Delete expense — cancel | Click 🗑️, then "Cancel" in dialog | Expense NOT deleted, stays in list |
| 5.9 | Delete expense — confirm | Click 🗑️, then "Delete" | Expense removed, toast "Expense deleted." |
| 5.10 | Spent-by pill color | Add expense for each member | Pill badge shows different color per member |

---

## 6. Dashboard

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 6.1 | This Month total | Dashboard stat cards | Correct sum of current month's expenses |
| 6.2 | All Time total | Dashboard stat cards | Correct sum of all expenses |
| 6.3 | Daily Average | Dashboard stat cards | This month's total ÷ day of month |
| 6.4 | Top Category | Dashboard stat cards | Highest-spend category this month |
| 6.5 | Per-member stats | Dashboard stat cards | One card per household member with their monthly total |
| 6.6 | Today's spending | Dashboard stat cards | Sum of expenses with today's date |
| 6.7 | This Week's spending | Dashboard stat cards | Sum of expenses from Sunday to today |
| 6.8 | Largest this month | Dashboard stat cards | Highest single expense this month + description |
| 6.9 | Recent Transactions | Dashboard | 5 most recent expenses shown with member pill |
| 6.10 | Category breakdown | Dashboard right panel | Bar chart per category with % of monthly spend |
| 6.11 | Budget — set | Click "Set budget →", enter amount, press Enter or Save | Budget saved, progress bar appears |
| 6.12 | Budget — progress bar | With budget set and expenses | Bar fills proportionally; color = green/amber/red |
| 6.13 | Budget — over budget | Spend more than budget | Bar turns red, shows "X over budget" |
| 6.14 | Budget — edit | Click "Edit" on budget | Input pre-filled with current value |
| 6.15 | Budget persisted in DB | Set budget, refresh page | Budget value survives page reload (stored in household_budgets table) |
| 6.16 | Category limit alert | Set a category limit (< current spend), check dashboard | ⚠️ Over limit banner appears for that category |

---

## 7. Transaction History

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 7.1 | All transactions shown | Open History tab | All expenses listed, newest first |
| 7.2 | Search | Type in search box | Only matching expenses shown |
| 7.3 | Filter by category | Select a category | Only that category's expenses shown |
| 7.4 | Filter by month | Select a month | Only that month's expenses shown |
| 7.5 | Filter by member | Select a member name | Only expenses for that member shown |
| 7.6 | Sort — newest first | Select "Date: Newest first" | Expenses ordered newest first |
| 7.7 | Sort — amount high-low | Select "Amount: High to low" | Expenses ordered by amount descending |
| 7.8 | Clear filters | Apply any filter, click "Clear filters" | All expenses shown again |
| 7.9 | Filtered total badge | Apply filters | Total badge updates to sum of filtered expenses |
| 7.10 | Load more | When >50 expenses, scroll to bottom | "Load 50 more" button appears and works |
| 7.11 | Empty state | Filter to a combination with no results | "No transactions found." message shown |

---

## 8. Analytics

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 8.1 | Spending by Category pie | Open Analytics tab | Pie chart renders with correct slices |
| 8.2 | Pie chart — month filter | Change month dropdown | Pie updates to that month's data |
| 8.3 | Pie drill-down | Click a legend item | Drill-down panel shows individual transactions for that category |
| 8.4 | 6-month bar chart | Open Analytics | Bar chart shows last 6 months of spend |
| 8.5 | Month vs Month comparison | Analytics card | Current vs previous month totals shown side by side |
| 8.6 | Who Spent How Much | Analytics — member breakdown | Per-member spend bar with % for selected month |
| 8.7 | Analytics month filter | Change month in member breakdown | Updates to selected month |
| 8.8 | Largest expense insight | Analytics insight cards | Shows highest single expense (all time) |
| 8.9 | 6-month average insight | Analytics insight cards | Correct average across 6 months |

---

## 9. CSV Export

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 9.1 | Export all time | Click "Export CSV ↓" → All time → Download CSV | CSV file downloaded, all expenses present |
| 9.2 | Export by month | Export → By month → select month → Download | CSV contains only that month's expenses |
| 9.3 | Export date range | Export → Date range → set from/to → Download | CSV contains only expenses within range |
| 9.4 | Export row count preview | Select any export mode | "X rows will be exported" preview updates correctly |
| 9.5 | CSV column headers | Open exported CSV | Headers: Date, Description, Category, Amount, Spent By |
| 9.6 | Special chars in description | Export expense with commas/quotes in description | CSV properly quoted, opens correctly in Excel |

---

## 10. Branding & UI

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 10.1 | Logo | Check header top-left | Shows "S" circle icon + "Spendly" text |
| 10.2 | Household name in header | Check header sub-label | Shows actual household name from database |
| 10.3 | No hardcoded names | Check all text on page | "Nikhitha" and "Shravan" do NOT appear anywhere in static text |
| 10.4 | Loading skeleton | Refresh with slow connection (DevTools → Slow 3G) | Skeleton shimmer shown instead of plain "Loading…" |
| 10.5 | Toast — success | Add any expense | Green toast "Expense added!" appears bottom-right |
| 10.6 | Toast — error | Simulate error (disconnect network, try to save) | Red toast "Failed to add expense." appears |
| 10.7 | Mobile layout | Resize browser to 375px width | Bottom nav bar visible, layout stacks vertically |
| 10.8 | Bottom navigation | On mobile width | Tap Home/Add/History/Stats — correct views open |

---

## 11. Build & Deploy

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 11.1 | Local dev build | `npm run dev` | No errors, app loads at http://localhost:5173 |
| 11.2 | Production build | `npm run build` | Exits 0, dist/ folder created, no errors |
| 11.3 | Netlify deploy | Push to main branch (or trigger Netlify deploy) | Build passes, site live at Netlify URL |
| 11.4 | Password reset URL | Click reset email link on Netlify URL | Redirects to Netlify app (not Grafana), shows "Set new password" form |

---

## Quick Supabase Verification Queries

Run these in Supabase SQL Editor after migration:

```sql
-- All 5 tables have RLS enabled?
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('profiles','households','expenses','settings','household_budgets')
AND schemaname = 'public';
-- Expected: all rowsecurity = true

-- Zero unsafe policies?
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public'
AND (policyname ILIKE '%allow all%' OR policyname ILIKE '%enable read access for all%');
-- Expected: 0 rows

-- household_budgets has 7 columns?
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='household_budgets';
-- Expected: id, household_id, month, budget_amount, currency, created_at, updated_at

-- All 5 indexes exist?
SELECT indexname FROM pg_indexes WHERE schemaname='public'
AND indexname IN ('idx_expenses_household_id','idx_expenses_household_date',
  'idx_profiles_household_id','idx_household_budgets_lookup','settings_household_key_unique');
-- Expected: 5 rows
```
