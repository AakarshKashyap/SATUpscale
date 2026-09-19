import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import ThemeToggle from "./navigation/ThemeToggle";
import { Sparkles, Menu, X, ArrowRight } from "lucide-react";

export default function PublicNavbar() {
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  return (
    <header className={`public-navbar vantor-style-nav ${scrolled ? "scrolled" : ""}`}>
      <div className="navbar-container">
        {/* LEFT: BRAND LOGO */}
        <Link to="/" className="logo-link" data-cursor="OPEN">
          <div className="brand-logo">
            <span className="brand-name-text">
              <span className="brand-sat">SAT</span>
              <span className="brand-upscale">Upscale</span>
            </span>
          </div>
        </Link>

        {/* CENTER: EDITORIAL NAVIGATION ITEMS WITH 200MS SUBTLE LINE REVEAL */}
        <nav className="desktop-nav-links center-editorial">
          <Link
            to="/"
            className={`nav-item line-reveal ${location.pathname === "/" ? "active" : ""}`}
          >
            <span>PLATFORM</span>
            <span className="nav-bottom-line"></span>
          </Link>

          <a href="/#imagery-showcase" className="nav-item line-reveal" data-cursor="EXPLORE">
            <span>IMAGERY</span>
            <span className="nav-bottom-line"></span>
          </a>

          <Link
            to="/enhance"
            className={`nav-item line-reveal ${location.pathname === "/enhance" ? "active" : ""}`}
            data-cursor="ENHANCE"
          >
            <span>ENHANCEMENT</span>
            <span className="nav-bottom-line"></span>
          </Link>

          <a href="/#technology" className="nav-item line-reveal">
            <span>INTELLIGENCE</span>
            <span className="nav-bottom-line"></span>
          </a>
        </nav>

        {/* RIGHT: EXPLORE, THEME TOGGLE & ACTIONS */}
        <div className="nav-actions">
          <ThemeToggle />

          <a href="/#target-selection" className="ghost-btn nav-btn" data-cursor="EXPLORE">
            EXPLORE
          </a>

          {isAuthenticated ? (
            <Link to="/dashboard" className="solid-light-btn nav-btn" data-cursor="OPEN">
              <span>WORKSPACE</span>
              <ArrowRight className="icon-sm" />
            </Link>
          ) : (
            <Link to="/login" className="solid-light-btn nav-btn" data-cursor="OPEN">
              <span>SIGN IN</span>
            </Link>
          )}

          {/* MOBILE TOGGLE BUTTON */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mobile-menu-toggle dark"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="icon-md" /> : <Menu className="icon-md" />}
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="mobile-menu-drawer dark">
          <nav className="mobile-nav-links">
            <Link to="/" className="mobile-nav-item">
              PLATFORM
            </Link>
            <a href="/#imagery-showcase" className="mobile-nav-item">
              IMAGERY
            </a>
            <Link to="/enhance" className="mobile-nav-item">
              ENHANCEMENT
            </Link>
            <a href="/#technology" className="mobile-nav-item">
              INTELLIGENCE
            </a>
            <hr className="drawer-divider dark" />
            {isAuthenticated ? (
              <Link to="/dashboard" className="solid-light-btn drawer-btn">
                GO TO WORKSPACE →
              </Link>
            ) : (
              <div className="mobile-auth-stack">
                <Link to="/login" className="ghost-btn drawer-btn">
                  SIGN IN
                </Link>
                <Link to="/signup" className="solid-light-btn drawer-btn">
                  GET STARTED →
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
