import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./contexts/AuthContext";
import Login from "./components/Login";
import Signup from "./components/Signup";
import ForgotPassword from "./components/ForgotPassword";
import CreateHousehold from "./components/CreateHousehold";
import { fetchExpenses as fetchExpensesService, insertExpense, updateExpense as updateExpenseService, deleteExpense as deleteExpenseService } from "./services/expenseService";
import { fetchHouseholdBudget as fetchHouseholdBudgetFn, upsertHouseholdBudget as upsertHouseholdBudgetFn } from "./services/householdService";

const CATEGORIES = [
  { id: "food", label: "Food & Dining", icon: "🍽️", color: "#ff8a65" },
  { id: "transport", label: "Transport", icon: "🚗", color: "#60a5fa" },
  { id: "shopping", label: "Shopping", icon: "🛍️", color: "#c084fc" },
  { id: "health", label: "Health", icon: "💊", color: "#34d399" },
  { id: "entertainment", label: "Entertainment", icon: "🎬", color: "#fbbf24" },
  { id: "utilities", label: "Utilities", icon: "💡", color: "#94a3b8" },
  { id: "rent", label: "Rent/Home Loan", icon: "🏠", color: "#fb7185" },
  { id: "groceries", label: "Groceries", icon: "🛒", color: "#4ade80" },
  { id: "other", label: "Other", icon: "📦", color: "#a1a1aa" },
];

const getCat = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[7];

const CURRENCY_OPTIONS = [
  { code: "INR", label: "INR (₹)", locale: "en-IN", symbol: "₹" },
];

const getCurrencyMeta = (code) =>
  CURRENCY_OPTIONS.find((c) => c.code === code) || CURRENCY_OPTIONS[0];

