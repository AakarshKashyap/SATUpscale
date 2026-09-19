import { useEffect, useRef } from "react";

export default function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    // Disable completely on touch / mobile devices
    if (
      window.matchMedia("(pointer: coarse)").matches ||
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0
    ) {
      return;
    }

    let mouseX = -100;
    let mouseY = -100;
    let ringX = -100;
    let ringY = -100;
    let isHoveringInteractive = false;
    let isHoveringEarth = false;
    let isMouseDown = false;
    let hoverEarthTimer = null;
    let animId = null;

    const dot = dotRef.current;
    const ring = ringRef.current;
    const label = labelRef.current;

    if (!dot || !ring) return;

    const handleMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      // Primary solid dot follows cursor instantly
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;

      const target = e.target;
      if (!target) return;

      const interactiveEl = target.closest(
        "a, button, [data-cursor], .minimal-primary-cta, .ghost-btn, .theme-toggle-btn"
      );
      const earthEl = target.closest(".earth-spatial-viewport, .earth-3d-canvas-container");

      const wasHoveringEarth = isHoveringEarth;
      isHoveringInteractive = !!interactiveEl && !earthEl;
      isHoveringEarth = !!earthEl;

      if (isHoveringEarth && !wasHoveringEarth) {
        if (hoverEarthTimer) clearTimeout(hoverEarthTimer);
        hoverEarthTimer = setTimeout(() => {
          if (isHoveringEarth && !isMouseDown && label) {
            label.textContent = "DRAG TO ROTATE";
            label.style.opacity = "1";
          }
        }, 500);
      } else if (!isHoveringEarth && wasHoveringEarth) {
        if (hoverEarthTimer) clearTimeout(hoverEarthTimer);
        if (label) {
          label.style.opacity = "0";
          label.textContent = "";
        }
      }

      if (interactiveEl && !earthEl) {
        const customText = interactiveEl.getAttribute("data-cursor");
        if (customText && label) {
          label.textContent = customText;
          label.style.opacity = "1";
        } else if (label) {
          label.style.opacity = "0";
        }
      } else if (!isHoveringEarth && label) {
        label.style.opacity = "0";
      }
    };

    const handleMouseDown = () => {
      isMouseDown = true;
      if (isHoveringEarth && label) {
        label.textContent = "ROTATE";
        label.style.opacity = "0.9";
      }
    };

    const handleMouseUp = () => {
      isMouseDown = false;
      if (isHoveringEarth && label) {
        label.textContent = "DRAG TO ROTATE";
      }
    };

    // RAF Loop for fluid secondary ring lerp interpolation
    const render = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;

      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;

      let ringSize = 32;
      let ringBorderColor = "rgba(255, 255, 255, 0.4)";
      let ringBg = "transparent";
      let dotOpacity = "1";

      if (isHoveringInteractive) {
        ringSize = 46;
        ringBorderColor = "var(--color-text-main)";
        ringBg = "rgba(255, 255, 255, 0.08)";
        dotOpacity = "0.2";
      } else if (isHoveringEarth) {
        ringSize = isMouseDown ? 24 : 36;
        ringBorderColor = "rgba(255, 255, 255, 0.55)";
        dotOpacity = "0.8";
      }

      ring.style.width = `${ringSize}px`;
      ring.style.height = `${ringSize}px`;
      ring.style.borderColor = ringBorderColor;
      ring.style.backgroundColor = ringBg;
      dot.style.opacity = dotOpacity;

      animId = requestAnimationFrame(render);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      if (hoverEarthTimer) clearTimeout(hoverEarthTimer);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="custom-cursor-container">
      <div ref={dotRef} className="custom-cursor-dot-primary" />
      <div ref={ringRef} className="custom-cursor-ring-secondary">
        <span ref={labelRef} className="cursor-dynamic-label" />
      </div>
    </div>
  );
}

