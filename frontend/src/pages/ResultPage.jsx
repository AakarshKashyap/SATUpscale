import { useParams, useSearchParams, Link } from "react-router-dom";
import PublicNavbar from "../components/PublicNavbar";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { Download, ArrowLeft, PlusCircle, CheckCircle2 } from "lucide-react";

export default function ResultPage() {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const outputUrl = searchParams.get("image");
  const derivedOutputUrl =
    !outputUrl && jobId && jobId !== "test-job"
      ? `https://srm-upscaler-outputs.s3.amazonaws.com/output/${jobId}.png`
      : null;

  const displayOutputUrl = outputUrl || derivedOutputUrl;
  const hasRealResult = Boolean(displayOutputUrl);
  const backLink = isAuthenticated ? "/dashboard" : "/";

  return (
    <div className="app-shell dark-theme-root aerospace-aesthetic">
      {isAuthenticated ? <AppNavbar /> : <PublicNavbar />}

      <main className="result-page main-dashboard-container">
        {/* HEADER */}
        <div className="result-page-header">
          <div>
            <span className="section-label">
              {hasRealResult ? "ENHANCEMENT RESULT" : "JOB STATUS"}
            </span>
            <h1>
              {hasRealResult ? "Super-Resolution Output" : "Processing Result"}
            </h1>
            <p>
              {hasRealResult
                ? "Sub-meter 8× super-resolution reconstruction returned by the SATUpscale deep learning pipeline."
                : "This enhancement job result is currently pending or output URL was not provided."}
            </p>
          </div>

          {hasRealResult && (
            <div className="result-status-badge">
              <CheckCircle2 className="icon-xs green" />
              <span>COMPLETED</span>
            </div>
          )}
        </div>

        {/* SIDE-BY-SIDE RESULT VIEWER (DESKTOP: SIDE-BY-SIDE, MOBILE: STACKED) */}
        <div className="result-viewer-container">
          {/* ORIGINAL PANEL */}
          <div className="result-image-card">
            <div className="image-label-badge">ORIGINAL SOURCE</div>
            <div className="no-image-placeholder">
              <span>Original Source Image</span>
            </div>
          </div>

          {/* PROCESSED OUTPUT PANEL */}
          <div className="result-image-card output-card">
            <div className="image-label-badge violet">SATUPSCALE ENHANCED · 8×</div>
            {displayOutputUrl ? (
              <img
                src={displayOutputUrl}
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

        {/* METADATA GRID */}
        <div className="result-details-grid">
          <div className="detail-item">
            <span className="detail-label">JOB IDENTIFIER</span>
            <strong className="detail-value font-code">
              {jobId || "Direct Session"}
            </strong>
          </div>

          <div className="detail-item">
            <span className="detail-label">MODEL PIPELINE</span>
            <strong className="detail-value">
              SATUpscale SRM-8x Super Resolution
            </strong>
          </div>

          <div className="detail-item">
            <span className="detail-label">PIPELINE STATUS</span>
            <strong className="detail-value text-green">
              {hasRealResult ? "Done / Completed" : "Pending"}
            </strong>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="result-actions-bar">
          {displayOutputUrl ? (
            <a
              href={displayOutputUrl}
              download={jobId ? `satup-${jobId}.png` : "enhanced-satellite.png"}
              target="_blank"
              rel="noopener noreferrer"
              className="solid-light-btn download-btn"
            >
              <Download className="icon-xs" />
              <span>DOWNLOAD ENHANCED RASTER</span>
            </a>
          ) : (
            <button className="solid-light-btn download-btn" disabled style={{ opacity: 0.5 }}>
              <span>NO OUTPUT AVAILABLE</span>
            </button>
          )}

          <Link to={backLink} className="ghost-btn">
            <ArrowLeft className="icon-xs" />
            <span>BACK TO WORKSPACE</span>
          </Link>

          <Link to="/enhance" className="ghost-btn">
            <PlusCircle className="icon-xs" />
            <span>ENHANCE ANOTHER IMAGE</span>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