const fmt = (n, currency = "INR") => {
  const meta = getCurrencyMeta(currency);
  return new Intl.NumberFormat(meta.locale, { style: "currency", currency: meta.code }).format(n);
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const todayISO = () => new Date().toISOString().split("T")[0];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Maps a Supabase DB row → internal app shape (DB uses `notes`, app uses `description`)
const mapRow = (row) => {
  const rawNotes = row.notes || "";
  const isRecurring = rawNotes.endsWith("||r");
  return {
    id: row.id,
    amount: parseFloat(row.amount),
    description: isRecurring ? rawNotes.slice(0, -3) : rawNotes,
    category: row.category,
    date: row.date,
    spentBy: row.spent_by || "",
    isRecurring,
  };
};

const buildPieGradient = (items) => {
  if (!items.length) return "conic-gradient(rgba(148, 163, 184, 0.18) 0 100%)";
  const total = items.reduce((sum, item) => sum + item.total, 0);
  let current = 0;
  const slices = items.map((item) => {
    const start = current;
    const portion = (item.total / total) * 100;
    current += portion;
    return `${item.color} ${start}% ${current}%`;
  });
  return `conic-gradient(${slices.join(", ")})`;
};

export default function SpendlyApp() {
  const { session, loading, profileLoading, profile, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const [authView, setAuthView] = useState("login"); // "login" | "signup" | "forgot"

  // Wait for session restore AND profile/household load before rendering
  if (loading || (session && profileLoading)) {
    return (
      <div className="auth-overlay">
        <div className="db-loading" style={{ paddingTop: 0 }}>Loading…</div>
      </div>
    );
  }

  if (!session) {
    if (authView === "signup") {
      return <Signup onSwitchToLogin={() => setAuthView("login")} />;
    }
    if (authView === "forgot") {
      return <ForgotPassword onBack={() => setAuthView("login")} />;
    }
    return (
      <Login
        onSwitchToSignup={() => setAuthView("signup")}
        onForgotPassword={() => setAuthView("forgot")}
      />
    );
  }

  // Session active — handle password-reset redirect (detected via PASSWORD_RECOVERY auth event)
  if (isPasswordRecovery) {
    return (
      <ForgotPassword
        isResetMode={true}
        onBack={() => {
          clearPasswordRecovery();
          window.history.replaceState({}, document.title, window.location.pathname);
        }}
      />
    );
  }

  // Logged in but no household yet — prompt to create one
  if (profile && !profile.household_id) {
    return <CreateHousehold />;
  }

  return <App />;
}

function App() {
  const { user, profile, household, householdId, signOut, householdMembers } = useAuth();
  const [extraMembers, setExtraMembers] = useState([]);
  const allMembers = useMemo(() => [...householdMembers, ...extraMembers], [householdMembers, extraMembers]);
  const MEMBER_COLORS = ["#3b82f6", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
  const getMemberColor = (name) => {
    const idx = allMembers.findIndex((m) => m.display_name === name);
    return MEMBER_COLORS[Math.max(0, idx) % MEMBER_COLORS.length];
  };
  const memberPillStyle = (name) => {
    if (!name) return { background: "rgba(148,163,184,0.12)", color: "#94a3b8" };
    const color = getMemberColor(name);
    return { background: `${color}22`, color };
  };
  const defaultSpentBy = profile?.display_name || allMembers[0]?.display_name || "";
  const [loggingOut, setLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setLoggingOut(true);
    await signOut();
    setLoggingOut(false);
  };

  // Supabase: expenses are loaded from the DB, not localStorage
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [view, setView] = useState("dashboard");
  const [form, setForm] = useState({ amount: "", description: "", category: "food", date: todayISO(), spentBy: profile?.display_name || "", isRecurring: false });
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterSpentBy, setFilterSpentBy] = useState("all");
  const [toast, setToast] = useState(null);
  const [currency] = useState("INR");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [analyticsMonth, setAnalyticsMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [budget, setBudget] = useState(0);
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState("all");
  const [exportMonth, setExportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [historyPageSize, setHistoryPageSize] = useState(50);
  const [catLimits, setCatLimits] = useState({});
  const [catLimitEditing, setCatLimitEditing] = useState(null);
  const [catLimitDraft, setCatLimitDraft] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [pieMonth, setPieMonth] = useState("all");
  const [selectedPieCat, setSelectedPieCat] = useState(null);

  // Reset pagination when filters/sort change
  useEffect(() => {
    setHistoryPageSize(50);
  }, [filterCat, filterMonth, filterSpentBy, searchQ, sortBy]);

  // Supabase: upsert a single settings row (household-scoped)
  const upsertSetting = async (key, value) => {
    await supabase
      .from("settings")
      .upsert({ key, value: JSON.stringify(value), household_id: householdId, updated_at: new Date().toISOString() }, { onConflict: "household_id,key" });
  };

  // Supabase: fetch settings (budget from household_budgets, catLimits from settings)
  const fetchSettings = async () => {
    const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

    // --- budget from household_budgets ---
    const { data: budgetRow } = await fetchHouseholdBudgetFn(householdId, currentMonthKey);
    if (budgetRow) {
      setBudget(parseFloat(budgetRow.budget_amount));
    } else {
      const lsBudget = localStorage.getItem("expenseBudget");
      if (lsBudget) {
        const val = parseFloat(lsBudget) || 0;
        setBudget(val);
        if (val > 0) await upsertHouseholdBudgetFn(householdId, currentMonthKey, val);
      }
      localStorage.removeItem("expenseBudget");
    }

    // --- catLimits from household-scoped settings ---
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("key, value")
      .eq("household_id", householdId);
    const map = Object.fromEntries((settingsRows || []).map((r) => [r.key, r.value]));
    const dbLimits = map["cat_limits"] ? JSON.parse(JSON.parse(map["cat_limits"])) : null;
    if (dbLimits !== null) {
      setCatLimits(dbLimits);
    } else {
      const lsLimits = localStorage.getItem("catLimits");
      if (lsLimits) {
        try {
          const val = JSON.parse(lsLimits);
          setCatLimits(val);
          await upsertSetting("cat_limits", val);
        } catch { /* ignore */ }
      }
      localStorage.removeItem("catLimits");
    }

    // --- extra partner names from settings ---
    const partnerNames = map["partner_names"] ? JSON.parse(map["partner_names"]) : [];
    setExtraMembers((partnerNames || []).map((n, idx) => ({ id: `extra-${idx}`, display_name: n })));
  };

  // Persist budget to household_budgets + local state
  const saveBudget = async (val) => {
    setBudget(val);
    const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    await upsertHouseholdBudgetFn(householdId, currentMonthKey, val);
  };

  // Save extra (non-account) household member names to settings
  const saveExtraMembers = async (names) => {
    setExtraMembers(names.map((n, idx) => ({ id: `extra-${idx}`, display_name: n })));
    await upsertSetting("partner_names", names);
  };

  // Persist catLimits to Supabase + local state
  const saveCatLimits = async (updater) => {
    setCatLimits((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      upsertSetting("cat_limits", next);
      return next;
    });
  };

  // Supabase: fetch all expenses for this household, ordered newest first
  const fetchExpenses = async () => {
    setLoading(true);
    setDbError(null);
    const { data, error } = await fetchExpensesService(householdId);
    if (error) {
      setDbError(error.message);
    } else {
      setExpenses(data.map(mapRow));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (householdId) {
      fetchExpenses();
      fetchSettings();
    }
  }, [householdId]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // Supabase: insert new or update existing expense
  const saveExpense = async (addAnother = false) => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0 || !form.description.trim()) {
      showToast("Please fill in amount and description.", "error");
      return;
    }
    const encodedNotes = form.isRecurring ? form.description + "||r" : form.description;
    setIsSaving(true);
    if (editId) {
      const { error } = await updateExpenseService({
        id: editId, amount, category: form.category, date: form.date,
        notes: encodedNotes, spentBy: form.spentBy, householdId,
      });
      if (error) { showToast("Failed to update expense.", "error"); setIsSaving(false); return; }
      setExpenses((prev) => prev.map((e) => (e.id === editId ? { ...e, ...form, amount } : e)));
      showToast("Expense updated!");
      setEditId(null);
    } else {
      const { data, error } = await insertExpense({
        amount, category: form.category, date: form.date, notes: encodedNotes,
        spentBy: form.spentBy, householdId, userId: user.id,
      });
      if (error) { showToast("Failed to add expense.", "error"); setIsSaving(false); return; }
      setExpenses((prev) => [mapRow(data), ...prev]);
      showToast("Expense added!");
    }
    setIsSaving(false);
    setForm({ amount: "", description: "", category: "food", date: todayISO(), spentBy: defaultSpentBy, isRecurring: false });
    if (!addAnother) setView("dashboard");
  };

  // Supabase: delete expense by id (scoped to household)
  const deleteExpense = async (id) => {
    setIsSaving(true);
    const { error } = await deleteExpenseService({ id, householdId });
    if (error) { showToast("Failed to delete expense.", "error"); setDeleteConfirm(null); setIsSaving(false); return; }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setDeleteConfirm(null);
    setIsSaving(false);
    showToast("Expense deleted.", "info");
  };

  const startEdit = (e) => {
    setForm({ amount: String(e.amount), description: e.description, category: e.category, date: e.date, spentBy: e.spentBy || defaultSpentBy, isRecurring: e.isRecurring || false });
    setEditId(e.id);
    setView("add");
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm({ amount: "", description: "", category: "food", date: todayISO(), spentBy: defaultSpentBy, isRecurring: false });
    setView("history");
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const prevMonth = prevMonthDate.getMonth();
  const prevYear = prevMonthDate.getFullYear();

  const thisMonthExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }),
    [expenses, currentMonth, currentYear]
  );

  const totalThisMonth = useMemo(() => thisMonthExpenses.reduce((s, e) => s + e.amount, 0), [thisMonthExpenses]);
  const totalAll = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const averageSpend = useMemo(() => (expenses.length ? totalAll / expenses.length : 0), [expenses, totalAll]);

  const todayStr = useMemo(() => todayISO(), []);
  const todayTotal = useMemo(
    () => expenses.filter((e) => e.date === todayStr).reduce((s, e) => s + e.amount, 0),
    [expenses, todayStr]
  );
  const weekStartStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split("T")[0];
  }, []);
  const thisWeekTotal = useMemo(
    () => expenses.filter((e) => e.date >= weekStartStr).reduce((s, e) => s + e.amount, 0),
    [expenses, weekStartStr]
  );
  const largestThisMonth = useMemo(
    () => thisMonthExpenses.reduce((max, e) => (!max || e.amount > max.amount ? e : max), null),
    [thisMonthExpenses]
  );

  const catTotals = useMemo(() => {
    const map = {};
    thisMonthExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return CATEGORIES.map((c) => ({ ...c, total: map[c.id] || 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [thisMonthExpenses]);

  const allTimeCategoryTotals = useMemo(() => {
    const map = {};
    expenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return CATEGORIES.map((c) => ({ ...c, total: map[c.id] || 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const filteredPieCatTotals = useMemo(() => {
    const src = pieMonth === "all" ? expenses : expenses.filter((e) => e.date.startsWith(pieMonth));
    const map = {};
    src.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return CATEGORIES.map((c) => ({ ...c, total: map[c.id] || 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [expenses, pieMonth]);

  const pieCatExpenses = useMemo(() => {
    if (!selectedPieCat) return [];
    return expenses
      .filter((e) => e.category === selectedPieCat && (pieMonth === "all" || e.date.startsWith(pieMonth)))
      .sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [expenses, selectedPieCat, pieMonth]);

  const last6Months = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(currentYear, currentMonth - (5 - i), 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const total = expenses
        .filter((e) => {
          const ed = new Date(e.date);
          return ed.getMonth() === m && ed.getFullYear() === y;
        })
        .reduce((s, e) => s + e.amount, 0);
      return { label: MONTHS[m], total };
    });
  }, [expenses, currentMonth, currentYear]);

  const maxBar = Math.max(...last6Months.map((x) => x.total), 1);

  const availableMonths = useMemo(() => {
    const set = new Set(expenses.map((e) => e.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (filterCat !== "all" && e.category !== filterCat) return false;
      if (filterMonth !== "all" && !e.date.startsWith(filterMonth)) return false;
      if (filterSpentBy !== "all" && e.spentBy !== filterSpentBy) return false;
      if (searchQ && !e.description.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });
  }, [expenses, filterCat, filterMonth, filterSpentBy, searchQ]);

  const sortedFilteredExpenses = useMemo(() => {
    const arr = [...filteredExpenses];
    if (sortBy === "date-desc") arr.sort((a, b) => b.date.localeCompare(a.date));
    else if (sortBy === "date-asc") arr.sort((a, b) => a.date.localeCompare(b.date));
    else if (sortBy === "amount-desc") arr.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "amount-asc") arr.sort((a, b) => a.amount - b.amount);
    return arr;
  }, [filteredExpenses, sortBy]);

  const doExport = (rows, filename) => {
    const header = "Date,Description,Category,Amount,Spent By\n";
    const body = rows
      .map((e) => `${e.date},"${e.description.replace(/"/g, '""')}","${getCat(e.category).label}",${e.amount},"${e.spentBy || "Shravan"}"`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported!");
  };

  const handleExport = () => {
    let filtered = expenses;
    let filename = "expenses-all.csv";
    if (exportMode === "month") {
      filtered = expenses.filter((e) => e.date.startsWith(exportMonth));
      filename = `expenses-${exportMonth}.csv`;
    } else if (exportMode === "range") {
      filtered = expenses.filter((e) => {
        if (exportFrom && e.date < exportFrom) return false;
        if (exportTo && e.date > exportTo) return false;
        return true;
      });
      const label = exportFrom || exportTo ? `${exportFrom || "start"}_to_${exportTo || "end"}` : "custom";
      filename = `expenses-${label}.csv`;
    }
    doExport(filtered, filename);
    setExportOpen(false);
  };

  const recentExpenses = expenses.slice(0, 5);
  const topCategory = catTotals[0] || null;
  const currencyMeta = getCurrencyMeta(currency);
  const largestExpense = useMemo(
    () => expenses.reduce((max, item) => (!max || item.amount > max.amount ? item : max), null),
    [expenses]
  );
  const monthlyAverage = useMemo(
    () => last6Months.reduce((sum, item) => sum + item.total, 0) / last6Months.length,
    [last6Months]
  );
  const pieGradient = useMemo(() => buildPieGradient(filteredPieCatTotals), [filteredPieCatTotals]);
  const filtersActive = filterCat !== "all" || filterMonth !== "all" || filterSpentBy !== "all" || searchQ.trim() !== "";

  const pagedExpenses = useMemo(
    () => sortedFilteredExpenses.slice(0, historyPageSize),
    [sortedFilteredExpenses, historyPageSize]
  );

  const catLimitAlerts = useMemo(() => {
    return catTotals
      .filter((c) => catLimits[c.id] && c.total > catLimits[c.id])
      .map((c) => ({ ...c, limit: catLimits[c.id], over: c.total - catLimits[c.id] }));
  }, [catTotals, catLimits]);

  const personMonthTotals = useMemo(() => {
    const monthExpenses = expenses.filter((e) => e.date.startsWith(analyticsMonth));
    const totals = {};
    monthExpenses.forEach((e) => {
      if (e.spentBy) totals[e.spentBy] = (totals[e.spentBy] || 0) + e.amount;
    });
    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
    return {
      rows: allMembers.map((m, i) => ({
        name: m.display_name,
        color: MEMBER_COLORS[i % MEMBER_COLORS.length],
        total: totals[m.display_name] || 0,
      })),
      grandTotal,
    };
  }, [expenses, analyticsMonth, allMembers]);

  const thisMonthByPerson = useMemo(() => {
    const totals = {};
    thisMonthExpenses.forEach((e) => {
      if (e.spentBy) totals[e.spentBy] = (totals[e.spentBy] || 0) + e.amount;
    });
    return allMembers.map((m, i) => ({
      name: m.display_name,
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      total: totals[m.display_name] || 0,
    }));
  }, [thisMonthExpenses, allMembers]);

  const prevMonthExpenses = useMemo(
    () => expenses.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    }),
    [expenses, prevMonth, prevYear]
  );

  const prevMonthTotal = useMemo(() => prevMonthExpenses.reduce((s, e) => s + e.amount, 0), [prevMonthExpenses]);

  const monthDelta = useMemo(() => {
    if (!prevMonthTotal) return null;
    return ((totalThisMonth - prevMonthTotal) / prevMonthTotal) * 100;
  }, [totalThisMonth, prevMonthTotal]);

  const prevMonthByPerson = useMemo(() => {
    const totals = {};
    prevMonthExpenses.forEach((e) => {
      if (e.spentBy) totals[e.spentBy] = (totals[e.spentBy] || 0) + e.amount;
    });
    return allMembers.map((m, i) => ({
      name: m.display_name,
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      total: totals[m.display_name] || 0,
    }));
  }, [prevMonthExpenses, allMembers]);

  const prevTopCategory = useMemo(() => {
    const map = {};
    prevMonthExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return CATEGORIES.map((c) => ({ ...c, total: map[c.id] || 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)[0] || null;
  }, [prevMonthExpenses]);

  const budgetPct = budget > 0 ? Math.min((totalThisMonth / budget) * 100, 100) : 0;
  const budgetColor = budgetPct >= 90 ? "#ef4444" : budgetPct >= 70 ? "#f59e0b" : "#22c55e";

  return (
    <div className="app">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">Delete this expense?</p>
            <p className="modal-sub">This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => deleteExpense(deleteConfirm)} disabled={isSaving}>
                {isSaving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div className="modal-overlay" onClick={() => setExportOpen(false)}>
          <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">Export CSV</p>
            <p className="modal-sub">Choose what to include in the export.</p>

            <div className="export-options">
              {[["all", "All time"], ["month", "By month"], ["range", "Date range"]].map(([mode, label]) => (
                <label key={mode} className={`export-option${exportMode === mode ? " selected" : ""}`}>
                  <input
                    type="radio"
                    name="exportMode"
                    value={mode}
                    checked={exportMode === mode}
                    onChange={() => setExportMode(mode)}
                  />
                  {label}
                </label>
              ))}
            </div>

            {exportMode === "month" && (
              <div className="export-field">
                <label className="form-label">Select month</label>
                <select
                  className="form-input"
                  value={exportMonth}
                  onChange={(e) => setExportMonth(e.target.value)}
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {exportMode === "range" && (
              <div className="export-range">
                <div className="export-field">
                  <label className="form-label">From</label>
                  <input
                    className="form-input"
                    type="date"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                  />
                </div>
                <div className="export-field">
                  <label className="form-label">To</label>
                  <input
                    className="form-input"
                    type="date"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="export-preview">
              {(() => {
                let count = expenses.length;
                if (exportMode === "month") count = expenses.filter((e) => e.date.startsWith(exportMonth)).length;
                else if (exportMode === "range") count = expenses.filter((e) => {
                  if (exportFrom && e.date < exportFrom) return false;
                  if (exportTo && e.date > exportTo) return false;
                  return true;
                }).length;
                return <span>{count} row{count === 1 ? "" : "s"} will be exported</span>;
              })()}
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setExportOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExport}>Download CSV</button>
            </div>
          </div>
        </div>
      )}

      <header className="header">
        <div className="header-inner">
          <div className="logo-wrap" onClick={() => { if (editId) cancelEdit(); setView("dashboard"); }} style={{ cursor: "pointer" }}>
            <div className="logo">
              <span className="logo-icon">
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="13" cy="13" r="10.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5"/>
                  <text x="13" y="18" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="14" fill="white">S</text>
                </svg>
              </span>
              <div>
                <span className="logo-text">Spendly</span>
                <span className="logo-sub">{household?.name || "Household Tracker"}</span>
              </div>
            </div>
          </div>
          <nav className="nav">
            {[["dashboard", "Dashboard"], ["add", editId ? "Edit" : "Add"], ["history", "History"], ["analytics", "Analytics"]].map(([v, l]) => (
              <button
                key={v}
                className={`nav-btn ${view === v ? "active" : ""}`}
                onClick={() => {
                  if (v !== "add" && editId) cancelEdit();
                  else setView(v);
                }}
              >
                {l}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button className="export-btn" onClick={() => setExportOpen(true)}>
              Export CSV ↓
            </button>
            <div className="user-area">
              <span className="user-name">{profile?.display_name || user?.email?.split("@")[0] || "Account"}</span>
              <button
                className="btn btn-ghost btn-sm logout-btn"
                onClick={handleSignOut}
                disabled={loggingOut}
                title="Sign out"
              >
                {loggingOut ? "…" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Supabase: loading and error states */}
        {loading && (
          <div className="page">
            <div className="stat-grid" style={{ marginBottom: 24 }}>
              {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton-row skeleton-stat" />)}
            </div>
            <div className="card" style={{ padding: 20 }}>
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton-row" style={{ marginBottom: 10 }} />)}
            </div>
          </div>
        )}
        {!loading && dbError && (
          <div className="db-error">
            Could not load data — {dbError}.
            <button className="link" onClick={fetchExpenses}> Retry</button>
          </div>
        )}
        {!loading && view === "dashboard" && (
          <div className="page">
            <section className="hero-card">
              <div className="hero-copy">
                <span className="eyebrow">🏡 {household?.name || "Home"} · {MONTHS[currentMonth]} {currentYear}</span>
                <h1 className="hero-title">Shared expenses, tracked together.</h1>
                <p className="hero-sub">
                  A shared space for{" "}
                  {allMembers.length > 0
                    ? allMembers.map((m, i) => (
                        <span key={m.id}>{i > 0 && " & "}<strong>{m.display_name}</strong></span>
                      ))
                    : <strong>{household?.name || "your household"}</strong>
                  }{" "}
                  to log, track, and stay on top of household spending — all in one place.
                </p>
                <div className="hero-actions">
                  <button className="btn btn-primary" onClick={() => setView("add")}>Add Expense</button>
                  <button className="btn btn-ghost" onClick={() => setView("history")}>Open History</button>
                </div>
              </div>
              <div className="hero-panel">
                <div className="hero-home-deco">🏡</div>
                <div className="hero-panel-label">This month</div>
                <div className="hero-panel-value">{fmt(totalThisMonth, currency)}</div>
                <div className="hero-panel-meta">
                  {thisMonthExpenses.length} transaction{thisMonthExpenses.length === 1 ? "" : "s"}
                </div>
                <div className="hero-mini-stats">
                  <div>
                    <span>Top category</span>
                    <strong>{topCategory ? `${topCategory.icon} ${topCategory.label.split("/")[0]}` : "—"}</strong>
                  </div>
                  <div>
                    <span>Average entry</span>
                    <strong>{fmt(averageSpend, currency)}</strong>
                  </div>
                </div>
              </div>
            </section>

            <div className="stat-grid modern-grid">
              <div className="stat-card accent soft-glow">
                <span className="stat-label">This Month</span>
                <span className="stat-value">{fmt(totalThisMonth, currency)}</span>
                <span className="stat-meta">
                  {thisMonthExpenses.length} transactions
                  {monthDelta !== null && (
                    <span className={`delta-badge ${monthDelta >= 0 ? "delta-up" : "delta-down"}`}>
                      {monthDelta >= 0 ? "▲" : "▼"} {Math.abs(monthDelta).toFixed(1)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">All Time</span>
                <span className="stat-value">{fmt(totalAll, currency)}</span>
                <span className="stat-meta">{expenses.length} total entries</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Daily Avg</span>
                <span className="stat-value">{fmt(totalThisMonth / (now.getDate() || 1), currency)}</span>
                <span className="stat-meta">current month pace</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Top Category</span>
                <span className="stat-value">{topCategory ? `${getCat(topCategory.id).icon} ${getCat(topCategory.id).label.split("/")[0]}` : "—"}</span>
                <span className="stat-meta">{topCategory ? fmt(topCategory.total, currency) : "no data yet"}</span>
              </div>
              {thisMonthByPerson.map((p) => (
                <div key={p.name} className="stat-card">
                  <span className="stat-label" style={{ color: p.color }}>● {p.name}</span>
                  <span className="stat-value" style={{ color: p.color }}>{fmt(p.total, currency)}</span>
                  <span className="stat-meta">this month</span>
                </div>
              ))}
              <div className="stat-card">
                <span className="stat-label">Today</span>
                <span className="stat-value">{fmt(todayTotal, currency)}</span>
                <span className="stat-meta">{expenses.filter((e) => e.date === todayStr).length} transactions</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">This Week</span>
                <span className="stat-value">{fmt(thisWeekTotal, currency)}</span>
                <span className="stat-meta">since {new Date(weekStartStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Largest (this month)</span>
                <span className="stat-value" style={{ fontSize: "18px" }}>{largestThisMonth ? fmt(largestThisMonth.amount, currency) : "—"}</span>
                <span className="stat-meta">{largestThisMonth ? largestThisMonth.description : "no expenses yet"}</span>
              </div>
            </div>

            <div className="card members-card elevated-card">
              <div className="budget-header">
                <span className="budget-title">Household Members</span>
              </div>
              <div className="members-chips">
                {allMembers.map((m, i) => {
                  const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
                  const isExtra = m.id.toString().startsWith("extra-");
                  return (
                    <span key={m.id} className="member-chip" style={{ background: `${color}18`, color, borderColor: `${color}55` }}>
                      {m.display_name}
                      {isExtra && (
                        <button
                          className="member-chip-remove"
                          aria-label={`Remove ${m.display_name}`}
                          onClick={() => {
                            const names = extraMembers.filter((x) => x.id !== m.id).map((x) => x.display_name);
                            saveExtraMembers(names);
                          }}
                        >×</button>
                      )}
                    </span>
                  );
                })}
              </div>
              <div className="member-add-row">
                <input
                  className="form-input member-add-input"
                  type="text"
                  placeholder="Add partner name…"
                  value={memberInput}
                  maxLength={40}
                  onChange={(e) => setMemberInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const name = memberInput.trim();
                      if (name && !allMembers.some((m) => m.display_name.toLowerCase() === name.toLowerCase())) {
                        saveExtraMembers([...extraMembers.map((x) => x.display_name), name]);
                        setMemberInput("");
                      }
                    }
                  }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const name = memberInput.trim();
                    if (name && !allMembers.some((m) => m.display_name.toLowerCase() === name.toLowerCase())) {
                      saveExtraMembers([...extraMembers.map((x) => x.display_name), name]);
                      setMemberInput("");
                    }
                  }}
                >Add</button>
              </div>
            </div>

            <div className="card budget-card elevated-card">
              <div className="budget-header">
                <span className="budget-title">Monthly Budget</span>
                {!budgetEditing && budget === 0 && (
                  <button className="link" onClick={() => { setBudgetDraft(""); setBudgetEditing(true); }}>Set budget →</button>
                )}
                {!budgetEditing && budget > 0 && (
                  <button className="link" onClick={() => { setBudgetDraft(String(budget)); setBudgetEditing(true); }}>Edit</button>
                )}
              </div>
              {budgetEditing ? (
                <div className="budget-edit-row">
                  <span className="budget-edit-prefix">{currencyMeta.symbol}</span>
                  <input
                    className="form-input budget-input"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Enter monthly budget"
                    value={budgetDraft}
                    autoFocus
                    onChange={(e) => setBudgetDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { saveBudget(parseFloat(budgetDraft) || 0); setBudgetEditing(false); }
                      if (e.key === "Escape") setBudgetEditing(false);
                    }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => { saveBudget(parseFloat(budgetDraft) || 0); setBudgetEditing(false); }}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setBudgetEditing(false)}>Cancel</button>
                </div>
              ) : budget > 0 ? (
                <div className="budget-progress-wrap">
                  <div className="budget-amounts">
                    <span>{fmt(totalThisMonth, currency)} <span className="budget-of">of</span> {fmt(budget, currency)}</span>
                    <span className="budget-remaining-label" style={{ color: budgetColor }}>
                      {totalThisMonth > budget ? `${fmt(totalThisMonth - budget, currency)} over budget` : `${fmt(budget - totalThisMonth, currency)} remaining`}
                    </span>
                  </div>
                  <div className="budget-bar-bg">
                    <div className="budget-bar-fill" style={{ width: `${budgetPct}%`, background: budgetColor }} />
                  </div>
                  <div className="budget-pct-label" style={{ color: budgetColor }}>{Math.round(budgetPct)}% used</div>
                </div>
              ) : (
                <p className="budget-empty-text">No budget set. Set one to track your monthly spending progress.</p>
              )}
            </div>

            <div className="dashboard-grid">
              <div className="card feature-card">
                <div className="card-headline-row">
                  <div>
                    <h2 className="card-title">Recent Transactions</h2>
                    <p className="card-subtitle">Your latest activity across categories.</p>
                  </div>
                  {expenses.length > 5 && (
                    <button className="chip-btn" onClick={() => setView("history")}>View all</button>
                  )}
                </div>
                {recentExpenses.length === 0 ? (
                  <div className="empty">No expenses yet. <button className="link" onClick={() => setView("add")}>Add one →</button></div>
                ) : (
                  <ul className="tx-list tx-list-modern">
                    {recentExpenses.map((e) => {
                      const cat = getCat(e.category);
                      return (
                        <li key={e.id} className="tx-item tx-item-modern">
                          <span className="tx-icon" style={{ background: `${cat.color}22`, color: cat.color }}>{cat.icon}</span>
                          <div className="tx-info">
                          <span className="tx-desc">{e.description}{e.isRecurring && <span className="recurring-badge" title="Recurring">🔁</span>}</span>
                            <span className="tx-date">{fmtDate(e.date)} · {cat.label}</span>
                          </div>
                          <span className="spent-pill" style={memberPillStyle(e.spentBy)}>{e.spentBy || "—"}</span>
                          <span className="tx-amount">{fmt(e.amount, currency)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="card feature-card spotlight-card">
                <div className="card-headline-row">
                  <div>
                    <h2 className="card-title">This Month by Category</h2>
                    <p className="card-subtitle">Where most of your budget is going this month.</p>
                  </div>
                </div>
                {catLimitAlerts.length > 0 && (
                  <div className="cat-limit-alert-banner">
                    ⚠️ Over limit: {catLimitAlerts.map((a) => `${a.icon} ${a.label.split("/")[0]}`).join(", ")}
                  </div>
                )}
                {catTotals.length === 0 ? (
                  <div className="empty">No data for this month.</div>
                ) : (
                  <ul className="cat-list cat-list-modern">
                    {catTotals.map((c) => {
                      const limit = catLimits[c.id];
                      const isOver = limit && c.total > limit;
                      return (
                        <li key={c.id} className={`cat-item modern-cat-item${isOver ? " cat-over-limit" : ""}`}>
                          <div className="cat-row">
                            <span className="cat-icon modern-cat-icon" style={{ background: `${c.color}20`, color: c.color }}>{c.icon}</span>
                            <span className="cat-name">{c.label}</span>
                            {isOver && <span className="cat-over-badge">⚠️ Over</span>}
                            <span className="cat-amt">{fmt(c.total, currency)}</span>
                          </div>
                          <div className="cat-bar-bg">
                            <div className="cat-bar-fill" style={{ width: `${(c.total / totalThisMonth) * 100}%`, background: isOver ? "#ef4444" : c.color }} />
                          </div>
                          {limit && (
                            <div className="cat-limit-row">
                              <span className="cat-limit-label">Limit: {fmt(limit, currency)}</span>
                              <span className={`cat-limit-remaining ${isOver ? "over" : ""}`}>
                                {isOver ? `${fmt(c.total - limit, currency)} over` : `${fmt(limit - c.total, currency)} left`}
                              </span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && view === "add" && (
          <div className="page page-narrow">
            <div className="page-header">
              <div>
                <h1 className="page-title">{editId ? "Edit Expense" : "Add Expense"}</h1>
                <p className="page-sub">Keep entries short and easy to scan later.</p>
              </div>
              {editId && <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
            </div>
            <div className="card form-card elevated-card">
              <div className="form-group">
                <label className="form-label">Amount ({currency})</label>
                <div className="amount-wrap">
                  <span className="amount-prefix">{currencyMeta.symbol}</span>
                  <input
                    className="form-input amount-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="What did you spend on?"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <div className="cat-grid">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`cat-chip ${form.category === c.id ? "selected" : ""}`}
                      style={form.category === c.id ? { borderColor: c.color, background: `${c.color}18`, color: c.color } : {}}
                      onClick={() => setForm((f) => ({ ...f, category: c.id }))}
                    >
                      {c.icon} {c.label.split("/")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Spent by</label>
                <div className="spentby-toggle">
                  {allMembers.map((m, i) => {
                    const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
                    const isActive = form.spentBy === m.display_name;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`spentby-btn${isActive ? " active" : ""}`}
                        style={isActive ? { borderColor: color, background: `${color}18`, color } : {}}
                        onClick={() => setForm((f) => ({ ...f, spentBy: m.display_name }))}
                      >
                        {m.display_name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Recurring expense</label>
                <button
                  type="button"
                  className={`recurring-toggle${form.isRecurring ? " active" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, isRecurring: !f.isRecurring }))}
                >
                  🔁 {form.isRecurring ? "Yes — this repeats every month" : "No — one-time expense"}
                </button>
              </div>

              <div className="form-actions-row">
                <button className="btn btn-primary btn-full" onClick={() => saveExpense(false)} disabled={isSaving}>
                  {isSaving ? "Saving…" : editId ? "Save Changes" : "Add Expense"}
                </button>
                {!editId && (
                  <button className="btn btn-ghost btn-full" onClick={() => saveExpense(true)} disabled={isSaving}>
                    Save &amp; Add Another
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && view === "history" && (
          <div className="page">
            <div className="page-header">
              <div>
                <h1 className="page-title">Transaction History</h1>
                <p className="page-sub">Search, filter, edit, and manage all entries.</p>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span className="badge">{sortedFilteredExpenses.length} entries</span>
                <span className="badge history-total-badge">Total: {fmt(sortedFilteredExpenses.reduce((sum, e) => sum + e.amount, 0), currency)}</span>
              </div>
            </div>

            <div className="filters card filter-card">
              <input className="form-input search-input" type="text" placeholder="Search description" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
              <select className="form-input" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
              <select className="form-input" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                <option value="all">All months</option>
                {availableMonths.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="form-input" value={filterSpentBy} onChange={(e) => setFilterSpentBy(e.target.value)}>
                <option value="all">All members</option>
                {allMembers.map((m) => (
                  <option key={m.id} value={m.display_name}>{m.display_name}</option>
                ))}
              </select>
              <select className="form-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort by">
                <option value="date-desc">Date: Newest first</option>
                <option value="date-asc">Date: Oldest first</option>
                <option value="amount-desc">Amount: High to low</option>
                <option value="amount-asc">Amount: Low to high</option>
              </select>
              {filtersActive && (
                <button className="btn btn-ghost btn-reset" onClick={() => { setFilterCat("all"); setFilterMonth("all"); setFilterSpentBy("all"); setSearchQ(""); }}>
                  Clear filters
                </button>
              )}
            </div>

            {sortedFilteredExpenses.length === 0 ? (
              <div className="card empty">No transactions found.</div>
            ) : (
              <div className="card elevated-card">
                <ul className="tx-list tx-list-full">
                  {pagedExpenses.map((e) => {
                    const cat = getCat(e.category);
                    return (
                      <li key={e.id} className="tx-item tx-item-modern tx-item-history">
                        <span className="tx-icon" style={{ background: `${cat.color}22`, color: cat.color }}>{cat.icon}</span>
                        <div className="tx-info">
                          <span className="tx-desc">{e.description}{e.isRecurring && <span className="recurring-badge" title="Recurring">🔁</span>}</span>
                          <span className="tx-date">{fmtDate(e.date)} · {cat.label}</span>
                        </div>
                        <span className="spent-pill" style={memberPillStyle(e.spentBy)}>{e.spentBy || "—"}</span>
                        <span className="tx-amount">{fmt(e.amount, currency)}</span>
                        <div className="tx-actions visible-actions">
                          <button className="icon-btn" title="Edit" onClick={() => startEdit(e)}>✏️</button>
                          <button className="icon-btn" title="Delete" onClick={() => setDeleteConfirm(e.id)}>🗑️</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {sortedFilteredExpenses.length > historyPageSize && (
                  <div className="load-more-row">
                    <span className="load-more-count">Showing {historyPageSize} of {sortedFilteredExpenses.length}</span>
                    <button className="btn btn-ghost load-more-btn" onClick={() => setHistoryPageSize((n) => n + 50)}>
                      Load 50 more
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && view === "analytics" && (
          <div className="page">
            <div className="page-header">
              <div>
                <h1 className="page-title">Analytics</h1>
                <p className="page-sub">A quick visual of your spending trends.</p>
              </div>
            </div>

            <div className="analytics-insights">
              <div className="insight-card">
                <span className="insight-label">Largest expense</span>
                <strong className="insight-value">{largestExpense ? fmt(largestExpense.amount, currency) : "—"}</strong>
                <span className="insight-sub">{largestExpense ? `${largestExpense.description} · ${fmtDate(largestExpense.date)}` : "No transactions yet"}</span>
              </div>
              <div className="insight-card">
                <span className="insight-label">6-month average</span>
                <strong className="insight-value">{fmt(monthlyAverage, currency)}</strong>
                <span className="insight-sub">Average monthly spend across the last 6 months</span>
              </div>
              <div className="insight-card">
                <span className="insight-label">Most used category</span>
                <strong className="insight-value">{allTimeCategoryTotals[0] ? `${allTimeCategoryTotals[0].icon} ${allTimeCategoryTotals[0].label.split("/")[0]}` : "—"}</strong>
                <span className="insight-sub">{allTimeCategoryTotals[0] ? fmt(allTimeCategoryTotals[0].total, currency) : "No category data yet"}</span>
              </div>
            </div>

            <div className="card elevated-card month-compare-card">
              <div className="card-headline-row">
                <div>
                  <h2 className="card-title">This Month vs Last Month</h2>
                  <p className="card-subtitle">Side-by-side comparison of key spending metrics.</p>
                </div>
                {monthDelta !== null && (
                  <span className={`delta-badge delta-badge-lg ${monthDelta >= 0 ? "delta-up" : "delta-down"}`}>
                    {monthDelta >= 0 ? "▲" : "▼"} {Math.abs(monthDelta).toFixed(1)}% vs last month
                  </span>
                )}
              </div>
              <div className="month-compare-grid">
                {[
                  { label: `${MONTHS[currentMonth]} ${currentYear}`, total: totalThisMonth, count: thisMonthExpenses.length, topCat: topCategory, byPerson: thisMonthByPerson, isCurrent: true },
                  { label: `${MONTHS[prevMonth]} ${prevYear}`, total: prevMonthTotal, count: prevMonthExpenses.length, topCat: prevTopCategory, byPerson: prevMonthByPerson, isCurrent: false },
                ].map((col) => (
                  <div key={col.label} className={`month-compare-col${col.isCurrent ? " month-compare-current" : ""}`}>
                    <div className="month-compare-col-label">{col.label}</div>
                    <div className="month-compare-total">{fmt(col.total, currency)}</div>
                    <div className="month-compare-meta">{col.count} transaction{col.count === 1 ? "" : "s"}</div>
                    <div className="month-compare-rows">
                      <div className="month-compare-row">
                        <span className="month-compare-key">Top category</span>
                        <span className="month-compare-val">{col.topCat ? `${col.topCat.icon} ${col.topCat.label.split("/")[0]}` : "—"}</span>
                      </div>
                      {col.byPerson.map((p) => (
                        <div key={p.name} className="month-compare-row">
                          <span className="month-compare-key">{p.emoji} {p.name}</span>
                          <span className="month-compare-val" style={{ color: p.color }}>{fmt(p.total, currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card elevated-card">
              <div className="card-headline-row">
                <div>
                  <h2 className="card-title">Spending — Last 6 Months</h2>
                  <p className="card-subtitle">Month-over-month movement of your expenses.</p>
                </div>
              </div>
              <div className="bar-chart">
                {last6Months.map((m, i) => (
                  <div key={i} className="bar-col">
                    <span className="bar-value">{m.total > 0 ? fmt(m.total, currency) : ""}</span>
                    <div className="bar-outer">
                      <div className="bar-inner" style={{ height: `${(m.total / maxBar) * 100}%` }} />
                    </div>
                    <span className="bar-label">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="two-col analytics-two-col">
              <div className="card elevated-card">
                <div className="card-headline-row">
                  <div>
                    <h2 className="card-title">Spending by Category</h2>
                  </div>
                  <select
                    className="form-input analytics-month-select"
                    value={pieMonth}
                    onChange={(e) => { setPieMonth(e.target.value); setSelectedPieCat(null); }}
                  >
                    <option value="all">All Time</option>
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {filteredPieCatTotals.length === 0 ? (
                  <div className="empty">No data{pieMonth !== "all" ? ` for ${pieMonth}` : ""} yet.</div>
                ) : (() => {
                  const pieTotal = filteredPieCatTotals.reduce((s, c) => s + c.total, 0);
                  return (
                    <>
                      <div className="pie-layout">
                        <div className="pie-wrap">
                          <div className="pie-chart" style={{ background: pieGradient }}>
                            <div className="pie-hole">
                              <span>{pieMonth === "all" ? "Total" : pieMonth}</span>
                              <strong>{fmt(pieTotal, currency)}</strong>
                            </div>
                          </div>
                        </div>
                        <ul className="legend-list">
                          {filteredPieCatTotals.map((c) => {
                            const pct = Math.round((c.total / pieTotal) * 100);
                            const isActive = selectedPieCat === c.id;
                            return (
                              <li
                                key={c.id}
                                className={`legend-item legend-item-btn${isActive ? " legend-item-active" : ""}`}
                                onClick={() => setSelectedPieCat(isActive ? null : c.id)}
                                style={{ cursor: "pointer" }}
                              >
                                <span className="legend-dot" style={{ background: c.color }} />
                                <span className="legend-name">{c.icon} {c.label}</span>
                                <span className="legend-meta">{pct}% · {fmt(c.total, currency)}</span>
                                {isActive && <span className="legend-chevron">▾</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {selectedPieCat && (() => {
                        const catMeta = CATEGORIES.find((x) => x.id === selectedPieCat);
                        return (
                          <div className="pie-drilldown">
                            <div className="pie-drilldown-header">
                              <span style={{ color: catMeta?.color }}>{catMeta?.icon} {catMeta?.label}</span>
                              <span className="pie-drilldown-count">{pieCatExpenses.length} transaction{pieCatExpenses.length !== 1 ? "s" : ""}</span>
                              <button className="link pie-drilldown-close" onClick={() => setSelectedPieCat(null)}>✕ Close</button>
                            </div>
                            {pieCatExpenses.length === 0 ? (
                              <p className="empty" style={{ fontSize: "0.85rem" }}>No transactions found.</p>
                            ) : (
                              <ul className="pie-drilldown-list">
                                {pieCatExpenses.map((e) => (
                                  <li key={e.id} className="pie-drilldown-row">
                                    <span className="pie-dd-date">{e.date}</span>
                                    <span className="pie-dd-desc">{e.description}{e.isRecurring ? " 🔁" : ""}</span>
                                    <span className="pie-dd-person" style={memberPillStyle(e.spentBy)}>{e.spentBy || "—"}</span>
                                    <span className="pie-dd-amt">{fmt(e.amount, currency)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>

              <div className="card elevated-card">
                <h2 className="card-title">Monthly Breakdown</h2>
                <p className="card-subtitle analytics-subcopy">See which recent months were heavier than others.</p>
                {last6Months.every((m) => m.total === 0) ? (
                  <div className="empty">No data yet.</div>
                ) : (
                  <ul className="cat-list cat-list-modern">
                    {last6Months.slice().reverse().map((m, i) => (
                      <li key={i} className="cat-item modern-cat-item">
                        <div className="cat-row">
                          <span className="cat-name">{m.label}</span>
                          <span className="cat-amt">{fmt(m.total, currency)}</span>
                        </div>
                        <div className="cat-bar-bg">
                          <div className="cat-bar-fill" style={{ width: `${(m.total / maxBar) * 100}%`, background: "linear-gradient(90deg, #60a5fa, #8b5cf6)" }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="card elevated-card person-month-card">
              <div className="person-month-header">
                <div>
                  <h2 className="card-title">Who Spent How Much</h2>
                  <p className="card-subtitle">Per-person spending breakdown for the selected month.</p>
                </div>
                <select
                  className="form-input analytics-month-select"
                  value={analyticsMonth}
                  onChange={(e) => setAnalyticsMonth(e.target.value)}
                  aria-label="Select month"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {personMonthTotals.grandTotal === 0 ? (
                <div className="empty">No expenses recorded for this month.</div>
              ) : (
                <div className="person-month-body">
                  <div className="person-month-total-row">
                    <span className="person-month-total-label">Combined total</span>
                    <span className="person-month-total-value">{fmt(personMonthTotals.grandTotal, currency)}</span>
                  </div>
                  <ul className="person-month-list">
                    {personMonthTotals.rows.map((p) => {
                      const pct = personMonthTotals.grandTotal > 0 ? (p.total / personMonthTotals.grandTotal) * 100 : 0;
                      return (
                        <li key={p.name} className="person-month-item">
                          <div className="person-month-row">
                            <span className={`person-month-pill`} style={memberPillStyle(p.name)}>{p.name}</span>
                            <span className="person-month-amt">{fmt(p.total, currency)}</span>
                            <span className="person-month-pct">{Math.round(pct)}%</span>
                          </div>
                          <div className="cat-bar-bg">
                            <div className="cat-bar-fill" style={{ width: `${pct}%`, background: p.color }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {[
          ["dashboard", "🏠", "Home"],
          ["add", "➕", "Add"],
          ["history", "📋", "History"],
          ["analytics", "📊", "Stats"],
        ].map(([v, icon, label]) => (
          <button
            key={v}
            className={`bottom-nav-btn${view === v ? " active" : ""}`}
            onClick={() => {
              if (v !== "add" && editId) cancelEdit();
              else setView(v);
            }}
          >
            <span className="bottom-nav-icon">{icon}</span>
            <span className="bottom-nav-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
