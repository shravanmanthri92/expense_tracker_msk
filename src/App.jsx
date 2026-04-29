import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";

const CATEGORIES = [
  { id: "food", label: "Food & Dining", icon: "🍽️", color: "#ff8a65" },
  { id: "transport", label: "Transport", icon: "🚗", color: "#60a5fa" },
  { id: "shopping", label: "Shopping", icon: "🛍️", color: "#c084fc" },
  { id: "health", label: "Health", icon: "💊", color: "#34d399" },
  { id: "entertainment", label: "Entertainment", icon: "🎬", color: "#fbbf24" },
  { id: "utilities", label: "Utilities", icon: "💡", color: "#94a3b8" },
  { id: "rent", label: "Rent/Housing", icon: "🏠", color: "#fb7185" },
  { id: "other", label: "Other", icon: "📦", color: "#a1a1aa" },
];

const getCat = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[7];

const CURRENCY_OPTIONS = [
  { code: "USD", label: "USD ($)", locale: "en-US", symbol: "$" },
  { code: "INR", label: "INR (₹)", locale: "en-IN", symbol: "₹" },
  { code: "EUR", label: "EUR (€)", locale: "de-DE", symbol: "€" },
];

const getCurrencyMeta = (code) =>
  CURRENCY_OPTIONS.find((c) => c.code === code) || CURRENCY_OPTIONS[0];

