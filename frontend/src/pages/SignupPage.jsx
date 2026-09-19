import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import PublicNavbar from "../components/PublicNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { AlertCircle, UserPlus, CheckCircle2 } from "lucide-react";

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
    <div className="app-shell dark-theme-root aerospace-aesthetic">
      <PublicNavbar />

      <main className="auth-split-layout">
        {/* LEFT PANEL: REGISTRATION FORM */}
        <div className="auth-split-left">
          <div className="auth-form-box">
            <div className="eyebrow-status-tag mb-6">
              <UserPlus className="icon-xs violet" />
              <span className="eyebrow-text">REGISTRATION</span>
            </div>

            <h1 className="auth-title">
              {awaitingConfirmation ? "Confirm your" : "Create your"}
              <br />
              <span className="title-muted-span">SATUpscale account</span>
            </h1>

            <p className="auth-subtitle">
              {awaitingConfirmation
                ? "Enter the confirmation code sent to your email."
                : "Join the platform for sub-meter satellite image enhancement."}
            </p>

            {error && (
              <div className="inline-error-banner dark-error mb-6">
                <AlertCircle className="icon-sm" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form-stack">
              {!awaitingConfirmation ? (
                <>
                  <div className="custom-form-group">
                    <label htmlFor="name">Full Name</label>
                    <input
                      id="name"
                      type="text"
                      className="custom-auth-input"
                      placeholder="Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>

                  <div className="custom-form-group">
                    <label htmlFor="email">Email address</label>
                    <input
                      id="email"
                      type="email"
                      className="custom-auth-input"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div className="custom-form-group">
                    <label htmlFor="password">Password</label>
                    <input
                      id="password"
                      type="password"
                      className="custom-auth-input"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </>
              ) : (
                <div className="custom-form-group">
                  <label htmlFor="code">Confirmation Code</label>
                  <input
                    id="code"
                    type="text"
                    className="custom-auth-input"
                    placeholder="Enter code"
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value)}
                    autoComplete="one-time-code"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                className="solid-light-btn auth-submit-btn"
                disabled={submitting || loading}
                data-cursor="OPEN"
              >
                <span>
                  {submitting
                    ? awaitingConfirmation
                      ? "CONFIRMING ACCOUNT..."
                      : "CREATING ACCOUNT..."
                    : awaitingConfirmation
                      ? "CONFIRM ACCOUNT →"
                      : "CREATE ACCOUNT →"}
                </span>
              </button>
            </form>

            <div className="auth-card-footer dark-footer mt-8">
              <p className="text-muted-slate text-sm">
                Already have an account?{" "}
                <Link to="/login" className="violet-text font-semibold hover:underline">
                  Sign in →
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: ATMOSPHERIC EARTH VISUAL */}
        <div className="auth-split-right">
          <img
            src="/hero_satellite.jpg"
            alt="Satellite imagery visual"
            className="auth-visual-image"
          />
          <div className="auth-visual-overlay" />
          <div className="auth-visual-caption">
            EARTH OBSERVATION · SATUpscale PLATFORM
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
