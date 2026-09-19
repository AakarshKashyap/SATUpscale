import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { getHistory, upscaleImage } from "../services/api";
import {
  Upload,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  FileImage,
  AlertCircle,
  Layers
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [recentJobs, setRecentJobs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Integrated Upload State
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const userName = user?.name || user?.email?.split("@")[0] || "Explorer";

  useEffect(() => {
    let isMounted = true;
    async function loadRecent() {
      try {
        const data = await getHistory();
        if (isMounted && data && Array.isArray(data.jobs)) {
          setRecentJobs(data.jobs);
        }
      } catch {
        if (isMounted) setRecentJobs([]);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }
    loadRecent();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setError("");
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
  };

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
      const result = await upscaleImage(file);
      if (result?.outputUrl) {
        navigate(
          `/result/${result.jobId || "latest"}?image=${encodeURIComponent(
            result.outputUrl
          )}`
        );
      } else {
        // Refresh history if backend queued the job
        const updated = await getHistory();
        if (updated?.jobs) setRecentJobs(updated.jobs);
        setFile(null);
        setPreviewUrl(null);
      }
    } catch (err) {
      setError(
        err.message || "Enhancement request failed. Please try again."
      );
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
            <span className="eyebrow-text">SATELLITE IMAGERY WORKSPACE</span>
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

        {/* PRIMARY UPLOAD WORKSPACE ZONE */}
        <section className="dashboard-upload-section">
          <div
            className={`dashboard-dropzone ${dragActive ? "drag-active" : ""}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onLeave={handleDrag}
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
                    <span className="meta-filename">{file?.name}</span>
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
                  <h3 className="dropzone-title">DROP SATELLITE IMAGERY HERE</h3>
                  <p className="dropzone-desc">
                    Supports PNG, JPG, or WEBP satellite rasters up to 2048×2048
                  </p>
                  <label className="primary-btn choose-file-btn">
                    <span>CHOOSE IMAGERY FILE</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileInputChange}
                      hidden
                    />
                  </label>
                </>
              ) : (
                <div className="dropzone-actions-stack">
                  <button
                    onClick={handleUpscaleSubmit}
                    disabled={processing}
                    className="solid-light-btn upscale-submit-btn"
                  >
                    <span>
                      {processing ? "ENHANCING VIA BACKEND..." : "SUBMIT FOR 8× ENHANCEMENT →"}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setFile(null);
                      setPreviewUrl(null);
                    }}
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
            <div className="inline-error-banner dark-error mt-4">
              <AlertCircle className="icon-sm" />
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* ACTIVE PROCESSING TELEMETRY (IF PROCESSING) */}
        {processing && (
          <section className="dashboard-processing-banner mt-8">
            <div className="processing-status-indicator">
              <div className="status-dot-pulse" />
              <span>PROCESSING ENHANCEMENT JOB VIA AWS CLOUD PIPELINE</span>
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
              <p>Sub-meter super-resolution outputs processed for your workspace.</p>
            </div>

            {recentJobs.length > 0 && (
              <Link to="/history" className="minimal-text-link">
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
              {recentJobs.slice(0, 6).map((job) => (
                <Link
                  key={job.jobId}
                  to={`/result/${job.jobId}${
                    job.processedUrl
                      ? `?image=${encodeURIComponent(job.processedUrl)}`
                      : ""
                  }`}
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
                        <span>8× ENHANCED</span>
                      </div>
                    )}
                    <div className="gallery-badge-tag">8× SUPER-RES</div>
                  </div>

                  <div className="gallery-card-meta">
                    <div className="gallery-meta-left">
                      <h4>Job {job.jobId ? job.jobId.slice(0, 10) : "Enhancement"}</h4>
                      <p>
                        {job.timestamp
                          ? new Date(job.timestamp * 1000).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric", year: "numeric" }
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
              ))}
            </div>
          ) : (
            /* INTENTIONAL EMPTY STATE */
            <div className="dashboard-empty-state">
              <div className="empty-icon-box">
                <Sparkles className="icon-lg violet-glow" />
              </div>
              <h3>YOUR FIRST ENHANCEMENT</h3>
              <p>
                Upload a satellite image using the workspace zone above to start
                the super-resolution reconstruction process.
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
                        <span className="status-pill completed">Completed</span>
                      </td>
                      <td className="text-muted-slate text-sm">
                        {job.timestamp
                          ? new Date(job.timestamp * 1000).toLocaleString()
                          : "Recorded"}
                      </td>
                      <td>
                        <Link
                          to={`/result/${job.jobId}${
                            job.processedUrl
                              ? `?image=${encodeURIComponent(job.processedUrl)}`
                              : ""
                          }`}
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
