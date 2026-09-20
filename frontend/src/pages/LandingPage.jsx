import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import PublicNavbar from "../components/PublicNavbar";
import Footer from "../components/Footer";
import EarthViewport from "../components/globe/EarthViewport";
import CustomCursor from "../components/navigation/CustomCursor";
import QuickAccessNav from "../components/navigation/QuickAccessNav";
import TileReveal from "../components/TileReveal";
import PageLoadReveal from "../components/PageLoadReveal";
import SideBySideComparison from "../components/SideBySideComparison";
import { useAuth } from "../hooks/useAuth";
import { useLenis } from "../hooks/useLenis";
import { Globe, Compass, Cloud, Crosshair, Layers } from "lucide-react";

export default function LandingPage() {
  useLenis(); // 60 FPS Lenis smooth scrolling

  const { isAuthenticated } = useAuth();
  const ctaTarget = isAuthenticated ? "/dashboard" : "/signup";

  const heroRef = useRef(null);
  const heroContentRef = useRef(null);
  const heroEarthRef = useRef(null);

  const [activeTarget, setActiveTarget] = useState({
    lat: "31.1048° N",
    lon: "77.1734° E",
  });

  const [isTileEnhanced, setIsTileEnhanced] = useState(false);

  // Orchestrated Master Hero Entrance Timeline (GSAP)
  useEffect(() => {
    if (!heroRef.current) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Sequence: 0.15s Tiles -> 0.30s Earth reveal -> 0.45s Eyebrow & Headline -> 0.60s Body -> 0.75s CTA Buttons
      tl.fromTo(
        heroEarthRef.current,
        { scale: 0.95, opacity: 0 },
        { scale: 1, opacity: 1, duration: 1.4, ease: "expo.out" },
        0.25
      ).fromTo(
        heroContentRef.current ? Array.from(heroContentRef.current.children) : [],
        { y: 22, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.9, stagger: 0.12, ease: "power3.out" },
        0.45
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="app-shell dark-theme-root aerospace-aesthetic">
      <CustomCursor />
      <QuickAccessNav />
      <PublicNavbar />

      <main className="landing-main" ref={heroRef}>
        {/* SECTION 01: APPLE / SAMSUNG EDITORIAL HERO WITH INITIAL PAGE-LOAD TILE REVEAL */}
        <PageLoadReveal>
          <section className="vantor-hero-split" id="home">
            {/* LEFT PANEL */}
            <div className="hero-left-panel">
              <div className="hero-content-inner" ref={heroContentRef}>
                <div className="eyebrow-status-tag">
                  <span className="status-dot-pulse"></span>
                  <span className="eyebrow-text">AI-POWERED EARTH OBSERVATION</span>
                </div>

                <h1 className="vantor-hero-title">
                  See more.
                  <br />
                  <span className="title-muted-span">From every pixel.</span>
                </h1>

                <p className="vantor-hero-description">
                  Sub-meter super-resolution reconstruction and spatial analytics powered by deep neural cloud GPU pipelines.
                </p>

                <div className="hero-btn-row">
                  <Link to={ctaTarget} className="minimal-primary-cta" data-cursor="OPEN">
                    <span>{isAuthenticated ? "OPEN WORKSPACE →" : "TRY SATUPscale →"}</span>
                  </Link>

                  <a href="#target-selection" className="minimal-text-link" data-cursor="EXPLORE">
                    <span>Explore interactive Earth →</span>
                  </a>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: LARGE INTERACTIVE /models/earth.glb SPATIAL EARTH */}
            <div className="hero-right-panel" ref={heroEarthRef}>
              <div className="sun-rays-overlay" />
              <EarthViewport onSelectTarget={(coords) => setActiveTarget(coords)} />
            </div>
          </section>
        </PageLoadReveal>

        {/* SECTION 02: ORBIT & SATELLITE INTELLIGENCE */}
        <section className="aerospace-telemetry-strip">
          <div className="telemetry-strip-container">
            <div className="strip-item">
              <span className="strip-label">MODEL SOURCE</span>
              <strong className="strip-val">/models/earth.glb</strong>
            </div>
            <div className="strip-divider"></div>
            <div className="strip-item">
              <span className="strip-label">SATELLITE ORBIT</span>
              <strong className="strip-val">LEO / MEO OBSERVATION</strong>
            </div>
            <div className="strip-divider"></div>
            <div className="strip-item">
              <span className="strip-label">ACTIVE TARGET</span>
              <strong className="strip-val violet-text">{activeTarget.lat} {activeTarget.lon}</strong>
            </div>
            <div className="strip-divider"></div>
            <div className="strip-item">
              <span className="strip-label">PIPELINE STATUS</span>
              <strong className="strip-val text-green">ONLINE · READY</strong>
            </div>
          </div>
        </section>

        {/* SECTION 03: GEOGRAPHIC TARGET RECONNAISSANCE */}
        <section className="editorial-section dark-bg" id="target-selection">
          <div className="section-header text-left">
            <span className="section-eyebrow violet-text">SPATIAL TARGETING</span>
            <h2 className="section-title">Geographic Coordinate Selection</h2>
            <p className="section-subtitle left-align">
              Click on the 3D Earth above to calculate latitudinal & longitudinal coordinates for high-resolution intelligence retrieval.
            </p>
          </div>

          <div className="targeting-display-grid">
            <div className="target-info-card dark-card">
              <div className="card-header-icon">
                <Crosshair className="icon-md violet" />
              </div>
              <h3>ACTIVE TARGET RECONNAISSANCE</h3>
              <div className="coord-data-row">
                <span>LATITUDE</span>
                <strong>{activeTarget.lat}</strong>
              </div>
              <div className="coord-data-row">
                <span>LONGITUDE</span>
                <strong>{activeTarget.lon}</strong>
              </div>
              <div className="coord-data-row">
                <span>SENSOR PROFILE</span>
                <strong>MULTISPECTRAL SATELLITE</strong>
              </div>
              <div className="coord-data-row">
                <span>RECONSTRUCTION</span>
                <strong>SUB-METER TARGETING</strong>
              </div>
            </div>

            <div className="target-map-preview-card dark-card" data-cursor="EXPLORE">
              <img
                src="/hero_satellite.jpg"
                alt="Selected target satellite crop"
                className="target-crop-img"
              />
              <div className="target-hud-overlay">
                <span className="hud-badge">TARGET LOCKED</span>
                <span className="hud-coords">{activeTarget.lat} | {activeTarget.lon}</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 04: SATELLITE IMAGERY SHOWCASE */}
        <section className="editorial-section imagery-grid-section" id="imagery-showcase">
          <div className="section-header text-center">
            <span className="section-eyebrow">INTELLIGENCE IMAGERY</span>
            <h2 className="section-title">High-Definition Satellite Datasets</h2>
            <p className="section-subtitle">
              Full-width, sharp rectangular compositions with real-time coordinate tags.
            </p>
          </div>

          <div className="fullwidth-imagery-grid">
            <div className="aerospace-image-frame">
              <TileReveal
                imageSrc="/hero_satellite.jpg"
                rows={6}
                cols={10}
                duration={1.2}
                stagger={0.025}
                className="showcase-tile-grid"
              />
              <div className="image-meta-overlay">
                <div className="meta-left">
                  <span className="meta-tag-code">LAT {activeTarget.lat}</span>
                  <span className="meta-tag-code">LON {activeTarget.lon}</span>
                </div>
                <div className="meta-right">
                  <span className="meta-tag-code">RESOLUTION 0.5 M</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 05: GSAP 10x6 TILE REVEAL & SIDE-BY-SIDE COMPARISON */}
        <section className="editorial-section tile-enhancement-section" id="enhancement">
          <div className="section-header text-center">
            <span className="section-eyebrow violet-text">AI ENHANCEMENT</span>
            <h2 className="section-title">Sub-Pixel Super Resolution Reconstruction</h2>
            <p className="section-subtitle">
              Satellite imagery separates into 60 grid tiles and reconstructs into an 8× super-resolution output.
            </p>
          </div>

          <div className="tile-interactive-wrapper">
            <div className="tile-control-bar">
              <button
                onClick={() => setIsTileEnhanced(!isTileEnhanced)}
                className="ghost-btn tile-trigger-btn"
                data-cursor="ENHANCE"
              >
                <Layers className="icon-sm violet" />
                <span>Trigger Tile Reconstruction ({isTileEnhanced ? "SHOW ORIGINAL" : "SHOW 8× ENHANCED"})</span>
              </button>
            </div>

            <div className="tile-frame-box dark-card">
              <TileReveal
                key={isTileEnhanced ? "enhanced" : "original"}
                imageSrc={isTileEnhanced ? "/sat_enhanced.png" : "/sat_original.png"}
                rows={6}
                cols={10}
                className="showcase-tile-grid"
              />
            </div>

            {/* PREMIUM SIDE-BY-SIDE COMPARISON */}
            <SideBySideComparison
              beforeImage="/sat_original.png"
              afterImage="/sat_enhanced.png"
              beforeLabel="ORIGINAL"
              afterLabel="SATUPSCALE ENHANCED"
              className="mt-8"
            />
          </div>
        </section>

        {/* SECTION 06: SATUPSCALE NEURAL CAPABILITIES */}
        <section className="editorial-section dark-bg" id="technology">
          <div className="section-header text-center">
            <span className="section-eyebrow">ARCHITECTURE</span>
            <h2 className="section-title">Technical Neural Capabilities</h2>
            <p className="section-subtitle">
              Built on AWS serverless containerized Lambda with automated EDSR neural pipelines.
            </p>
          </div>

          <div className="features-grid">
            <div className="feature-card dark-card">
              <div className="feature-icon-wrapper violet-bg">
                <Globe className="feature-icon" />
              </div>
              <h3>2× to 32× Neural Reconstruction</h3>
              <p>
                EDSR model chaining with perceptual sharpening and hallucination gate validation.
              </p>
            </div>

            <div className="feature-card dark-card">
              <div className="feature-icon-wrapper violet-bg">
                <Compass className="feature-icon" />
              </div>
              <h3>Chrome Extension Integration</h3>
              <p>
                Right-click upscale imagery directly inside web mapping platforms.
              </p>
            </div>

            <div className="feature-card dark-card">
              <div className="feature-icon-wrapper violet-bg">
                <Cloud className="feature-icon" />
              </div>
              <h3>Secure S3 Cloud Storage</h3>
              <p>
                AWS S3 object encryption with presigned access URLs and automated 48-hour cost control lifecycle.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 07: DISPATCH CTA */}
        <section className="extension-section" id="final-cta">
          <div className="extension-banner dark-banner">
            <div className="extension-content">
              <span className="section-eyebrow violet-text">DISPATCH</span>
              <h2>Launch Satellite Intelligence Workspace</h2>
              <p>
                Access the workspace to upload imagery, inspect history, and process super-resolution enhancements.
              </p>
              <div className="extension-actions">
                <Link to={ctaTarget} className="minimal-primary-cta" data-cursor="OPEN">
                  <span>Launch Workspace →</span>
                </Link>
                <Link to="/login" className="ghost-btn" data-cursor="OPEN">
                  Sign In to Account
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

