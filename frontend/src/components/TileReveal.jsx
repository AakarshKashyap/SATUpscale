import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export default function TileReveal({
  imageSrc = "/hero_satellite.jpg",
  rows: initialRows = 6,
  cols: initialCols = 10,
  duration = 1.1,
  stagger = 0.03,
  className = "",
  onComplete,
}) {
  const containerRef = useRef(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [gridSize, setGridSize] = useState({ rows: initialRows, cols: initialCols });

  // Responsive grid adjustment for mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setGridSize({ rows: 4, cols: 5 });
      } else {
        setGridSize({ rows: initialRows, cols: initialCols });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initialRows, initialCols]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || hasAnimated) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasAnimated(true);
          const tiles = container.querySelectorAll(".tile-reveal-cell");
          if (!tiles || tiles.length === 0) return;

          gsap.fromTo(
            tiles,
            {
              scale: 0.98,
              opacity: 0,
              rotation: () => (Math.random() - 0.5) * 0.5, // max +-0.25 deg
              y: () => (Math.random() - 0.5) * 20, // 10-20px offset
              x: () => (Math.random() - 0.5) * 20,
            },
            {
              scale: 1,
              opacity: 1,
              rotation: 0,
              y: 0,
              x: 0,
              duration: duration,
              stagger: {
                grid: [gridSize.rows, gridSize.cols],
                from: "center",
                amount: stagger * (gridSize.rows * gridSize.cols * 0.15),
              },
              ease: "power3.out",
              onComplete: () => {
                // Lock tiles into place seamlessly without subpixel rendering artifacts
                gsap.set(tiles, { clearProps: "transform,opacity,rotation" });
                if (onComplete) onComplete();
              },
            }
          );
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [gridSize, hasAnimated, duration, stagger, onComplete]);

  const { rows, cols } = gridSize;
  const totalTiles = rows * cols;
  const tileList = Array.from({ length: totalTiles });

  return (
    <div
      ref={containerRef}
      className={`tile-reveal-container ${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {tileList.map((_, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const leftPct = cols > 1 ? (c / (cols - 1)) * 100 : 0;
        const topPct = rows > 1 ? (r / (rows - 1)) * 100 : 0;

        return (
          <div key={idx} className="tile-reveal-wrapper">
            <div
              className="tile-reveal-cell"
              style={{
                backgroundImage: `url(${imageSrc})`,
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

