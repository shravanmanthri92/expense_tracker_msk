import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function Signup({ onSwitchToLogin }) {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!displayName.trim()) { setError("Display name is required."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setLoading(true);
    const { error: authError } = await signUp({
      email: email.trim(),
      password,
      displayName: displayName.trim(),
    });
    setLoading(false);

    if (authError) {
      const msg = authError.message?.toLowerCase() || "";
      if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("exceeded")) {
        setError("Sign-up emails are temporarily limited. Please try again in a few minutes, or ask the app admin to disable email confirmation in Supabase.");
      } else {
        setError(authError.message);
      }
    } else {
      setDone(true);
    }
  };

  if (done) {
    return (
      <div className="auth-overlay">
        <div className="auth-card">
          <div className="auth-logo">📬</div>
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub" style={{ textAlign: "center", maxWidth: "280px" }}>
            We sent a confirmation link to <strong>{email}</strong>. Open it to activate your account, then sign in.
          </p>
          <button className="btn btn-primary btn-full" style={{ marginTop: "8px" }} onClick={onSwitchToLogin}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-logo">🏡</div>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-sub">Join Spendly and start tracking</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="signup-name">Display name</label>
            <input
              id="signup-name"
              className="form-input"
              type="text"
              placeholder="e.g. Shravan"
              value={displayName}
              autoFocus
              autoComplete="name"
              onChange={(e) => { setDisplayName(e.target.value); setError(""); }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              className="form-input"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              autoComplete="new-password"
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-confirm">Confirm password</label>
            <input
              id="signup-confirm"
              className="form-input"
              type="password"
              placeholder="Repeat password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => { setConfirm(e.target.value); setError(""); }}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button
            className="btn btn-primary btn-full"
            type="submit"
            disabled={loading}
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{" "}
          <button className="link" onClick={onSwitchToLogin}>Sign in</button>
        </p>
      </div>
    </div>
  );
}
