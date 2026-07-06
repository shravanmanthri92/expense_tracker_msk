import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { createHousehold } from "../services/householdService";

export default function CreateHousehold() {
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Please enter a household name."); return; }

    setLoading(true);
    setError("");

    const { error: createError } = await createHousehold({ name, userId: user.id });

    if (createError) {
      setError("Could not create household. Please try again.");
      setLoading(false);
      return;
    }

    // Reload profile — AuthContext will pick up the new household_id and load the household
    await refreshProfile();
    // No need to navigate — SpendlyApp will re-render into <App /> once household is set
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-logo">🏡</div>
        <h1 className="auth-title">Create your household</h1>
        <p className="auth-sub">
          Give your household a name — this will be shared with everyone you invite later.
          <br />
          <span style={{ fontStyle: "italic" }}>e.g. "Shravan &amp; Nikhitha"</span>
        </p>

        <form className="auth-form" onSubmit={handleCreate} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="household-name">Household name</label>
            <input
              id="household-name"
              className="form-input"
              type="text"
              placeholder="e.g. Shravan & Nikhitha"
              value={name}
              autoFocus
              maxLength={60}
              onChange={(e) => { setName(e.target.value); setError(""); }}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button
            className="btn btn-primary btn-full"
            type="submit"
            disabled={loading || !name.trim()}
          >
            {loading ? "Creating…" : "Create Household"}
          </button>
        </form>
      </div>
    </div>
  );
}
