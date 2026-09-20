import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppNavbar from "../components/AppNavbar";
import Footer from "../components/Footer";
import { upscaleImage } from "../services/api";
import { AlertTriangle, AlertCircle } from "lucide-react";

const SCALE_OPTIONS = [
  { value: null, label: "Auto" },
  { value: 2, label: "2×" },
  { value: 4, label: "4×" },
  { value: 8, label: "8×" },
  { value: 16, label: "16×" }
];

export default function EnhancePage() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [error, setError] = useState("");
  const [scaleFactor, setScaleFactor] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFile = (event) => {
    const selected = event.target.files[0];
    if (!selected) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

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
      // null = let the backend automatically choose the scale.
      const data = await upscaleImage(file, scaleFactor);

      setResultData(data);
    } catch (err) {
      console.error("Enhancement failed:", err);

      if (err?.message?.includes("429") || err?.message?.toLowerCase().includes("rate limit")) {
        setError(
          "Rate limit exceeded (maximum 20 upscales per user per hour). Please wait before submitting another image."
        );
      } else if (err?.message?.includes("401") || err?.message?.toLowerCase().includes("session")) {
        setError(
          "Your authentication session expired or is unauthorized. Please sign in again."
        );
      } else {
        setError(
          err?.message ||
            "Enhancement failed. Please check your connection and try again."
        );
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(null);
    setPreviewUrl(null);
    setResultData(null);
    setError("");
    setScaleFactor(null);
  };

  const handleDownload = async () => {
    const targetUrl = resultData?.outputUrl || resultData?.processedUrl;
    if (!targetUrl || downloading) return;

    try {
      setDownloading(true);

      const response = await fetch(targetUrl);
      if (!response.ok) {
        throw new Error(`Download request failed (${response.status})`);
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error("The downloaded image is empty.");
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = resultData?.jobId
        ? `satup-${resultData.jobId}.png`
        : "enhanced-satellite.png";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (downloadError) {
      console.error("Download failed:", downloadError);
      alert("Unable to download the enhanced image. Please check your network connection.");
    } finally {
      setDownloading(false);
    }
  };

  const actualScale =
    resultData?.actualScale ||
    resultData?.actualScaleFactor ||
    resultData?.requestedScale ||
    resultData?.scaleFactor ||
    scaleFactor ||
    null;

  const inputQualityScore =
    resultData?.qualityAssessment?.inputQualityScore ??
    resultData?.inputQualityScore ??
    resultData?.inputQuality;

  const qualityWarning =
    resultData?.qualityAssessment?.qualityWarning ??
    resultData?.qualityWarning;

  const blurWarning =
    resultData?.qualityAssessment?.blurWarning ??
    resultData?.blurWarning;

  const hasRealResult =
    resultData &&
    (resultData.outputUrl || resultData.processedUrl) &&
    (
      resultData.status === "done" ||
      resultData.status === "completed" ||
      resultData.status === "success"
    );

  const displayOutputUrl = resultData?.outputUrl || resultData?.processedUrl;

  return (
    <div className="app-shell dark-theme-root aerospace-aesthetic">
      <AppNavbar />

      <main className="dashboard-section" style={{ minHeight: "80vh" }}>
        <div className="section-heading">
          <div>
            <span className="section-label">WORKSPACE</span>

            <h2>Enhance an image</h2>

            <p>
              Upload satellite imagery and generate an AI-enhanced
              super-resolution image.
            </p>
          </div>
        </div>

        {error && (
          <div
            className="auth-error"
            style={{
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <AlertCircle style={{ width: 18, height: 18, flexShrink: 0 }} />
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

        <div className="workspace">
          {/* UPLOAD PANEL */}
          <div className="upload-panel">
            <div className="upload-icon">↑</div>

            <h3>{file ? file.name : "Upload satellite image"}</h3>

            <p>PNG, JPG or WEBP · Recommended up to 2048×2048</p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
              <label className="upload-btn">
                Choose Image

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFile}
                />
              </label>
            </div>


            {/* SCALE SELECTOR */}
            {file && (
              <div
                style={{
                  marginTop: "20px",
                  width: "100%"
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    marginBottom: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase"
                  }}
                >
                  Upscale Factor
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "8px"
                  }}
                >
                  {SCALE_OPTIONS.map((option) => {
                    const selected = scaleFactor === option.value;

                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setScaleFactor(option.value)}
                        disabled={processing}
                        style={{
                          padding: "9px 8px",
                          borderRadius: "8px",
                          border: selected
                            ? "1px solid currentColor"
                            : "1px solid rgba(255,255,255,0.15)",
                          background: selected
                            ? "rgba(255,255,255,0.12)"
                            : "transparent",
                          color: "inherit",
                          cursor: processing ? "not-allowed" : "pointer",
                          fontSize: "12px",
                          fontWeight: selected ? "700" : "500",
                          opacity: processing ? 0.6 : 1
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <p
                  style={{
                    marginTop: "9px",
                    fontSize: "11px",
                    opacity: 0.65
                  }}
                >
                  {scaleFactor === null
                    ? "Backend will automatically select the appropriate scale."
                    : `The backend will process this image at ${scaleFactor}×.`}
                </p>
              </div>
            )}

            {file && (
              <button
                className="process-btn"
                onClick={handleUpscale}
                disabled={processing}
              >
                {processing
                  ? "Enhancing..."
                  : `Upscale ${scaleFactor === null ? "Auto" : `${scaleFactor}×`} →`}
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
                    ? `Click the ${
                        scaleFactor === null
                          ? "Auto"
                          : `${scaleFactor}×`
                      } upscale button to submit to the backend.`
                    : "Upload an image to start the super-resolution process."}
                </p>
              </div>
            )}

            {/* PROCESSING */}
            {processing && (
              <div className="empty-result">
                <div className="loader"></div>

                <h3>Processing via backend...</h3>

                <p>
                  Your image has been submitted. Waiting for the SATUpscale
                  pipeline to return the enhanced result.
                </p>

                <p style={{ opacity: 0.7 }}>
                  Requested scale:{" "}
                  {scaleFactor === null ? "Auto" : `${scaleFactor}×`}
                </p>
              </div>
            )}

            {/* REAL BACKEND RESULT */}
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
                  {/* BEFORE */}
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

                  {/* AFTER */}
                  <div
                    className="after"
                    style={{
                      backgroundImage: `url(${displayOutputUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center"
                    }}
                  >
                    <span>AFTER{actualScale ? ` · ${actualScale}×` : ""}</span>
                  </div>
                </div>

                {/* QUALITY SCORE ASSESSMENT */}
                {inputQualityScore !== undefined && inputQualityScore !== null && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "12px 16px",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "11px", letterSpacing: "0.08em", opacity: 0.7, textTransform: "uppercase" }}>
                        Input Quality Assessment
                      </span>
                      <div style={{ fontSize: "14px", fontWeight: "600", marginTop: "2px" }}>
                        Score: <strong style={{ color: inputQualityScore >= 60 ? "#4ade80" : inputQualityScore >= 40 ? "#facc15" : "#f87171" }}>{inputQualityScore}</strong> / 100
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontWeight: "600",
                        background: inputQualityScore >= 60 ? "rgba(74, 222, 128, 0.15)" : inputQualityScore >= 40 ? "rgba(250, 204, 21, 0.15)" : "rgba(248, 113, 113, 0.15)",
                        color: inputQualityScore >= 60 ? "#4ade80" : inputQualityScore >= 40 ? "#facc15" : "#f87171"
                      }}
                    >
                      {inputQualityScore >= 70 ? "Optimal Clarity" : inputQualityScore >= 50 ? "Acceptable" : "Low Resolution"}
                    </span>
                  </div>
                )}

                {/* QUALITY WARNING */}
                {qualityWarning && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "rgba(234, 179, 8, 0.12)",
                      border: "1px solid rgba(234, 179, 8, 0.35)",
                      color: "#fde047",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <span><strong>Quality Notice:</strong> {qualityWarning}</span>
                  </div>
                )}

                {/* BLUR WARNING */}
                {blurWarning && (
                  <div
                    style={{
                      marginTop: "8px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "rgba(234, 179, 8, 0.12)",
                      border: "1px solid rgba(234, 179, 8, 0.35)",
                      color: "#fde047",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <span><strong>Blur Notice:</strong> {blurWarning}</span>
                  </div>
                )}

                <div className="result-actions">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    className="primary-btn"
                    style={{
                      opacity: downloading ? 0.7 : 1,
                      cursor: downloading ? "wait" : "pointer"
                    }}
                  >
                    {downloading ? "Downloading..." : "Download Enhanced Image"}
                  </button>

                  <button
                    onClick={() =>
                      navigate(`/result/${resultData.jobId}`)
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