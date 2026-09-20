import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PublicNavbar from "../components/PublicNavbar";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { getUpscaleJob } from "../services/api";
import {
  Download,
  ArrowLeft,
  PlusCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle
} from "lucide-react";

export default function ResultPage() {
  const { jobId } = useParams();
  const { isAuthenticated } = useAuth();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadJob() {
      if (!jobId) {
        setError("No enhancement job was specified.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const result = await getUpscaleJob(jobId);

        if (!cancelled) {
          setJob(result);
        }
      } catch (err) {
        console.error("Failed to load enhancement result:", err);

        if (!cancelled) {
          setError(
            err?.message || "Unable to load the enhancement result."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadJob();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const originalUrl = job?.originalUrl || null;

  const processedUrl =
    job?.processedUrl ||
    job?.outputUrl ||
    null;

  const hasResult = Boolean(processedUrl);

  const inputQualityScore =
    job?.qualityAssessment?.inputQualityScore ??
    job?.inputQualityScore ??
    job?.inputQuality ??
    null;

  const qualityWarning =
    job?.qualityAssessment?.qualityWarning ??
    job?.qualityWarning ??
    null;

  const blurWarning =
    job?.qualityAssessment?.blurWarning ??
    job?.blurWarning ??
    null;

  const isCompleted =
    job?.status === "done" ||
    job?.status === "completed" ||
    job?.status === "success" ||
    hasResult;

  const backLink = isAuthenticated ? "/dashboard" : "/";

  /*
   * Download the processed image as a Blob.
   *
   * This is necessary because the processed image is hosted
   * on S3 using a presigned URL, so the normal HTML
   * download attribute may open the image instead.
   */
  const handleDownload = async () => {
    if (!processedUrl || downloading) return;

    try {
      setDownloading(true);

      const response = await fetch(processedUrl);

      if (!response.ok) {
        throw new Error(
          `Download request failed (${response.status})`
        );
      }

      const blob = await response.blob();

      if (!blob || blob.size === 0) {
        throw new Error("The downloaded image is empty.");
      }

      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = jobId
        ? `satup-${jobId}.png`
        : "enhanced-satellite.png";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Give the browser a moment to start the download
      // before releasing the Blob URL.
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (downloadError) {
      console.error("Download failed:", downloadError);

      alert(
        "Unable to download the enhanced image. Please check the browser console for details."
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="app-shell dark-theme-root aerospace-aesthetic">
      {isAuthenticated ? <AppNavbar /> : <PublicNavbar />}

      <main className="result-page main-dashboard-container">
        {/* HEADER */}
        <div className="result-page-header">
          <div>
            <span className="section-label">
              {loading
                ? "LOADING RESULT"
                : hasResult
                  ? "ENHANCEMENT RESULT"
                  : "JOB STATUS"}
            </span>

            <h1>
              {loading
                ? "Loading Result"
                : hasResult
                  ? "Super-Resolution Output"
                  : "Processing Result"}
            </h1>

            <p>
              {loading
                ? "Retrieving your enhancement result from the SATUpscale pipeline."
                : error
                  ? error
                  : "Super-resolution reconstruction returned by the SATUpscale deep learning pipeline."}
            </p>
          </div>

          {isCompleted && !loading && (
            <div className="result-status-badge">
              <CheckCircle2 className="icon-xs green" />
              <span>COMPLETED</span>
            </div>
          )}
        </div>

        {/* LOADING */}
        {loading && (
          <div className="result-viewer-container">
            <div className="result-image-card">
              <div className="no-image-placeholder">
                <Loader2 className="animate-spin" />
                <span>Loading original image...</span>
              </div>
            </div>

            <div className="result-image-card">
              <div className="no-image-placeholder">
                <Loader2 className="animate-spin" />
                <span>Loading enhanced image...</span>
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {!loading && error && (
          <div className="result-viewer-container">
            <div
              className="result-image-card"
              style={{ gridColumn: "1 / -1" }}
            >
              <div className="no-image-placeholder">
                <span>{error}</span>
              </div>
            </div>
          </div>
        )}

        {/* RESULT */}
        {!loading && !error && (
          <>
            <div className="result-viewer-container">
              {/* ORIGINAL PANEL */}
              <div className="result-image-card">
                <div className="image-label-badge">
                  ORIGINAL SOURCE
                </div>

                {originalUrl ? (
                  <img
                    src={originalUrl}
                    alt="Original satellite imagery"
                    className="result-output-img"
                  />
                ) : (
                  <div className="no-image-placeholder">
                    <span>Original image unavailable</span>
                  </div>
                )}
              </div>

              {/* PROCESSED OUTPUT PANEL */}
              <div className="result-image-card output-card">
                <div className="image-label-badge violet">
                  SATUPSCALE ENHANCED ·{" "}
                  {job?.actualScale ||
                    job?.requestedScale ||
                    8}
                  ×
                </div>

                {processedUrl ? (
                  <img
                    src={processedUrl}
                    alt="SATUpscale processed satellite imagery"
                    className="result-output-img"
                  />
                ) : (
                  <div className="no-image-placeholder">
                    <span>No processed output available</span>
                  </div>
                )}
              </div>
            </div>

            {/* WARNING NOTICES */}
            {(qualityWarning || blurWarning) && (
              <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {qualityWarning && (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "8px",
                      background: "rgba(234, 179, 8, 0.12)",
                      border: "1px solid rgba(234, 179, 8, 0.35)",
                      color: "#fde047",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px"
                    }}
                  >
                    <AlertTriangle style={{ width: 18, height: 18, flexShrink: 0 }} />
                    <span><strong>Input Quality Warning:</strong> {qualityWarning}</span>
                  </div>
                )}

                {blurWarning && (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "8px",
                      background: "rgba(234, 179, 8, 0.12)",
                      border: "1px solid rgba(234, 179, 8, 0.35)",
                      color: "#fde047",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px"
                    }}
                  >
                    <AlertTriangle style={{ width: 18, height: 18, flexShrink: 0 }} />
                    <span><strong>Blur Detection Warning:</strong> {blurWarning}</span>
                  </div>
                )}
              </div>
            )}

            {/* METADATA GRID */}
            <div className="result-details-grid">
              <div className="detail-item">
                <span className="detail-label">
                  JOB IDENTIFIER
                </span>

                <strong className="detail-value font-code">
                  {jobId}
                </strong>
              </div>

              <div className="detail-item">
                <span className="detail-label">
                  SCALE FACTOR
                </span>

                <strong className="detail-value text-violet-soft">
                  {job?.actualScaleFactor ||
                    job?.actualScale ||
                    job?.scaleFactor ||
                    job?.requestedScale ||
                    8}
                  × Super-Resolution
                </strong>
              </div>

              <div className="detail-item">
                <span className="detail-label">
                  INPUT QUALITY SCORE
                </span>

                <strong
                  className="detail-value"
                  style={{
                    color:
                      inputQualityScore !== null
                        ? inputQualityScore >= 60
                          ? "#4ade80"
                          : inputQualityScore >= 40
                            ? "#facc15"
                            : "#f87171"
                        : "inherit"
                  }}
                >
                  {inputQualityScore !== null
                    ? `${inputQualityScore} / 100`
                    : "Not Assessed"}
                </strong>
              </div>

              <div className="detail-item">
                <span className="detail-label">
                  MODEL PIPELINE
                </span>

                <strong className="detail-value">
                  {job?.upscaleMethod
                    ? `SATUpscale ${job.upscaleMethod.toUpperCase()}`
                    : "SATUpscale EDSR Pipeline"}
                </strong>
              </div>

              <div className="detail-item">
                <span className="detail-label">
                  PIPELINE STATUS
                </span>

                <strong className="detail-value text-green">
                  {isCompleted
                    ? "Done / Completed"
                    : job?.status || "Pending"}
                </strong>
              </div>

              <div className="detail-item">
                <span className="detail-label">
                  PRESIGNED LINK EXPIRY
                </span>

                <strong className="detail-value text-muted-slate" style={{ fontSize: "12px" }}>
                  1 Hour (Refreshed on load)
                </strong>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="result-actions-bar">
              {processedUrl ? (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="solid-light-btn download-btn"
                  style={{
                    opacity: downloading ? 0.6 : 1,
                    cursor: downloading
                      ? "wait"
                      : "pointer"
                  }}
                >
                  {downloading ? (
                    <Loader2 className="icon-xs animate-spin" />
                  ) : (
                    <Download className="icon-xs" />
                  )}

                  <span>
                    {downloading
                      ? "DOWNLOADING..."
                      : "DOWNLOAD ENHANCED RASTER"}
                  </span>
                </button>
              ) : (
                <button
                  className="solid-light-btn download-btn"
                  disabled
                  style={{ opacity: 0.5 }}
                >
                  <span>NO OUTPUT AVAILABLE</span>
                </button>
              )}

              <Link
                to={backLink}
                className="ghost-btn"
              >
                <ArrowLeft className="icon-xs" />
                <span>BACK TO WORKSPACE</span>
              </Link>

              <Link
                to="/enhance"
                className="ghost-btn"
              >
                <PlusCircle className="icon-xs" />
                <span>ENHANCE ANOTHER IMAGE</span>
              </Link>
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}