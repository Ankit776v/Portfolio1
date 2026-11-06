import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Login() {
    const { authenticate, completeAuthentication, send } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const googleStatus = searchParams.get("google");
        if (googleStatus === "error") {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setError("Google sign-in was not completed. Please try again.");
            return;
        }
        if (googleStatus !== "success") return;

        send("/api/auth/google/session", { method: "POST", body: "{}" })
            .then(completeAuthentication)
            .then(() => navigate("/", { replace: true }))
            .catch((err) => setError(err.message));
    }, [searchParams, send, completeAuthentication, navigate]);

    async function handleSubmit(event) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError("");
        setSubmitting(true);
        try {
            await authenticate("/api/auth/login", { email: data.get("email"), password: data.get("password") });
            navigate("/");
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="form">
            <h1>Login</h1>
            <form className="data" onSubmit={handleSubmit}>
                <div className="m-3">
                    <label htmlFor="email" className="visually-hidden">Email address</label>
                    <input name="email" type="email" className="form-control" id="email" placeholder="Email address" required />
                </div>
                <div className="m-3">
                    <label htmlFor="password" className="visually-hidden">Password</label>
                    <input name="password" type="password" className="form-control" id="password" placeholder="Password" required />
                </div>
                {error && <p className="auth-error" role="alert">{error}</p>}
                {location.state?.message && <p className="auth-success" role="status">{location.state.message}</p>}
                <div className="sumit m-2">
                    <button type="submit" className="btn btn-primary mb-3" disabled={submitting}>{submitting ? "Logging in..." : "Log in"}</button>
                </div>
                <a className="google-login" href={`${import.meta.env.VITE_API_URL || import.meta.env.BASE_URL.replace(/\/$/, '')}/api/auth/google`}>Continue with Google</a>
                <p><Link to="/forgot-password">Forgot password?</Link></p>
                <p>New here? <Link to="/signup">Create an account</Link></p>
            </form>
        </div>
    )
}