const fmt = (n, currency = "USD") => {
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
const mapRow = (row) => ({
  id: row.id,
  amount: parseFloat(row.amount),
  description: row.notes,
  category: row.category,
  date: row.date,
});

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

export default function App() {
  // Supabase: expenses are loaded from the DB, not localStorage
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [view, setView] = useState("dashboard");
  const [form, setForm] = useState({ amount: "", description: "", category: "food", date: todayISO() });
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [toast, setToast] = useState(null);
  const [currency, setCurrency] = useState(() => localStorage.getItem("expenseCurrency") || "USD");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQ, setSearchQ] = useState("");

  // Keep currency preference in localStorage
  useEffect(() => {
    localStorage.setItem("expenseCurrency", currency);
  }, [currency]);

  // Supabase: fetch all expenses, ordered newest first
  const fetchExpenses = async () => {
    setLoading(true);
    setDbError(null);
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setDbError(error.message);
    } else {
      setExpenses(data.map(mapRow));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // Supabase: insert new or update existing expense
  const saveExpense = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0 || !form.description.trim()) {
      showToast("Please fill in amount and description.", "error");
      return;
    }
    if (editId) {
      const { error } = await supabase
        .from("expenses")
        .update({ amount, category: form.category, date: form.date, notes: form.description })
        .eq("id", editId);
      if (error) { showToast("Failed to update expense.", "error"); return; }
      setExpenses((prev) => prev.map((e) => (e.id === editId ? { ...e, ...form, amount } : e)));
      showToast("Expense updated!");
      setEditId(null);
    } else {
      const { data, error } = await supabase
        .from("expenses")
        .insert({ amount, category: form.category, date: form.date, notes: form.description })
        .select()
        .single();
      if (error) { showToast("Failed to add expense.", "error"); return; }
      setExpenses((prev) => [mapRow(data), ...prev]);
      showToast("Expense added!");
    }
    setForm({ amount: "", description: "", category: "food", date: todayISO() });
    setView("dashboard");
  };

  // Supabase: delete expense by id
  const deleteExpense = async (id) => {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { showToast("Failed to delete expense.", "error"); setDeleteConfirm(null); return; }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setDeleteConfirm(null);
    showToast("Expense deleted.", "info");
  };

  const startEdit = (e) => {
    setForm({ amount: String(e.amount), description: e.description, category: e.category, date: e.date });
    setEditId(e.id);
    setView("add");
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm({ amount: "", description: "", category: "food", date: todayISO() });
    setView("history");
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

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
      if (searchQ && !e.description.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });
  }, [expenses, filterCat, filterMonth, searchQ]);

  const exportCSV = () => {
    const header = "Date,Description,Category,Amount\n";
    const rows = expenses
      .map((e) => `${e.date},"${e.description}",${getCat(e.category).label},${e.amount}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expenses.csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported!");
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
  const pieGradient = useMemo(() => buildPieGradient(allTimeCategoryTotals), [allTimeCategoryTotals]);
  const filtersActive = filterCat !== "all" || filterMonth !== "all" || searchQ.trim() !== "";

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
              <button className="btn btn-danger" onClick={() => deleteExpense(deleteConfirm)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="header">
        <div className="header-inner">
          <div className="logo-wrap">
            <div className="logo">
              <span className="logo-icon">◈</span>
              <div>
                <span className="logo-text">Spendly</span>
                <span className="logo-sub">Personal expense dashboard</span>
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
            <select
              className="form-input currency-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Select currency"
            >
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </select>
            <button className="export-btn" onClick={exportCSV}>
              Export CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setView("add")}>
              + Add
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Supabase: loading and error states */}
        {loading && <div className="db-loading">Loading expenses…</div>}
        {!loading && dbError && (
          <div className="db-error">
            Could not load data — {dbError}.
            <button className="link" onClick={fetchExpenses}> Retry</button>
          </div>
        )}
        {view === "dashboard" && (
          <div className="page">
            <section className="hero-card">
              <div className="hero-copy">
                <span className="eyebrow">Overview · {MONTHS[currentMonth]} {currentYear}</span>
                <h1 className="hero-title">A cleaner way to track where your money goes.</h1>
                <p className="hero-sub">
                  Add expenses in seconds, review category trends, and keep your monthly spending visible at a glance.
                </p>
                <div className="hero-actions">
                  <button className="btn btn-primary" onClick={() => setView("add")}>Add Expense</button>
                  <button className="btn btn-ghost" onClick={() => setView("history")}>Open History</button>
                </div>
              </div>
              <div className="hero-panel">
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
                <span className="stat-meta">{thisMonthExpenses.length} transactions</span>
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
                            <span className="tx-desc">{e.description}</span>
                            <span className="tx-date">{fmtDate(e.date)} · {cat.label}</span>
                          </div>
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
                {catTotals.length === 0 ? (
                  <div className="empty">No data for this month.</div>
                ) : (
                  <ul className="cat-list cat-list-modern">
                    {catTotals.map((c) => (
                      <li key={c.id} className="cat-item modern-cat-item">
                        <div className="cat-row">
                          <span className="cat-icon modern-cat-icon" style={{ background: `${c.color}20`, color: c.color }}>{c.icon}</span>
                          <span className="cat-name">{c.label}</span>
                          <span className="cat-amt">{fmt(c.total, currency)}</span>
                        </div>
                        <div className="cat-bar-bg">
                          <div className="cat-bar-fill" style={{ width: `${(c.total / totalThisMonth) * 100}%`, background: c.color }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {view === "add" && (
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

              <button className="btn btn-primary btn-full" onClick={saveExpense}>
                {editId ? "Save Changes" : "Add Expense"}
              </button>
            </div>
          </div>
        )}

        {view === "history" && (
          <div className="page">
            <div className="page-header">
              <div>
                <h1 className="page-title">Transaction History</h1>
                <p className="page-sub">Search, filter, edit, and manage all entries.</p>
              </div>
              <span className="badge">{filteredExpenses.length} entries</span>
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
              {filtersActive && (
                <button className="btn btn-ghost btn-reset" onClick={() => { setFilterCat("all"); setFilterMonth("all"); setSearchQ(""); }}>
                  Clear filters
                </button>
              )}
            </div>

            {filteredExpenses.length === 0 ? (
              <div className="card empty">No transactions found.</div>
            ) : (
              <div className="card elevated-card">
                <ul className="tx-list tx-list-full">
                  {filteredExpenses.map((e) => {
                    const cat = getCat(e.category);
                    return (
                      <li key={e.id} className="tx-item tx-item-modern tx-item-history">
                        <span className="tx-icon" style={{ background: `${cat.color}22`, color: cat.color }}>{cat.icon}</span>
                        <div className="tx-info">
                          <span className="tx-desc">{e.description}</span>
                          <span className="tx-date">{fmtDate(e.date)} · {cat.label}</span>
                        </div>
                        <span className="tx-amount">{fmt(e.amount, currency)}</span>
                        <div className="tx-actions visible-actions">
                          <button className="icon-btn" title="Edit" onClick={() => startEdit(e)}>✏️</button>
                          <button className="icon-btn" title="Delete" onClick={() => setDeleteConfirm(e.id)}>🗑️</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {view === "analytics" && (
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
                    <h2 className="card-title">All-Time by Category</h2>
                    <p className="card-subtitle">Relative share of each category in your overall spending.</p>
                  </div>
                </div>
                {allTimeCategoryTotals.length === 0 ? (
                  <div className="empty">No data yet.</div>
                ) : (
                  <>
                    <div className="pie-layout">
                      <div className="pie-wrap">
                        <div className="pie-chart" style={{ background: pieGradient }}>
                          <div className="pie-hole">
                            <span>Total</span>
                            <strong>{fmt(totalAll, currency)}</strong>
                          </div>
                        </div>
                      </div>
                      <ul className="legend-list">
                        {allTimeCategoryTotals.map((c) => {
                          const pct = Math.round((c.total / totalAll) * 100);
                          return (
                            <li key={c.id} className="legend-item">
                              <span className="legend-dot" style={{ background: c.color }} />
                              <span className="legend-name">{c.icon} {c.label}</span>
                              <span className="legend-meta">{pct}% · {fmt(c.total, currency)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <ul className="cat-list cat-list-modern compact-list">
                      {allTimeCategoryTotals.map((c) => (
                        <li key={c.id} className="cat-item modern-cat-item">
                          <div className="cat-row">
                            <span className="cat-icon modern-cat-icon" style={{ background: `${c.color}20`, color: c.color }}>{c.icon}</span>
                            <span className="cat-name">{c.label}</span>
                            <span className="cat-amt">{fmt(c.total, currency)} <span className="cat-pct">({Math.round((c.total / totalAll) * 100)}%)</span></span>
                          </div>
                          <div className="cat-bar-bg">
                            <div className="cat-bar-fill" style={{ width: `${(c.total / totalAll) * 100}%`, background: c.color }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
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
          </div>
        )}
      </main>
    </div>
  );
}
