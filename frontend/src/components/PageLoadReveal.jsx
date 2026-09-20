import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export default function PageLoadReveal({ children }) {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const animationRef = useRef(null);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || isCompleted) return;

    // Responsive grid dimensions: Desktop (14 cols x 8 rows), Tablet (10 cols x 7 rows), Mobile (6 cols x 8 rows)
    const isMobile = window.innerWidth <= 640;
    const isTablet = window.innerWidth > 640 && window.innerWidth <= 1024;
    const cols = isMobile ? 6 : isTablet ? 10 : 14;
    const rows = isMobile ? 8 : isTablet ? 7 : 8;

    const tiles = Array.from(overlay.querySelectorAll(".mosaic-tile-cell"));
    if (!tiles.length) return;

    // Create GSAP animation timeline
    const tl = gsap.timeline({
      onComplete: () => {
        if (overlay) {
          overlay.style.display = "none";
          overlay.style.pointerEvents = "none";
        }
        setIsCompleted(true);
      },
    });

    animationRef.current = tl;

    // 1. Initial 300ms hold phase: ensures 100% solid mosaic grid is established and visible
    tl.to({}, { duration: 0.30 });

    // 2. SLOW DETERMINISTIC LEFT → RIGHT WAVE WITH SUBTLE DIAGONAL ROW OFFSET
    // delay = 0.30s + colIndex * 95ms + rowIndex * 14ms
    tiles.forEach((tile) => {
      const col = parseInt(tile.getAttribute("data-col") || "0", 10);
      const row = parseInt(tile.getAttribute("data-row") || "0", 10);

      const delayTime = 0.30 + col * 0.095 + row * 0.014;

      tl.to(
        tile,
        {
          opacity: 0,
          scale: 0.97,
          x: -18,
          duration: 1.15,
          ease: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
        delayTime
      );
    });

    return () => {
      if (tl) tl.kill();
    };
  }, [isCompleted]);

  const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
  const isTablet = typeof window !== "undefined" && window.innerWidth > 640 && window.innerWidth <= 1024;
  const cols = isMobile ? 6 : isTablet ? 10 : 14;
  const rows = isMobile ? 8 : isTablet ? 7 : 8;

  const tileGrid = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tileGrid.push({ row: r, col: c, id: `${r}-${c}` });
    }
  }

  return (
    <div ref={containerRef} className="page-load-reveal-container">
      {children}

      {!isCompleted && (
        <div
          ref={overlayRef}
          className="initial-mosaic-overlay-grid"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          {tileGrid.map((t) => (
            <div
              key={t.id}
              data-col={t.col}
              data-row={t.row}
              className="mosaic-tile-cell"
            />
          ))}
        </div>
      )}
    </div>
  );
}
