import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { getHistory } from "../services/api";

export default function HistoryPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState("");

  useEffect(() => {
    let isMounted = true;
    async function fetchJobs() {
      setLoading(true);
      try {
        const data = await getHistory();
        if (isMounted && data && Array.isArray(data.jobs)) {
          setJobs(data.jobs);
        }
      } catch {
        if (isMounted) {
          // Backend may be offline or no history yet for this user
          setJobs([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchJobs();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="app-shell dark-theme-root aerospace-aesthetic">
      <AppNavbar />

      <main className="history-section" style={{ minHeight: "80vh" }}>
        <div className="section-heading">
          <div>
            <span className="section-label">YOUR HISTORY</span>
            <h2>Enhancement History</h2>
            <p>Review and download all previously processed satellite imagery.</p>
          </div>

          <Link to="/enhance" className="primary-btn">
            + New Enhancement
          </Link>
        </div>

        {error && <div className="auth-error" style={{ marginBottom: "20px" }}>{error}</div>}

        {loading ? (
          <div className="empty-result" style={{ minHeight: "300px" }}>
            <div className="loader"></div>
            <h3>Loading history...</h3>
            <p>Fetching your enhancement records...</p>
          </div>
        ) : jobs.length > 0 ? (
          <div className="history-grid">
            {jobs.map((job) => (
              <div key={job.jobId} className="history-card">
                <div className="history-image">
                  {job.processedUrl ? (
                    <img
                      src={job.processedUrl}
                      alt="Processed satellite imagery"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span>8×</span>
                  )}
                  <span>8×</span>
                </div>

                <div className="history-info">
                  <div>
                    <h3 style={{ fontSize: "14px", wordBreak: "break-all" }}>
                      {job.jobId ? job.jobId.slice(0, 12) + "..." : "Job"}
                    </h3>
                    <p>
                      {job.timestamp
                        ? new Date(job.timestamp * 1000).toLocaleString()
                        : "Timestamp unavailable"}
                    </p>
                  </div>

                  <Link
                    to={`/result/${job.jobId}${
                      job.processedUrl
                        ? `?image=${encodeURIComponent(job.processedUrl)}`
                        : ""
                    }`}
                    className="status"
                    title="View result"
                  >
                    ✓
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-result" style={{ minHeight: "350px", borderRadius: "16px", border: "1px solid var(--color-border)", padding: "40px" }}>
            <div className="empty-icon">✦</div>
            <h3>No enhancement history yet</h3>
            <p>
              Your processed images will appear here once you enhance imagery using SATUpscale or the browser extension.
            </p>
            <Link to="/enhance" className="primary-btn" style={{ marginTop: "16px" }}>
              Start your first enhancement →
            </Link>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
