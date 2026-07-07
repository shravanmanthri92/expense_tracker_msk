import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function ForgotPassword({ onBack, isResetMode: isResetModeProp }) {
  const { resetPassword, updatePassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Update-password mode: driven by PASSWORD_RECOVERY auth event (prop) or legacy ?reset=1 param
  const isResetMode = isResetModeProp ??
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("reset") === "1");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updated, setUpdated] = useState(false);

  const handleSendReset = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email is required."); return; }
    setLoading(true);
    const { error: authError } = await resetPassword(email.trim());
    setLoading(false);
    if (authError) {
      const msg = authError.message?.toLowerCase() || "";
      if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("exceeded")) {
        setError("Too many reset attempts. Please wait a few minutes before trying again.");
      } else {
        setError(authError.message);
      }
    } else {
      setSent(true);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    const { error: authError } = await updatePassword(newPassword);
    setLoading(false);
    if (authError) {
      // Provide a clearer message if the session/token has expired
      if (
        authError.message?.toLowerCase().includes("expired") ||
        authError.message?.toLowerCase().includes("invalid") ||
        authError.status === 401
      ) {
        setError("This reset link has expired or was already used. Please request a new one.");
      } else {
        setError(authError.message);
      }
    } else {
      setUpdated(true);
      // Remove the ?reset=1 param cleanly
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  // --- Update-password screen (user came back via email link) ---
  if (isResetMode) {
    if (updated) {
      return (
        <div className="auth-overlay">
          <div className="auth-card">
            <div className="auth-logo">✅</div>
            <h1 className="auth-title">Password updated</h1>
            <p className="auth-sub">Your password has been changed. You can now sign in.</p>
            <button className="btn btn-primary btn-full" style={{ marginTop: "8px" }} onClick={onBack}>
              Back to Sign In
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="auth-overlay">
        <div className="auth-card">
          <div className="auth-logo">🔑</div>
          <h1 className="auth-title">Set new password</h1>
          <p className="auth-sub">Choose a new password for your account</p>

          <form className="auth-form" onSubmit={handleUpdatePassword} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                className="form-input"
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                autoFocus
                autoComplete="new-password"
                onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                className="form-input"
                type="password"
                placeholder="Repeat new password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
              />
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? "Updating…" : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Sent confirmation ---
  if (sent) {
    return (
      <div className="auth-overlay">
        <div className="auth-card">
          <div className="auth-logo">📬</div>
          <h1 className="auth-title">Email sent</h1>
          <p className="auth-sub" style={{ textAlign: "center", maxWidth: "280px" }}>
            Check <strong>{email}</strong> for a password reset link. It may take a minute to arrive.
          </p>
          <button className="btn btn-primary btn-full" style={{ marginTop: "8px" }} onClick={onBack}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // --- Default: request reset email ---
  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-logo">🔒</div>
        <h1 className="auth-title">Reset password</h1>
        <p className="auth-sub">Enter your email and we'll send you a reset link</p>

        <form className="auth-form" onSubmit={handleSendReset} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              autoFocus
              autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send Reset Link"}
          </button>
        </form>

        <button className="auth-link-btn" onClick={onBack}>← Back to Sign In</button>
      </div>
    </div>
  );
}
