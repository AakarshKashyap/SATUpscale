import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function ImageTileTransition({
  beforeImage,
  afterImage,
  rows = 6,
  cols = 10,
  isEnhanced = false,
  className = ""
}) {
  const containerRef = useRef(null);
  const defaultImg = "/hero_satellite.jpg";
  const activeSrc = isEnhanced ? (afterImage || defaultImg) : (beforeImage || defaultImg);

  useEffect(() => {
    if (!containerRef.current) return;
    const tiles = containerRef.current.querySelectorAll(".tile-cell");
    if (!tiles || tiles.length === 0) return;

    // GSAP Tile Separation & Reconstruction Animation (Refined subtle assembly)
    gsap.fromTo(
      tiles,
      {
        scale: 0.98,
        opacity: 0.4,
        rotation: () => (Math.random() - 0.5) * 0.8, // max +-0.4 deg
        y: () => (Math.random() - 0.5) * 8, // 5-10px displacement
        x: () => (Math.random() - 0.5) * 8,
      },
      {
        scale: 1,
        opacity: 1,
        rotation: 0,
        y: 0,
        x: 0,
        duration: 0.55,
        stagger: {
          grid: [rows, cols],
          from: "center",
          amount: 0.2,
        },
        ease: "power2.out",
      }
    );
  }, [activeSrc, isEnhanced, rows, cols]);

  const totalTiles = rows * cols;
  const tileList = Array.from({ length: totalTiles });

  return (
    <div
      ref={containerRef}
      className={`tile-transition-container ${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {tileList.map((_, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const leftPct = (c / cols) * 100;
        const topPct = (r / rows) * 100;

        return (
          <div key={idx} className="tile-cell-wrapper">
            <div
              className="tile-cell"
              style={{
                backgroundImage: `url(${activeSrc})`,
                backgroundSize: `${cols * 100}% ${rows * 100}%`,
                backgroundPosition: `${leftPct}% ${topPct}%`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
