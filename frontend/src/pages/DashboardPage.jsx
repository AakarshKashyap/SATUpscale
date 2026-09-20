import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import {
  getHistory,
  upscaleImage,
  getUserStats
} from "../services/api";
import {
  Upload,
  ArrowRight,
  Sparkles,
  FileImage,
  AlertCircle,
  Layers,
  Activity,
  Zap,
  Clock,
  Sliders
} from "lucide-react";

const SCALE_OPTIONS = [
  { value: null, label: "Auto" },
  { value: 2, label: "2×" },
  { value: 4, label: "4×" },
  { value: 8, label: "8×" },
  { value: 16, label: "16×" },
  { value: 32, label: "32×" }
];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [recentJobs, setRecentJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Integrated Upload State
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [scaleFactor, setScaleFactor] = useState(null);

  const userName = user?.name || user?.email?.split("@")[0] || "Explorer";

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [historyData, statsData] = await Promise.allSettled([
          getHistory(),
          getUserStats()
        ]);

        if (
          isMounted &&
          historyData.status === "fulfilled" &&
          Array.isArray(historyData.value?.jobs)
        ) {
          setRecentJobs(historyData.value.jobs);
        }

        if (
          isMounted &&
          statsData.status === "fulfilled" &&
          statsData.value
        ) {
          setStats(statsData.value);
        }
      } catch {
        if (isMounted) setRecentJobs([]);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selectedFile);
    setError("");

    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
  };

  const handleClearSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setError("");
    setScaleFactor(null);
  };

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpscaleSubmit = async () => {
    if (!file) return;

    setProcessing(true);
    setError("");

    try {
      const result = await upscaleImage(file, scaleFactor);

      if (result?.jobId) {
        navigate(`/result/${result.jobId}`);
      } else {
        // Refresh history and stats if backend queued the job
        const [updatedHistory, updatedStats] = await Promise.allSettled([
          getHistory(),
          getUserStats()
        ]);

        if (
          updatedHistory.status === "fulfilled" &&
          updatedHistory.value?.jobs
        ) {
          setRecentJobs(updatedHistory.value.jobs);
        }
        if (
          updatedStats.status === "fulfilled" &&
          updatedStats.value
        ) {
          setStats(updatedStats.value);
        }

        setFile(null);
        setPreviewUrl(null);
        setScaleFactor(null);
      }
    } catch (err) {
      if (
        err?.message?.includes("429") ||
        err?.message?.toLowerCase().includes("rate limit")
      ) {
        setError(
          "Rate limit exceeded (maximum 20 upscales per user per hour). Please wait before submitting another image."
        );
      } else if (
        err?.message?.includes("401") ||
        err?.message?.toLowerCase().includes("session")
      ) {
        setError(
          "Your authentication session expired or is unauthorized. Please sign in again."
        );
      } else {
        setError(
          err.message || "Enhancement request failed. Please try again."
        );
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="app-shell dark-theme-root aerospace-aesthetic">
      <AppNavbar />

      <main className="dashboard-page main-dashboard-container">

        {/* WORKSPACE HERO / INTRO */}
        <section className="dashboard-hero-section">
          <div className="hero-eyebrow-tag">
            <Layers className="icon-xs violet" />
            <span className="eyebrow-text">
              SATELLITE IMAGERY WORKSPACE
            </span>
          </div>

          <h1 className="dashboard-hero-title">
            Welcome, {userName}.
            <span className="title-muted-span">
              Transform satellite imagery into visual intelligence.
            </span>
          </h1>

          <p className="dashboard-hero-subtitle">
            Sub-meter super-resolution reconstruction and spatial analytics
            powered by deep neural cloud GPU pipelines.
          </p>
        </section>

        {/* AGGREGATE USER TELEMETRY & STATS (FROM /stats ENDPOINT) */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
            marginBottom: "28px"
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "16px 20px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", opacity: 0.6, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <FileImage style={{ width: 14, height: 14 }} />
              <span>Images Enhanced</span>
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "6px" }}>
              {stats?.totalImages ?? recentJobs.length}
            </div>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "16px 20px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", opacity: 0.6, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <Clock style={{ width: 14, height: 14 }} />
              <span>Avg Pipeline Time</span>
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "6px" }}>
              {stats?.averageProcessingTimeMs
                ? `${(stats.averageProcessingTimeMs / 1000).toFixed(2)}s`
                : "—"}
            </div>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "16px 20px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", opacity: 0.6, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <Zap style={{ width: 14, height: 14 }} />
              <span>Avg Scale Factor</span>
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "6px" }}>
              {stats?.averageScaleFactor
                ? `${stats.averageScaleFactor}×`
                : "—"}
            </div>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "16px 20px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", opacity: 0.6, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <Activity style={{ width: 14, height: 14 }} />
              <span>Avg Quality Score</span>
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "6px", color: stats?.averageInputQuality ? (stats.averageInputQuality >= 60 ? "#4ade80" : "#facc15") : "inherit" }}>
              {stats?.averageInputQuality
                ? `${stats.averageInputQuality}/100`
                : "—"}
            </div>
          </div>
        </section>

        {/* PRIMARY UPLOAD WORKSPACE ZONE */}
        <section className="dashboard-upload-section">
          <div
            className={`dashboard-dropzone ${
              dragActive ? "drag-active" : ""
            }`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <div className="dropzone-content">

              {previewUrl ? (
                <div className="dropzone-preview-container">
                  <img
                    src={previewUrl}
                    alt="Selected satellite image preview"
                    className="dropzone-preview-img"
                  />

                  <div className="dropzone-preview-meta">
                    <span className="meta-filename">
                      {file?.name}
                    </span>

                    <span className="meta-filesize">
                      {(file?.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              ) : (
                <div className="dropzone-icon-box">
                  <Upload className="icon-lg violet-glow" />
                </div>
              )}

              {!file ? (
                <>
                  <h3 className="dropzone-title">
                    DROP SATELLITE IMAGERY HERE
                  </h3>

                  <p className="dropzone-desc">
                    Supports PNG, JPG, or WEBP satellite rasters up to
                    2048×2048
                  </p>

                  <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                    <label className="primary-btn choose-file-btn">
                      <span>CHOOSE IMAGERY FILE</span>

                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleFileInputChange}
                        hidden
                      />
                    </label>
                  </div>
                </>
              ) : (
                <div className="dropzone-actions-stack">
                  {/* SCALE FACTOR SELECTOR */}
                  <div style={{ width: "100%", maxWidth: "380px", margin: "8px auto 14px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "600", marginBottom: "6px", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.8 }}>
                      Upscale Factor
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "6px" }}>
                      {SCALE_OPTIONS.map((opt) => {
                        const selected = scaleFactor === opt.value;
                        return (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => setScaleFactor(opt.value)}
                            disabled={processing}
                            style={{
                              padding: "6px 0",
                              borderRadius: "6px",
                              border: selected ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.15)",
                              background: selected ? "rgba(167, 139, 250, 0.2)" : "transparent",
                              color: selected ? "#c4b5fd" : "inherit",
                              fontWeight: selected ? "700" : "500",
                              fontSize: "11px",
                              cursor: processing ? "not-allowed" : "pointer"
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={handleUpscaleSubmit}
                    disabled={processing}
                    className="solid-light-btn upscale-submit-btn"
                  >
                    <span>
                      {processing
                        ? "ENHANCING VIA BACKEND..."
                        : `SUBMIT FOR ENHANCEMENT (${scaleFactor === null ? "Auto" : `${scaleFactor}×`}) →`}
                    </span>
                  </button>

                  <button
                    onClick={handleClearSelection}
                    disabled={processing}
                    className="ghost-btn cancel-file-btn"
                  >
                    CLEAR SELECTION
                  </button>

                </div>
              )}
            </div>
          </div>

          {error && (
            <div
              className="inline-error-banner dark-error mt-4"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertCircle className="icon-sm" />
                <span>{error}</span>
              </div>
              {(error.includes("401") || error.toLowerCase().includes("session")) && (
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="secondary-btn"
                  style={{ padding: "4px 10px", fontSize: "11px" }}
                >
                  Sign In
                </button>
              )}
            </div>
          )}
        </section>

        {/* ACTIVE PROCESSING TELEMETRY (IF PROCESSING) */}
        {processing && (
          <section className="dashboard-processing-banner mt-8">
            <div className="processing-status-indicator">
              <div className="status-dot-pulse" />
              <span>
                PROCESSING ENHANCEMENT JOB VIA AWS CLOUD PIPELINE
              </span>
            </div>

            <div className="processing-indeterminate-bar mt-4">
              <div className="bar-fill" />
            </div>
          </section>
        )}

        {/* RECENT ENHANCEMENTS — EDITORIAL IMAGE GALLERY */}
        <section className="dashboard-gallery-section mt-12">
          <div className="section-heading">
            <div>
              <span className="section-label">ACTIVITY</span>

              <h2>Recent Enhancements</h2>

              <p>
                Sub-meter super-resolution outputs processed for your
                workspace.
              </p>
            </div>

            {recentJobs.length > 0 && (
              <Link
                to="/history"
                className="minimal-text-link"
              >
                <span>VIEW ALL HISTORY</span>
                <ArrowRight className="icon-xs" />
              </Link>
            )}
          </div>

          {loadingHistory ? (
            <div className="dashboard-loading-state">
              <div className="loader" />
              <p>Retrieving enhancement history...</p>
            </div>
          ) : recentJobs.length > 0 ? (
            <div className="editorial-gallery-grid">

              {recentJobs.slice(0, 6).map((job) => {
                const actualScale =
                  job.actualScale ?? job.requestedScale ?? null;

                const scaleLabel = actualScale
                  ? `${actualScale}×`
                  : "AUTO";

                return (
                  <Link
                    key={job.jobId}
                    to={`/result/${job.jobId}`}
                    className="editorial-gallery-card"
                  >
                    <div className="gallery-image-wrapper">

                      {job.processedUrl ? (
                        <img
                          src={job.processedUrl}
                          alt={`Job ${job.jobId}`}
                          className="gallery-img"
                        />
                      ) : (
                        <div className="gallery-placeholder">
                          <FileImage className="icon-md text-muted-slate" />

                          <span>
                            {actualScale
                              ? `${scaleLabel} ENHANCED`
                              : "ENHANCED"}
                          </span>
                        </div>
                      )}

                      <div className="gallery-badge-tag">
                        {actualScale
                          ? `${scaleLabel} SUPER-RES`
                          : "SUPER-RES"}
                      </div>

                    </div>

                    <div className="gallery-card-meta">
                      <div className="gallery-meta-left">

                        <h4>
                          Job{" "}
                          {job.jobId
                            ? job.jobId.slice(0, 10)
                            : "Enhancement"}
                        </h4>

                        <p>
                          {job.timestamp
                            ? new Date(
                                job.timestamp * 1000
                              ).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric"
                                }
                              )
                            : "Recent Output"}
                        </p>

                      </div>

                      <div className="gallery-meta-right">
                        <span className="status-indicator-badge completed">
                          ✓ DONE
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}

            </div>
          ) : (
            /* INTENTIONAL EMPTY STATE */
            <div className="dashboard-empty-state">
              <div className="empty-icon-box">
                <Sparkles className="icon-lg violet-glow" />
              </div>

              <h3>YOUR FIRST ENHANCEMENT</h3>

              <p>
                Upload a satellite image using the workspace zone above
                to start the super-resolution reconstruction process.
              </p>
            </div>
          )}
        </section>

        {/* HISTORY SUMMARY LIST */}
        {recentJobs.length > 0 && (
          <section className="dashboard-history-list-section mt-16">

            <div className="section-heading mb-6">
              <div>
                <span className="section-label">RECORDS</span>
                <h2>Enhancement History Log</h2>
              </div>
            </div>

            <div className="history-table-container">
              <table className="history-table">

                <thead>
                  <tr>
                    <th>JOB ID</th>
                    <th>STATUS</th>
                    <th>PROCESSED DATE</th>
                    <th>ACTION</th>
                  </tr>
                </thead>

                <tbody>
                  {recentJobs.map((job) => (
                    <tr key={job.jobId}>

                      <td className="font-code text-violet-soft">
                        {job.jobId || "Direct Session"}
                      </td>

                      <td>
                        <span className={`status-pill ${job.status === "done" || job.status === "completed" || job.status === "success" ? "completed" : job.status === "failed" ? "error" : "pending"}`}>
                          {job.status
                            ? job.status.charAt(0).toUpperCase() + job.status.slice(1)
                            : "Completed"}
                        </span>
                      </td>

                      <td className="text-muted-slate text-sm">
                        {job.timestamp
                          ? new Date(
                              job.timestamp * 1000
                            ).toLocaleString()
                          : "Recorded"}
                      </td>

                      <td>
                        <Link
                          to={`/result/${job.jobId}`}
                          className="minimal-text-link"
                        >
                          OPEN RESULT →
                        </Link>
                      </td>

                    </tr>
                  ))}
                </tbody>

              </table>
            </div>

          </section>
        )}

      </main>

      <Footer />
    </div>
  );
}