import { useState } from "react";
import "./App.css";

function ResultPage() {
  const params = new URLSearchParams(window.location.search);
  const imageUrl = params.get("image");

  return (
    <div className="app">

      <nav className="navbar">
        <div className="logo">
          <span className="logo-mark">S</span>
          SATUpscale
        </div>

        <div className="nav-links">
          <a href="/">Home</a>
          <a href="/#dashboard">Dashboard</a>
          <a href="/#history">History</a>
        </div>

        <button className="login-btn">
          Sign In
        </button>
      </nav>


      <main className="result-page">

        <div className="result-page-header">

          <div>
            <span className="section-label">
              AI ENHANCEMENT
            </span>

            <h1>
              Enhancement Complete
            </h1>

            <p>
              Your satellite image has been enhanced using
              SATUpscale super-resolution.
            </p>
          </div>

          <div className="result-status">
            <span>●</span>
            Completed
          </div>

        </div>


        <div className="result-viewer">

          <div className="result-image-card">

            <div className="image-label">
              ORIGINAL
            </div>

            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Original satellite imagery"
              />
            ) : (
              <div className="no-image">
                No image available
              </div>
            )}

          </div>


          <div className="result-image-card enhanced">

            <div className="image-label">
              SATUP · 8×
            </div>

            {imageUrl ? (
              <img
                src={imageUrl}
                alt="SATUpscale enhanced satellite imagery"
              />
            ) : (
              <div className="no-image">
                No image available
              </div>
            )}

            <div className="ai-tag">
              AI ENHANCED · 8×
            </div>

          </div>

        </div>


        <div className="result-details">

          <div>
            <span>Scale Factor</span>
            <strong>8×</strong>
          </div>

          <div>
            <span>Processing</span>
            <strong>Demo Mode</strong>
          </div>

          <div>
            <span>Model</span>
            <strong>SATUpscale AI</strong>
          </div>

        </div>


        <div className="result-actions">

          <button className="primary-btn">
            ↓ Download Enhanced Image
          </button>

          <a
            href="/"
            className="secondary-btn"
          >
            ← Back to SATUpscale
          </a>

        </div>

      </main>


      <footer>

        <div className="logo">
          <span className="logo-mark">S</span>
          SATUpscale
        </div>

        <p>
          Satellite imagery enhanced by AI.
        </p>

      </footer>

    </div>
  );
}


function HomePage() {

const [file, setFile] = useState(null);
const [previewUrl, setPreviewUrl] = useState(null);
const [processing, setProcessing] = useState(false);
const [result, setResult] = useState(false);

const handleFile = (event) => {
  const selected = event.target.files[0];

  if (!selected) return;

  setFile(selected);
  setResult(false);

  const imageUrl = URL.createObjectURL(selected);

  setPreviewUrl(imageUrl);
};


  const handleUpscale = () => {

    if (!file) return;

    setProcessing(true);

    setTimeout(() => {

      setProcessing(false);
      setResult(true);

    }, 2500);

  };


  return (

    <div className="app">

      <nav className="navbar">

        <div className="logo">
          <span className="logo-mark">S</span>
          SATUpscale
        </div>

        <div className="nav-links">
          <a href="#home">Home</a>
          <a href="#dashboard">Dashboard</a>
          <a href="#history">History</a>
        </div>

        <button className="login-btn">
          Sign In
        </button>

      </nav>


      <section className="hero" id="home">

        <div className="hero-content">

          <div className="badge">
            ✦ AI-Powered Satellite Super Resolution
          </div>

          <h1>
            See more detail.
            <br />
            <span>From every pixel.</span>
          </h1>

          <p>
            Enhance satellite imagery with AI-powered 8×
            super-resolution. Upload an image or use the
            SATUpscale browser extension.
          </p>

          <div className="hero-actions">

            <a
              href="#dashboard"
              className="primary-btn"
            >
              Try SATUpscale →
            </a>

            <button className="secondary-btn">
              Install Extension
            </button>

          </div>

        </div>


        <div className="hero-visual">

          <div className="satellite-card">

            <div className="satellite-grid"></div>

            <div className="satellite-label">

              <span>AI ENHANCED</span>

              <strong>8×</strong>

            </div>

          </div>

        </div>

      </section>


      <section
        className="dashboard-section"
        id="dashboard"
      >

        <div className="section-heading">

          <div>

            <span className="section-label">
              WORKSPACE
            </span>

            <h2>
              Enhance an image
            </h2>

            <p>
              Upload satellite imagery and generate
              an AI-enhanced version.
            </p>

          </div>

        </div>


        <div className="workspace">

          <div className="upload-panel">

            <div className="upload-icon">
              ↑
            </div>

            <h3>
              {file
                ? file.name
                : "Upload satellite image"}
            </h3>

            <p>
              PNG, JPG or WEBP · Recommended up to 2048×2048
            </p>

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

                {processing
                  ? "Enhancing..."
                  : "Upscale 8× →"}

              </button>

            )}

          </div>


          <div className="result-panel">

            {!result && !processing && (

              <div className="empty-result">

                <div className="empty-icon">
                  ✦
                </div>

                <h3>
                  Your enhanced image will appear here
                </h3>

                <p>
                  Upload an image to start the
                  super-resolution process.
                </p>

              </div>

            )}


            {processing && (

              <div className="empty-result">

                <div className="loader"></div>

                <h3>
                  Enhancing your image...
                </h3>

                <p>
                  SATUpscale AI is generating
                  an 8× super-resolution result.
                </p>

              </div>

            )}


            {result && (

              <div className="result">

                <div className="result-header">

                  <div>

                    <span className="section-label">
                      RESULT
                    </span>

                    <h3>
                      8× enhancement complete
                    </h3>

                  </div>

                  <span className="completed">
                    ● Completed
                  </span>

                </div>


                <div className="comparison">

                  <div className="before">
                    <span>BEFORE</span>
                  </div>

                  <div className="after">
                    <span>AFTER · 8×</span>
                  </div>

                </div>


                <div className="result-actions">

                  <button className="primary-btn">
                    Download Image
                  </button>

                  <button className="secondary-btn">
                    View Details
                  </button>

                </div>

              </div>

            )}

          </div>

        </div>

      </section>


      <section
        className="history-section"
        id="history"
      >

        <div className="section-heading">

          <div>

            <span className="section-label">
              YOUR HISTORY
            </span>

            <h2>
              Recent enhancements
            </h2>

          </div>

          <button className="secondary-btn">
            View all
          </button>

        </div>


        <div className="history-grid">

          <div className="history-card">

            <div className="history-image">
              <span>8×</span>
            </div>

            <div className="history-info">

              <div>
                <h3>Urban Area</h3>
                <p>Today</p>
              </div>

              <span className="status">
                ✓
              </span>

            </div>

          </div>


          <div className="history-card">

            <div className="history-image">
              <span>8×</span>
            </div>

            <div className="history-info">

              <div>
                <h3>Coastal Region</h3>
                <p>Yesterday</p>
              </div>

              <span className="status">
                ✓
              </span>

            </div>

          </div>

        </div>

      </section>


      <footer>

        <div className="logo">
          <span className="logo-mark">S</span>
          SATUpscale
        </div>

        <p>
          Satellite imagery enhanced by AI.
        </p>

      </footer>

    </div>

  );
}


// -----------------------------------------
// ROUTING
// -----------------------------------------

const isResultPage =
  window.location.pathname === "/result";


function App() {

  if (isResultPage) {
    return <ResultPage />;
  }

  return <HomePage />;
}


export default App;