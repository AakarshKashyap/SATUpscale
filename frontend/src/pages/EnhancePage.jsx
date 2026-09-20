import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { upscaleImage } from "../services/api";

export default function EnhancePage() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleFile = (event) => {
    const selected = event.target.files[0];
    if (!selected) return;

    setFile(selected);
    setResultData(null);
    setError("");

    const imageUrl = URL.createObjectURL(selected);
    setPreviewUrl(imageUrl);
  };

  const handleUpscale = async () => {
    if (!file) return;

    setProcessing(true);
    setError("");
    setResultData(null);

    try {
      // Call the real backend upscale API.
      // The result must come from the backend response: { jobId, outputUrl, status }
      const data = await upscaleImage(file);
      setResultData(data);
    } catch (err) {
      // Surface the real error. Do NOT fall back to displaying the local
      // preview as an enhanced result — that would be fabricated output.
      setError(
        err.message ||
          "Enhancement failed. Please check your connection and try again."
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreviewUrl(null);
    setResultData(null);
    setError("");
  };

  const hasRealResult =
    resultData && resultData.outputUrl && resultData.status === "done";

  return (
    <div className="app-shell dark-theme-root aerospace-aesthetic">
      <AppNavbar />

      <main className="dashboard-section" style={{ minHeight: "80vh" }}>
        <div className="section-heading">
          <div>
            <span className="section-label">WORKSPACE</span>
            <h2>Enhance an image</h2>
            <p>
              Upload satellite imagery and generate an AI-enhanced 8× version.
            </p>
          </div>
        </div>

        {error && (
          <div className="auth-error" style={{ marginBottom: "20px" }}>
            {error}
          </div>
        )}

        <div className="workspace">
          {/* UPLOAD PANEL */}
          <div className="upload-panel">
            <div className="upload-icon">↑</div>

            <h3>{file ? file.name : "Upload satellite image"}</h3>

            <p>PNG, JPG or WEBP · Recommended up to 2048×2048</p>

            <label className="upload-btn">
              Choose Image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFile}
              />
            </label>

            {file && (
              <button
                className="process-btn"
                onClick={handleUpscale}
                disabled={processing}
              >
                {processing ? "Enhancing..." : "Upscale 8× →"}
              </button>
            )}

            {file && !processing && (
              <button
                onClick={handleReset}
                className="secondary-btn"
                style={{
                  marginTop: "10px",
                  fontSize: "12px",
                  padding: "6px 12px"
                }}
              >
                Reset Image
              </button>
            )}
          </div>

          {/* RESULT PANEL */}
          <div className="result-panel">
            {!hasRealResult && !processing && (
              <div className="empty-result">
                {previewUrl ? (
                  <div
                    style={{
                      maxWidth: "280px",
                      maxHeight: "240px",
                      overflow: "hidden",
                      borderRadius: "12px",
                      marginBottom: "15px"
                    }}
                  >
                    <img
                      src={previewUrl}
                      alt="Selected preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover"
                      }}
                    />
                  </div>
                ) : (
                  <div className="empty-icon">✦</div>
                )}

                <h3>
                  {previewUrl
                    ? "Ready to upscale"
                    : "Your enhanced image will appear here"}
                </h3>

                <p>
                  {previewUrl
                    ? "Click 'Upscale 8× →' on the left to submit to the backend."
                    : "Upload an image to start the super-resolution process."}
                </p>
              </div>
            )}

            {processing && (
              <div className="empty-result">
                <div className="loader"></div>
                <h3>Processing via backend...</h3>
                <p>
                  Your image has been submitted. Waiting for the SATUpscale
                  pipeline to return the enhanced result.
                </p>
              </div>
            )}

            {hasRealResult && (
              <div className="result">
                <div className="result-header">
                  <div>
                    <span className="section-label">RESULT</span>
                    <h3>Enhancement complete</h3>
                  </div>
                  <span className="completed">● Completed</span>
                </div>

                <div className="comparison">
                  <div
                    className="before"
                    style={
                      previewUrl
                        ? {
                            backgroundImage: `url(${previewUrl})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center"
                          }
                        : {}
                    }
                  >
                    <span>BEFORE</span>
                  </div>

                  {/* Only show the AFTER panel when we have a real backend outputUrl */}
                  <div
                    className="after"
                    style={{
                      backgroundImage: `url(${resultData.outputUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center"
                    }}
                  >
                    <span>AFTER · 8×</span>
                  </div>
                </div>

                <div className="result-actions">
                  <a
                    href={resultData.outputUrl}
                    download={`satup-${resultData.jobId}.png`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="primary-btn"
                  >
                    Download Enhanced Image
                  </a>

                  <button
                    onClick={() =>
                      navigate(
                        `/result/${resultData.jobId}?image=${encodeURIComponent(
                          resultData.outputUrl
                        )}`
                      )
                    }
                    className="secondary-btn"
                  >
                    View Full Details →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
