import { useState } from "react";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { getUserId } from "../services/user";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const userId = getUserId();
  const [copied, setCopied] = useState(false);

  const copyUserId = () => {
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="app">
      <AppNavbar />

      <main className="dashboard-section" style={{ minHeight: "80vh", maxWidth: "900px", margin: "0 auto" }}>
        <div className="section-heading">
          <div>
            <span className="section-label">CONFIGURATION</span>
            <h2>Settings</h2>
            <p>Manage your account, preferences, and extension integration.</p>
          </div>
        </div>

        <div className="settings-container">
          {/* ACCOUNT SECTION */}
          <div className="settings-card">
            <h3>Account Details</h3>
            <p className="settings-card-desc">Your profile and identity information.</p>

            <div className="settings-field">
              <label>Name</label>
              <div className="settings-value">{user?.name || "Not specified"}</div>
            </div>

            <div className="settings-field">
              <label>Email Address</label>
              <div className="settings-value">{user?.email || "user@example.com"}</div>
            </div>

            <div className="settings-field">
              <label>Persistent User ID (satup_user_id)</label>
              <div className="settings-value-with-action">
                <code className="settings-code">{userId}</code>
                <button onClick={copyUserId} className="secondary-btn" style={{ padding: "6px 12px", fontSize: "12px" }}>
                  {copied ? "Copied!" : "Copy ID"}
                </button>
              </div>
            </div>
          </div>

          {/* PREFERENCES SECTION */}
          <div className="settings-card">
            <h3>Processing Preferences</h3>
            <p className="settings-card-desc">Default resolution and format settings.</p>

            <div className="settings-field">
              <label>Super-Resolution Factor</label>
              <div className="settings-value">8× (Standard AI Model)</div>
            </div>

            <div className="settings-field">
              <label>Output Format</label>
              <div className="settings-value">PNG (Lossless)</div>
            </div>
          </div>

          {/* EXTENSION SECTION */}
          <div className="settings-card">
            <h3>Browser Extension</h3>
            <p className="settings-card-desc">
              Connect the SATUpscale Chrome extension to your local or cloud workspace.
            </p>

            <div className="settings-field">
              <label>Target Web Endpoint</label>
              <code className="settings-code">http://localhost:5173</code>
            </div>

            <div className="settings-field">
              <label>Direct Result Address</label>
              <code className="settings-code">/result/:jobId</code>
            </div>

            <p style={{ fontSize: "13px", color: "#686d77", marginTop: "12px", lineHeight: "1.6" }}>
              To test the extension: Open Chrome Extensions (`chrome://extensions`), enable Developer Mode, and click <strong>Load unpacked</strong> selecting the <code>extension</code> directory in this repository.
            </p>
          </div>

          {/* AUTHENTICATION SECTION */}
          <div className="settings-card">
            <h3>Session & Security</h3>
            <p className="settings-card-desc">Sign out or manage your active session.</p>

            <button
              onClick={logout}
              className="secondary-btn"
              style={{ color: "#b91c1c", borderColor: "#fca5a5" }}
            >
              Sign Out of SATUpscale
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
