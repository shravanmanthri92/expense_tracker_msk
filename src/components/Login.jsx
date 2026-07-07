import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function Login({ onSwitchToSignup, onForgotPassword }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) { setError("Email is required."); return; }
    if (!password) { setError("Password is required."); return; }

    setLoading(true);
    const { error: authError } = await signIn({ email: email.trim(), password });
    setLoading(false);

    if (authError) {
      setError(authError.message === "Invalid login credentials"
        ? "Incorrect email or password. Please try again."
        : authError.message);
    }
    // On success, AuthContext session update triggers App to show the dashboard
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-logo">🏡</div>
        <h1 className="auth-title">Spendly</h1>
        <p className="auth-sub">Shared household expense tracker</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className={`form-input${error ? " gate-input-error" : ""}`}
              type="email"
              placeholder="you@example.com"
              value={email}
              autoFocus
              autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className={`form-input${error ? " gate-input-error" : ""}`}
              type="password"
              placeholder="Your password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button
            className="btn btn-primary btn-full"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <button className="auth-link-btn" onClick={onForgotPassword}>
          Forgot password?
        </button>

        <p className="auth-switch">
          Don&apos;t have an account?{" "}
          <button className="link" onClick={onSwitchToSignup}>Sign up</button>
        </p>
      </div>
    </div>
  );
}
