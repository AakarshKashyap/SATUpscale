import { Link } from "react-router-dom";
import PublicNavbar from "../components/PublicNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const ctaTarget = isAuthenticated ? "/dashboard" : "/signup";

  return (
    <div className="app">
      <PublicNavbar />

      <section className="hero" id="home">
        <div className="hero-content">
          <div className="badge">
            ✦ AI-Powered Satellite Super Resolution
          </div>

          <h1>
            See more detail.
            <br />
            <span>From every pixel.</span>
          </h1>

          <p>
            Enhance satellite imagery with AI-powered 8×
            super-resolution. Upload an image or use the
            SATUpscale browser extension.
          </p>

          <div className="hero-actions">
            <Link to={ctaTarget} className="primary-btn">
              Try SATUpscale →
            </Link>

            <a
              href="#extension-info"
              className="secondary-btn"
            >
              Install Extension
            </a>
          </div>
        </div>

        <div className="hero-visual">
          <div className="satellite-card">
            <div className="satellite-grid"></div>
            <div className="satellite-label">
              <span>AI ENHANCED</span>
              <strong>8×</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="section-heading" style={{ textAlign: "center", display: "block" }}>
          <span className="section-label">CAPABILITIES</span>
          <h2>Built for Earth Observation Imagery</h2>
          <p>
            Advanced super-resolution models tailored specifically for satellite and aerial datasets.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🛰️</div>
            <h3>8× Super-Resolution</h3>
            <p>
              Reconstruct sub-pixel details from low-resolution sensors with state-of-the-art neural upscaling.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Browser Extension</h3>
            <p>
              Enhance imagery directly inside mapping tools and web applications with a single click.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">☁️</div>
            <h3>Cloud Processing</h3>
            <p>
              Fast and secure AWS cloud infrastructure processing jobs with permanent shareable output URLs.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-cta" id="extension-info">
        <div className="cta-container">
          <span className="section-label">GET STARTED</span>
          <h2>Start enhancing imagery today</h2>
          <p>
            Create an account to access the workspace, save your enhancement history, and download high-resolution outputs.
          </p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link to={ctaTarget} className="primary-btn">
              Open Workspace →
            </Link>
            <Link to="/login" className="secondary-btn">
              Sign In to Account
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
