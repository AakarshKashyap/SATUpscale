import { useState, useRef, useCallback } from "react";

export default function BeforeAfterSlider({
  beforeImage = "/hero_satellite.jpg",
  afterImage = "/hero_satellite.jpg",
  beforeLabel = "ORIGINAL (LOW-RES)",
  afterLabel = "SATUPSCALE (8× ENHANCED)",
  aspectRatio = "16/9",
  showBadges = true,
  className = "",
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMove = useCallback(
    (clientX) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      let percentage = (x / rect.width) * 100;
      percentage = Math.max(0, Math.min(100, percentage));
      setSliderPosition(percentage);
    },
    []
  );

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  return (
    <div
      ref={containerRef}
      className={`before-after-slider-container ${className}`}
      style={{ aspectRatio }}
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onMouseMove={handleMouseMove}
      onTouchStart={() => setIsDragging(true)}
      onTouchEnd={() => setIsDragging(false)}
      onTouchMove={handleTouchMove}
    >
      {/* AFTER IMAGE (UNDERNEATH) */}
      <div className="slider-layer layer-after">
        <img src={afterImage} alt="Enhanced Satellite Result" />
        {showBadges && <span className="slider-badge badge-after">{afterLabel}</span>}
      </div>

      {/* BEFORE IMAGE (CLIPPED TOP LAYER) */}
      <div
        className="slider-layer layer-before"
        style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}
      >
        <img src={beforeImage} alt="Original Satellite Input" />
        {showBadges && <span className="slider-badge badge-before">{beforeLabel}</span>}
      </div>

      {/* SLIDER DIVIDER HANDLE */}
      <div className="slider-divider-bar" style={{ left: `${sliderPosition}%` }}>
        <div className="slider-handle-button">
          <span className="handle-chevron">‹</span>
          <span className="handle-chevron">›</span>
        </div>
      </div>
    </div>
  );
}
