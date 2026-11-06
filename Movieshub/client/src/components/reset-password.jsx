import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function ResetPassword() {
  const { send } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const token = searchParams.get("token");

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirmPassword")) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await send("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password: data.get("password") }),
      });
      navigate("/login", { state: { message: "Password updated. Please log in." } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="form">
      <h1>Choose a new password</h1>
      <form className="data" onSubmit={handleSubmit}>
        <div className="m-3">
          <label htmlFor="new-password" className="visually-hidden">New password</label>
          <input name="password" type="password" className="form-control" id="new-password" placeholder="New password (10+ characters)" minLength="10" required disabled={!token} />
        </div>
        <div className="m-3">
          <label htmlFor="confirm-new-password" className="visually-hidden">Confirm new password</label>
          <input name="confirmPassword" type="password" className="form-control" id="confirm-new-password" placeholder="Confirm new password" minLength="10" required disabled={!token} />
        </div>
        {!token && <p className="auth-error" role="alert">This reset link is missing its token.</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="sumit m-2">
          <button type="submit" className="btn btn-primary mb-3" disabled={!token || submitting}>{submitting ? "Updating password..." : "Update password"}</button>
        </div>
        <p><Link to="/login">Back to login</Link></p>
      </form>
    </div>
  );
}
