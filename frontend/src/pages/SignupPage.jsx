import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import PublicNavbar from "../components/PublicNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";

export default function SignupPage() {
  const { signup, confirmSignup, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (awaitingConfirmation) {
      try {
        setSubmitting(true);
        await confirmSignup(email, confirmationCode);
        navigate("/login", {
          replace: true,
          state: { message: "Account confirmed. Sign in to continue." }
        });
      } catch (err) {
        setError(err.message || "Failed to confirm account.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    try {
      setSubmitting(true);
      const result = await signup(name, email, password);
      if (result?.needsConfirmation) {
        setAwaitingConfirmation(true);
        setError("");
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Failed to create account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app">
      <PublicNavbar />

      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <span className="section-label">REGISTRATION</span>
            <h1>{awaitingConfirmation ? "Confirm your account" : "Create your account"}</h1>
            <p>
              {awaitingConfirmation
                ? "Enter the verification code sent to your email."
                : "Get started with AI satellite super-resolution."}
            </p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            {!awaitingConfirmation && <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>}

            {!awaitingConfirmation && <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>}

            {!awaitingConfirmation && <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>}

            {awaitingConfirmation && <div className="form-group">
              <label htmlFor="confirmation-code">Confirmation code</label>
              <input
                id="confirmation-code"
                type="text"
                placeholder="Enter your code"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                autoComplete="one-time-code"
                required
              />
            </div>}

            <button
              type="submit"
              className="primary-btn auth-submit-btn"
              disabled={submitting || loading}
            >
              {submitting
                ? awaitingConfirmation
                  ? "Confirming account..."
                  : "Creating account..."
                : awaitingConfirmation
                  ? "Confirm Account →"
                  : "Get Started →"}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Already have an account?{" "}
              <Link to="/login" className="auth-link">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
