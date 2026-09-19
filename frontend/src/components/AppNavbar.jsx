import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AppNavbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="navbar app-navbar">
      <NavLink to="/dashboard" className="logo-link">
        <div className="logo">
          <span className="logo-mark">S</span>
          SATUpscale
        </div>
      </NavLink>

      <div className="nav-links app-nav-links">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/enhance"
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Enhance
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          History
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Settings
        </NavLink>
      </div>

      <div className="nav-actions app-user-menu">
        <div className="user-badge" title={user?.email || "User"}>
          <span className="user-avatar">
            {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
          </span>
          <span className="user-name">{user?.name || user?.email || "User"}</span>
        </div>
        <button onClick={handleLogout} className="logout-btn" title="Sign out">
          Sign Out
        </button>
      </div>
    </nav>
  );
}
