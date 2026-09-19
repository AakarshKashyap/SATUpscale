import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function SideBySideComparison({
  beforeImage = "/sat_original.png",
  afterImage = "/sat_enhanced.png",
  beforeLabel = "ORIGINAL",
  afterLabel = "SATUPSCALE ENHANCED",
  className = "",
}) {
  const containerRef = useRef(null);
  const leftPanelRef = useRef(null);
  const rightPanelRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scroll reveal animation for side-by-side panels
    const ctx = gsap.context(() => {
      gsap.fromTo(
        leftPanelRef.current,
        { x: -20, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 80%",
          },
        }
      );

      gsap.fromTo(
        rightPanelRef.current,
        { x: 20, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 80%",
          },
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className={`side-by-side-comparison-wrapper ${className}`}>
      <div className="side-by-side-grid">
        {/* LEFT: ORIGINAL IMAGE PANEL */}
        <div ref={leftPanelRef} className="comparison-panel-card original-panel">
          <div className="image-panel-frame">
            <img src={beforeImage} alt="Original Satellite Imagery" className="comparison-img" />
            <div className="panel-badge-tag">{beforeLabel}</div>
          </div>
        </div>

        {/* RIGHT: SATUPSCALE ENHANCED IMAGE PANEL */}
        <div ref={rightPanelRef} className="comparison-panel-card enhanced-panel">
          <div className="image-panel-frame">
            <img src={afterImage} alt="SATUpscale Enhanced Result" className="comparison-img" />
            <div className="panel-badge-tag violet-badge">{afterLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
