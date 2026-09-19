import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import PublicNavbar from "../components/PublicNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { ArrowRight, AlertCircle, Lock } from "lucide-react";

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      setSubmitting(true);
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell dark-theme-root aerospace-aesthetic">
      <PublicNavbar />

      <main className="auth-split-layout">
        {/* LEFT PANEL: AUTHENTICATION FORM */}
        <div className="auth-split-left">
          <div className="auth-form-box">
            <div className="eyebrow-status-tag mb-6">
              <Lock className="icon-xs violet" />
              <span className="eyebrow-text">AUTHENTICATION</span>
            </div>

            <h1 className="auth-title">
              Sign in to
              <br />
              <span className="title-muted-span">SATUpscale</span>
            </h1>

            <p className="auth-subtitle">
              Access your enhancement workspace, job telemetry, and image history.
            </p>

            {error && (
              <div className="inline-error-banner dark-error mb-6">
                <AlertCircle className="icon-sm" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form-stack">
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
                <div className="flex justify-between items-center">
                  <label htmlFor="password">Password</label>
                </div>
                <input
                  id="password"
                  type="password"
                  className="custom-auth-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="solid-light-btn auth-submit-btn"
                disabled={submitting || loading}
                data-cursor="OPEN"
              >
                <span>{submitting ? "SIGNING IN..." : "SIGN IN →"}</span>
              </button>
            </form>

            <div className="auth-card-footer dark-footer mt-8">
              <p className="text-muted-slate text-sm">
                Don't have an account?{" "}
                <Link to="/signup" className="violet-text font-semibold hover:underline">
                  Sign up →
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: ATMOSPHERIC EARTH & SATELLITE IMAGERY VISUAL */}
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
