import { NavLink, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import ThemeToggle from "./navigation/ThemeToggle";
import { LogOut} from "lucide-react";

export default function AppNavbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const displayName = user?.name || user?.email?.split("@")[0] || "Account";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="public-navbar vantor-style-nav app-header-nav">
      <div className="navbar-container">
        {/* LEFT: BRAND LOGO */}
        <Link to="/" className="logo-link">
          <div className="brand-logo">
            <span className="brand-name-text">
              <span className="brand-sat">SAT</span>
              <span className="brand-upscale">Upscale</span>
            </span>
          </div>
        </Link>

        {/* CENTER: EDITORIAL NAVIGATION */}
        <nav className="desktop-nav-links center-editorial">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `nav-item line-reveal ${isActive ? "active" : ""}`
            }
          >
            <span>WORKSPACE</span>
            <span className="nav-bottom-line" />
          </NavLink>

          <NavLink
            to="/enhance"
            className={({ isActive }) =>
              `nav-item line-reveal ${isActive ? "active" : ""}`
            }
          >
            <span>ENHANCEMENT</span>
            <span className="nav-bottom-line" />
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) =>
              `nav-item line-reveal ${isActive ? "active" : ""}`
            }
          >
            <span>HISTORY</span>
            <span className="nav-bottom-line" />
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `nav-item line-reveal ${isActive ? "active" : ""}`
            }
          >
            <span>SETTINGS</span>
            <span className="nav-bottom-line" />
          </NavLink>
        </nav>

        {/* RIGHT: THEME TOGGLE & USER ACCOUNT PILL */}
        <div className="nav-actions">
          <ThemeToggle />

          <div className="app-user-pill">
            <span className="user-avatar-badge">{initial}</span>
            <span className="user-pill-name">{displayName}</span>
            <button
              onClick={handleLogout}
              className="user-logout-icon-btn"
              title="Sign Out"
            >
              <LogOut className="icon-xs" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
