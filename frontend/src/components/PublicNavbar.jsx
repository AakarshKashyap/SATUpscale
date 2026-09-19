import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function PublicNavbar() {
  const { isAuthenticated } = useAuth();

  return (
    <nav className="navbar">
      <Link to="/" className="logo-link">
        <div className="logo">
          <span className="logo-mark">S</span>
          SATUpscale
        </div>
      </Link>

      <div className="nav-links">
        <Link to="/">Home</Link>
        <a href="#features">Features</a>
        <a href="#how-it-works">How It Works</a>
      </div>

      <div className="nav-actions">
        {isAuthenticated ? (
          <Link to="/dashboard" className="primary-btn nav-action-btn">
            Go to Dashboard →
          </Link>
        ) : (
          <>
            <Link to="/login" className="login-btn">
              Sign In
            </Link>
            <Link to="/signup" className="primary-btn nav-action-btn">
              Get Started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
