import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { useTheme } from "../../hooks/useTheme";

export default function ParticleField({ scene, camera, count: overrideCount }) {
  const pointsRef = useRef(null);
  const mouseRef = useRef(new THREE.Vector3(-999, -999, 0));
  const { theme } = useTheme();

  // Dynamic particle count evaluation
  const [particleCount, setParticleCount] = useState(() => {
    if (overrideCount) return overrideCount;
    if (typeof window !== "undefined") {
      if (window.innerWidth >= 1024) return 420;
      if (window.innerWidth >= 768) return 280;
      return 160;
    }
    return 300;
  });

  useEffect(() => {
    const handleResize = () => {
      if (overrideCount) return;
      if (window.innerWidth >= 1024) setParticleCount(420);
      else if (window.innerWidth >= 768) setParticleCount(280);
      else setParticleCount(160);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [overrideCount]);

  useEffect(() => {
    if (!scene || !camera) return;

    const count = particleCount;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const initialPositions = new Float32Array(count * 3);
    const currentColors = new Float32Array(count * 3);
    const darkColors = new Float32Array(count * 3);
    const lightColors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const sizes = new Float32Array(count);

    // Color definitions
    const colorWhite = new THREE.Color(0xedecf2);
    const colorGray = new THREE.Color(0xa9a6b2);
    const colorViolet = new THREE.Color(0x8b6cff);
    const colorReddishViolet = new THREE.Color(0xb06cff);

    const colorDarkCharcoal = new THREE.Color(0x252329);
    const colorDarkSlate = new THREE.Color(0x3a3740);

    for (let i = 0; i < count; i++) {
      const idx = i * 3;

      // Organic spatial 3D volume around Earth (X: [-6, 6], Y: [-4, 4], Z: [-5, 5])
      let x = (Math.random() - 0.5) * 12;
      let y = (Math.random() - 0.5) * 8.5;
      let z = (Math.random() - 0.5) * 9;

      // Keep small breathing room around center typography focus
      if (Math.abs(x) < 1.2 && Math.abs(y) < 1.2) {
        x += x >= 0 ? 1.5 : -1.5;
      }

      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;

      initialPositions[idx] = x;
      initialPositions[idx + 1] = y;
      initialPositions[idx + 2] = z;

      // Dark Mode Color Palette: 70% white/gray, 20% violet, 10% reddish-violet
      const randColor = Math.random();
      let dColor = colorWhite;
      if (randColor > 0.90) {
        dColor = colorReddishViolet;
      } else if (randColor > 0.70) {
        dColor = colorViolet;
      } else if (randColor > 0.35) {
        dColor = colorGray;
      }

      darkColors[idx] = dColor.r;
      darkColors[idx + 1] = dColor.g;
      darkColors[idx + 2] = dColor.b;

      // Light Mode Color Palette: Faint dark charcoal / black particles
      const lColor = Math.random() > 0.5 ? colorDarkCharcoal : colorDarkSlate;
      lightColors[idx] = lColor.r;
      lightColors[idx + 1] = lColor.g;
      lightColors[idx + 2] = lColor.b;

      // Set initial current color based on active theme
      const isInitialLight = theme === "light";
      currentColors[idx] = isInitialLight ? lColor.r : dColor.r;
      currentColors[idx + 1] = isInitialLight ? lColor.g : dColor.g;
      currentColors[idx + 2] = isInitialLight ? lColor.b : dColor.b;

      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.002 + Math.random() * 0.004;

      // 93% small stars (0.8 - 1.8px), 7% brighter accent stars (2.2 - 2.8px)
      const isAccent = Math.random() > 0.93;
      sizes[i] = isAccent ? 0.022 + Math.random() * 0.006 : 0.008 + Math.random() * 0.010;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(currentColors, 3));

    const isLightMode = theme === "light";
    const material = new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: isLightMode ? 0.45 : 0.70,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    pointsRef.current = points;

    // ----------------------------------------------------
    // SPATIAL SUNLIGHT SWEEP COLOR ANIMATION ENGINE
    // ----------------------------------------------------
    const themeState = { progress: isLightMode ? 1 : 0 };
    gsap.to(themeState, {
      progress: isLightMode ? 1 : 0,
      duration: 2.2,
      ease: "power2.inOut",
      onUpdate: () => {
        const colorAttr = geometry.attributes.color;
        const sweepProgress = themeState.progress;

        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          const xPos = initialPositions[idx];
          // Normalized X position from 0 (left -6) to 1 (right +6)
          const normalizedX = THREE.MathUtils.clamp((xPos + 6) / 12, 0, 1);

          // Calculate spatial daylight sweep threshold
          let pFactor = 0;
          if (sweepProgress > 0) {
            // Spatial left-to-right sweep calculation
            pFactor = THREE.MathUtils.clamp((sweepProgress - normalizedX * 0.4) / 0.6, 0, 1);
          }

          currentColors[idx] = THREE.MathUtils.lerp(darkColors[idx], lightColors[idx], pFactor);
          currentColors[idx + 1] = THREE.MathUtils.lerp(darkColors[idx + 1], lightColors[idx + 1], pFactor);
          currentColors[idx + 2] = THREE.MathUtils.lerp(darkColors[idx + 2], lightColors[idx + 2], pFactor);
        }
        colorAttr.needsUpdate = true;
      },
    });

    // ----------------------------------------------------
    // CURSOR LISTENER & ANIMATION FRAME LOOP
    // ----------------------------------------------------
    const handleMouseMove = (e) => {
      const x = (e.clientX / window.innerWidth) * 12 - 6;
      const y = -(e.clientY / window.innerHeight) * 8 + 4;
      mouseRef.current.set(x, y, 0);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    let animId;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();
      const posAttr = geometry.attributes.position;
      const mousePos = mouseRef.current;

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const phase = phases[i];
        const spd = speeds[i];

        // 1. Slow ambient orbital drift
        const baseDx = Math.sin(elapsedTime * spd * 10 + phase) * 0.003;
        const baseDy = Math.cos(elapsedTime * spd * 8 + phase) * 0.003;

        let targetX = initialPositions[idx] + baseDx;
        let targetY = initialPositions[idx + 1] + baseDy;
        let targetZ = initialPositions[idx + 2];

        // 2. Subtle Parallax offset based on particle depth (Z)
        const parallaxFactor = (targetZ / 5) * 0.08;
        targetX += mousePos.x * parallaxFactor * 0.05;
        targetY += mousePos.y * parallaxFactor * 0.05;

        // 3. Gentle cursor repulsion physics (80-120px screen influence, 3-7px displacement)
        const dx = targetX - mousePos.x;
        const dy = targetY - mousePos.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 2.8 && distSq > 0.001) {
          const force = (1.0 - Math.sqrt(distSq) / 1.68) * 0.06;
          const angle = Math.atan2(dy, dx);
          targetX += Math.cos(angle) * force;
          targetY += Math.sin(angle) * force;
        }

        // 4. Smooth physical lerp return (damped physics)
        posAttr.array[idx] += (targetX - posAttr.array[idx]) * 0.05;
        posAttr.array[idx + 1] += (targetY - posAttr.array[idx + 1]) * 0.05;
        posAttr.array[idx + 2] += (targetZ - posAttr.array[idx + 2]) * 0.05;
      }

      posAttr.needsUpdate = true;
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    };
  }, [scene, camera, particleCount, theme]);

  return null;
}
