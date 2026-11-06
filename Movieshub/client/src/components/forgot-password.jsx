import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function ForgotPassword() {
  const { send } = useAuth();
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    setError("");
    setMessage("");
    setResetUrl("");
    setSubmitting(true);
    try {
      const result = await send("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
      setResetUrl(result.resetUrl || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="form">
      <h1>Reset password</h1>
      <form className="data" onSubmit={handleSubmit}>
        <p>Enter your account email to receive a password reset link.</p>
        <div className="m-3">
          <label htmlFor="reset-email" className="visually-hidden">Email address</label>
          <input name="email" type="email" className="form-control" id="reset-email" placeholder="Email address" required />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-success">{message}</p>}
        {resetUrl && <p className="reset-link"><Link to={new URL(resetUrl).pathname + new URL(resetUrl).search}>Continue to reset password</Link></p>}
        <div className="sumit m-2">
          <button type="submit" className="btn btn-primary mb-3" disabled={submitting}>{submitting ? "Creating link..." : "Create reset link"}</button>
        </div>
        <p><Link to="/login">Back to login</Link></p>
      </form>
    </div>
  );
}
