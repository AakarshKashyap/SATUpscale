import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { getHistory } from "../services/api";

export default function DashboardPage() {
  const { user } = useAuth();
  const [recentJobs, setRecentJobs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadRecent() {
      try {
        const data = await getHistory();
        if (isMounted && data && Array.isArray(data.jobs)) {
          setRecentJobs(data.jobs.slice(0, 3));
        }
      } catch {
        if (isMounted) {
          setRecentJobs([]);
        }
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }
    loadRecent();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="app">
      <AppNavbar />

      <main className="dashboard-page">
        <div className="dashboard-header-container">
          <div className="dashboard-welcome">
            <span className="section-label">APPLICATION HOME</span>
            <h1>Welcome, {user?.name || user?.email || "Explorer"}</h1>
            <p>
              Enhance satellite imagery, review your job history, and manage
              your account.
            </p>
          </div>

          <div className="dashboard-header-actions">
            <Link to="/enhance" className="primary-btn new-enhancement-btn">
              + New Enhancement
            </Link>
          </div>
        </div>

        {/* QUICK START CALLOUT */}
        <div className="quick-action-banner">
          <div className="quick-action-content">
            <h3>Ready to upscale satellite imagery?</h3>
            <p>
              Upload PNG, JPG, or WEBP imagery to submit to the SATUpscale
              backend pipeline.
            </p>
          </div>
          <Link to="/enhance" className="primary-btn">
            Open Enhancement Workspace →
          </Link>
        </div>

        {/* RECENT ENHANCEMENTS SECTION */}
        <section className="dashboard-recent-section">
          <div className="section-heading">
            <div>
              <span className="section-label">ACTIVITY</span>
              <h2>Recent Enhancements</h2>
              <p>Your latest super-resolution jobs from the backend.</p>
            </div>

            <Link to="/history" className="secondary-btn">
              View all history →
            </Link>
          </div>

          {loadingHistory ? (
            <div className="dashboard-loading-state">
              <div className="loader"></div>
              <p>Checking recent activity...</p>
            </div>
          ) : recentJobs.length > 0 ? (
            <div className="history-grid">
              {recentJobs.map((job) => (
                <div key={job.jobId} className="history-card">
                  <div className="history-image">
                    {job.processedUrl ? (
                      <img
                        src={job.processedUrl}
                        alt="Enhanced result"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover"
                        }}
                      />
                    ) : (
                      <span>8×</span>
                    )}
                  </div>

                  <div className="history-info">
                    <div>
                      <h3>
                        Job {job.jobId ? job.jobId.slice(0, 8) : "Enhancement"}
                      </h3>
                      <p>
                        {job.timestamp
                          ? new Date(
                              job.timestamp * 1000
                            ).toLocaleDateString()
                          : "Recently"}
                      </p>
                    </div>

                    <Link
                      to={`/result/${job.jobId}`}
                      className="status-link"
                      title="View job"
                    >
                      <span className="status">✓</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <div className="empty-icon">✦</div>
              <h3>No recent enhancements yet</h3>
              <p>
                Your completed jobs will appear here once you run an enhancement
                through the workspace or the browser extension.
              </p>
              <Link
                to="/enhance"
                className="primary-btn"
                style={{ marginTop: "16px" }}
              >
                Start an Enhancement
              </Link>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
