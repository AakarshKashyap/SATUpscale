import { useParams, useSearchParams, Link } from "react-router-dom";
import PublicNavbar from "../components/PublicNavbar";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";

export default function ResultPage() {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  // ?image= is the real backend outputUrl passed via URL (e.g. from EnhancePage or the
  // Chrome extension's "Open with SATUpscale" button). It is the actual processed output.
  const outputUrl = searchParams.get("image");

  // If we only have a jobId and no outputUrl, derive the S3 URL by convention.
  // This only works when the S3 bucket is public and the object exists.
  // Do NOT construct a speculative URL for test-job or unknown jobs.
  const derivedOutputUrl =
    !outputUrl && jobId && jobId !== "test-job"
      ? `https://srm-upscaler-outputs.s3.amazonaws.com/output/${jobId}.png`
      : null;

  const displayOutputUrl = outputUrl || derivedOutputUrl;

  // We only assert "AI Enhanced" when we have a real outputUrl from the backend.
  // For test-job or bare jobId with no image, show a neutral pending state.
  const hasRealResult = Boolean(displayOutputUrl);
  const backLink = isAuthenticated ? "/dashboard" : "/";

  return (
    <div className="app">
      {isAuthenticated ? <AppNavbar /> : <PublicNavbar />}

      <main className="result-page">
        <div className="result-page-header">
          <div>
            <span className="section-label">
              {hasRealResult ? "ENHANCEMENT RESULT" : "JOB STATUS"}
            </span>
            <h1>
              {hasRealResult ? "Enhancement Complete" : "Result Pending"}
            </h1>
            <p>
              {hasRealResult
                ? "Your satellite image has been processed by the SATUpscale backend."
                : "This job result is not yet available or the output URL was not provided."}
            </p>
          </div>

          {hasRealResult && (
            <div className="result-status">
              <span>●</span> Completed
            </div>
          )}
        </div>

        <div className="result-viewer">
          {/* ORIGINAL — only meaningful when the extension passes the source image via ?image= */}
          <div className="result-image-card">
            <div className="image-label">ORIGINAL</div>
            <div className="no-image">
              Original not stored client-side
            </div>
          </div>

          {/* PROCESSED OUTPUT — from the real backend outputUrl */}
          <div className="result-image-card">
            <div className="image-label">PROCESSED OUTPUT</div>
            {displayOutputUrl ? (
              <img
                src={displayOutputUrl}
                alt="SATUpscale processed satellite imagery"
              />
            ) : (
              <div className="no-image">
                No processed output available
              </div>
            )}
            {hasRealResult && (
              <div className="ai-tag">SATUP · 8×</div>
            )}
          </div>
        </div>

        <div className="result-details">
          <div>
            <span>Job ID</span>
            <strong style={{ fontSize: "13px", wordBreak: "break-all" }}>
              {jobId || "Direct Session"}
            </strong>
          </div>

          <div>
            <span>Output Source</span>
            <strong>
              {outputUrl ? "Backend response" : derivedOutputUrl ? "S3 (derived)" : "Unavailable"}
            </strong>
          </div>

          <div>
            <span>Status</span>
            <strong>{hasRealResult ? "Done" : "Pending / Unknown"}</strong>
          </div>
        </div>

        <div className="result-actions">
          {displayOutputUrl ? (
            <a
              href={displayOutputUrl}
              download={jobId ? `satup-${jobId}.png` : "enhanced-satellite.png"}
              target="_blank"
              rel="noopener noreferrer"
              className="primary-btn"
            >
              ↓ Download Output
            </a>
          ) : (
            <button
              className="primary-btn"
              disabled
              style={{ opacity: 0.5 }}
            >
              ↓ No Output Available
            </button>
          )}

          <Link to={backLink} className="secondary-btn">
            ← Back to SATUpscale
          </Link>

          <Link to="/enhance" className="secondary-btn">
            + Enhance Another Image
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
