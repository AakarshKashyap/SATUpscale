import { useState, useEffect } from "react";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { getUserStats } from "../services/api";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const userId = user?.sub || "Unavailable";
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let isMounted = true;
    getUserStats()
      .then((data) => {
        if (isMounted && data) {
          setStats(data);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const copyUserId = () => {
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="app-shell dark-theme-root aerospace-aesthetic">
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

          {/* USAGE & PERFORMANCE STATS SECTION */}
          <div className="settings-card">
            <h3>Pipeline Usage & Statistics</h3>
            <p className="settings-card-desc">Aggregated inference telemetry from the backend API.</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginTop: "14px" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: "11px", opacity: 0.65, textTransform: "uppercase" }}>Total Images</span>
                <div style={{ fontSize: "20px", fontWeight: "700", marginTop: "4px" }}>{stats?.totalImages ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: "11px", opacity: 0.65, textTransform: "uppercase" }}>Avg Latency</span>
                <div style={{ fontSize: "20px", fontWeight: "700", marginTop: "4px" }}>
                  {stats?.averageProcessingTimeMs ? `${(stats.averageProcessingTimeMs / 1000).toFixed(2)}s` : "N/A"}
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: "11px", opacity: 0.65, textTransform: "uppercase" }}>Avg Scale Factor</span>
                <div style={{ fontSize: "20px", fontWeight: "700", marginTop: "4px" }}>
                  {stats?.averageScaleFactor ? `${stats.averageScaleFactor}×` : "N/A"}
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: "11px", opacity: 0.65, textTransform: "uppercase" }}>Avg Input Quality</span>
                <div style={{ fontSize: "20px", fontWeight: "700", marginTop: "4px", color: (stats?.averageInputQuality ?? 70) >= 60 ? "#4ade80" : "#facc15" }}>
                  {stats?.averageInputQuality ? `${stats.averageInputQuality}/100` : "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* PREFERENCES SECTION */}
          <div className="settings-card">
            <h3>Processing Preferences</h3>
            <p className="settings-card-desc">Default resolution and format settings.</p>

            <div className="settings-field">
              <label>Super-Resolution Factor</label>
              <div className="settings-value">Auto-adaptive (2× to 32× EDSR Chaining)</div>
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
              Connect the SATUpscale Chrome extension to your active workspace.
            </p>

            <div className="settings-field">
              <label>Target Web Endpoint</label>
              <code className="settings-code">{typeof window !== "undefined" ? window.location.origin : "https://satupscale.com"}</code>
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
