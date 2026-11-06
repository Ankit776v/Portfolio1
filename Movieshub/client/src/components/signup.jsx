import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Signup() {
    const { authenticate } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

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
            await authenticate("/api/auth/register", {
                name: data.get("name"), email: data.get("email")?.trim(), dateOfBirth: data.get("dateOfBirth"), password: data.get("password"),
            });
            navigate("/");
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="form">
            <h1>Sign up</h1>
            <form className="data" onSubmit={handleSubmit}>
                <div className="m-3">
                    <label htmlFor="name" className="visually-hidden">Name</label>
                    <input name="name" type="text" className="form-control" id="name" placeholder="Name" required />
                </div>
                <div className="m-3">
                    <label htmlFor="email" className="visually-hidden">Email address</label>
                    <input name="email" type="email" className="form-control" id="email" placeholder="Email address" required />
                </div>
                <div className="m-3">
                    <label htmlFor="date" className="visually-hidden">Date of Birth</label>
                    <input name="dateOfBirth" type="date" className="form-control" id="date" />
                </div>
                <div className="m-3">
                    <label htmlFor="password" className="visually-hidden">Password</label>
                    <input name="password" type="password" className="form-control" id="password" placeholder="Password (10+ characters)" minLength="10" required />
                </div>
                <div className="m-3">
                    <label htmlFor="confirmPassword" className="visually-hidden">Confirm Password</label>
                    <input name="confirmPassword" type="password" className="form-control" id="confirmPassword" placeholder="Confirm Password" minLength="10" required />
                </div>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <div className="sumit m-2">
                    <button type="submit" className="btn btn-primary mb-3" disabled={submitting}>{submitting ? "Creating account..." : "Create account"}</button>
                </div>
                <p>Already registered? <Link to="/login">Log in</Link></p>
            </form>
            <a className="google-login" href={`${import.meta.env.VITE_API_URL || import.meta.env.BASE_URL.replace(/\/$/, '')}/api/auth/google`}>Sign up with Google</a>
        </div>
    )
}
