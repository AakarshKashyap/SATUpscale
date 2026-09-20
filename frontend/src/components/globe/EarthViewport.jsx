import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import gsap from "gsap";
import { Radio, Target } from "lucide-react";
import { vectorToLatLon } from "../../lib/coordinates";
import { useTheme } from "../../hooks/useTheme";
import ParticleField from "./ParticleField";

export default function EarthViewport({ onSelectTarget }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const earthModelRef = useRef(null);
  const ambientLightRef = useRef(null);
  const sunLightRef = useRef(null);
  const orbitLinesMatRef = useRef([]);
  const starsMatRef = useRef(null);
  const atmosphereMatRef = useRef(null);
  const sunRaysMatRef = useRef(null);
  const sunMeshGroupRef = useRef(null);
  const onSelectTargetRef = useRef(onSelectTarget);

  const { theme } = useTheme();

  const [selectedTarget, setSelectedTarget] = useState({
    active: false,
    lat: "",
    lon: "",
  });

  const [hoveredSat, setHoveredSat] = useState(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [sceneState, setSceneState] = useState(null);

  useEffect(() => {
    onSelectTargetRef.current = onSelectTarget;
  });

  // INITIALIZE THREE.JS SCENE ONCE ON MOUNT — NEVER REMOUNT ON THEME CHANGE OR RE-RENDER
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 1. SCENE & RENDERER SETUP
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const width = container.clientWidth || 700;
    const height = container.clientHeight || 700;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 2.3);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // WebGL Context Loss Handlers to guarantee zero disappearing Earth
    const handleContextLost = (event) => {
      event.preventDefault();
      console.warn("WebGL context lost. Restoring scene...");
    };
    const handleContextRestored = () => {
      console.log("WebGL context restored.");
      renderer.render(scene, camera);
    };
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
    renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);

    // 2. ORBIT CONTROLS WITH DAMPED MOMENTUM
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.04;
    controls.enablePan = false;
    controls.minDistance = 1.4;
    controls.maxDistance = 4.5;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;

    let isUserInteracting = false;
    let autoRotationTimer = null;

    controls.addEventListener("start", () => {
      isUserInteracting = true;
      if (autoRotationTimer) clearTimeout(autoRotationTimer);
    });

    controls.addEventListener("end", () => {
      autoRotationTimer = setTimeout(() => {
        isUserInteracting = false;
      }, 3500);
    });

    // 3. EARTH GROUP WITH REAL 23.5° AXIAL TILT
    const earthTiltGroup = new THREE.Group();
    earthTiltGroup.position.set(0.42, -0.18, 0);
    earthTiltGroup.rotation.z = -THREE.MathUtils.degToRad(23.5);
    scene.add(earthTiltGroup);

    // Inner group rotates Earth around its own tilted Y axis
    const earthGroup = new THREE.Group();
    earthTiltGroup.add(earthGroup);

    // Subtle Warm Atmospheric Rim (Golden Yellow #FFD27A / Soft Amber #FFB45C)
    const atmosGeo = new THREE.SphereGeometry(1.018, 64, 64);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    earthTiltGroup.add(atmosMesh);
    atmosphereMatRef.current = atmosMat;

    // Load GLB Model — NEVER MODIFY EARTH MATERIALS ON POINTER EVENTS
    const loader = new GLTFLoader();
    loader.load(
      "/models/earth.glb",
      (gltf) => {
        const loadedModel = gltf.scene;

        const bbox = new THREE.Box3().setFromObject(loadedModel);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);

        if (maxDim > 0) {
          const scaleFactor = 2.0 / maxDim; // Radius = 1.0
          loadedModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

          const center = new THREE.Vector3();
          bbox.getCenter(center);
          loadedModel.position.sub(center.multiplyScalar(scaleFactor));
        }

        loadedModel.traverse((child) => {
          if (child.isMesh) {
            child.frustumCulled = false; // Prevent disappearance during cropping / rotation
            if (child.material) {
              child.material.needsUpdate = true;

              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
              }

              if (child.material.emissiveMap) {
                child.material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                child.material.emissiveIntensity = 0.75;
              } else if (child.material.emissive) {
                child.material.emissive.setHex(0x000000);
              }
            }
          }
        });

        earthGroup.add(loadedModel);
        earthModelRef.current = loadedModel;
        setModelLoaded(true);
      },
      undefined,
      (error) => {
        console.warn("GLB load fallback triggered:", error);
        setModelLoaded(true);
      }
    );

    // 4. INCLINED DIAGONAL SATELLITE ORBITS (3 SATELLITES IN REALISTIC TRAJECTORIES)
    const satellites = [
      {
        name: "SAT-01",
        radius: 1.38,
        inclination: THREE.MathUtils.degToRad(51.6),
        raan: THREE.MathUtils.degToRad(25),
        speed: 0.032,
      },
      {
        name: "SAT-02",
        radius: 1.50,
        inclination: THREE.MathUtils.degToRad(-42.0),
        raan: THREE.MathUtils.degToRad(140),
        speed: 0.024,
      },
      {
        name: "SAT-03",
        radius: 1.62,
        inclination: THREE.MathUtils.degToRad(68.0),
        raan: THREE.MathUtils.degToRad(250),
        speed: 0.019,
      },
    ];

    function calculateOrbitPoint(radius, inclination, raan, progress) {
      const theta = progress * Math.PI * 2;
      const x0 = Math.cos(theta) * radius;
      const z0 = Math.sin(theta) * radius;
      const y0 = 0;

      const x1 = x0;
      const y1 = y0 * Math.cos(inclination) - z0 * Math.sin(inclination);
      const z1 = y0 * Math.sin(inclination) + z0 * Math.cos(inclination);

      const x2 = x1 * Math.cos(raan) + z1 * Math.sin(raan);
      const y2 = y1;
      const z2 = -x1 * Math.sin(raan) + z1 * Math.cos(raan);

      return new THREE.Vector3(x2, y2, z2);
    }

    const satMeshGroups = [];
    const numPoints = 140;
    orbitLinesMatRef.current = [];

    const orbitsGroup = new THREE.Group();
    orbitsGroup.position.copy(earthTiltGroup.position);
    scene.add(orbitsGroup);

    satellites.forEach((sat) => {
      const orbitPoints = [];
      for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const pt = calculateOrbitPoint(sat.radius, sat.inclination, sat.raan, t);
        orbitPoints.push(pt);
      }

      const orbitLineGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
      
      // Main Orbit Line (Deep violet #6D3BFF, thin 1-2px, opacity 0.35)
      const orbitLineMat = new THREE.LineBasicMaterial({
        color: 0x6d3bff,
        transparent: true,
        opacity: 0.40,
      });
      orbitLinesMatRef.current.push(orbitLineMat);
      const orbitLine = new THREE.LineLoop(orbitLineGeo, orbitLineMat);
      orbitsGroup.add(orbitLine);

      // Subtle Reddish-Violet Secondary Orbit Glow (#B13CFF)
      const orbitGlowMat = new THREE.LineBasicMaterial({
        color: 0xb13cff,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
      });
      const orbitGlowLine = new THREE.LineLoop(orbitLineGeo, orbitGlowMat);
      orbitsGroup.add(orbitGlowLine);

      // Satellite Mesh & Soft Point Light
      const satGroup = new THREE.Group();

      const satBodyGeo = new THREE.BoxGeometry(0.026, 0.026, 0.036);
      const satBodyMat = new THREE.MeshStandardMaterial({
        color: 0xf5f3f7,
        metalness: 0.9,
        roughness: 0.15,
      });
      const satBody = new THREE.Mesh(satBodyGeo, satBodyMat);
      satBody.userData = { id: sat.name };

      const panelGeo = new THREE.BoxGeometry(0.10, 0.003, 0.026);
      const panelMat = new THREE.MeshStandardMaterial({ color: 0x6d3bff, metalness: 0.9 });
      const panelLeft = new THREE.Mesh(panelGeo, panelMat);
      panelLeft.position.x = -0.065;
      const panelRight = new THREE.Mesh(panelGeo, panelMat);
      panelRight.position.x = 0.065;

      const satLight = new THREE.PointLight(0x8b5cf6, 0.35, 0.3);
      satLight.position.set(0, 0, 0);

      satGroup.add(satBody);
      satGroup.add(panelLeft);
      satGroup.add(panelRight);
      satGroup.add(satLight);
      orbitsGroup.add(satGroup);

      satMeshGroups.push({ group: satGroup, body: satBody, config: sat });
    });

    // 5. TARGET SELECTION MARKER (Minimal slate ring, hidden by default, NO CYAN OVERLAY)
    const targetGroup = new THREE.Group();
    const targetRingGeo = new THREE.RingGeometry(0.014, 0.020, 32);
    const targetRingMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide });
    const targetRing = new THREE.Mesh(targetRingGeo, targetRingMat);
    targetGroup.add(targetRing);
    targetGroup.visible = false;
    earthGroup.add(targetGroup);

    function updateTargetCoordinates(latDeg, lonDeg) {
      const phi = (90 - latDeg) * (Math.PI / 180);
      const theta = (lonDeg + 180) * (Math.PI / 180);
      const r = 1.005;

      const x = -(r * Math.sin(phi) * Math.cos(theta));
      const z = r * Math.sin(phi) * Math.sin(theta);
      const y = r * Math.cos(phi);

      targetGroup.position.set(x, y, z);
      targetGroup.lookAt(0, 0, 0);
      targetGroup.visible = true;

      const latStr = `${Math.abs(latDeg).toFixed(4)}° ${latDeg >= 0 ? "N" : "S"}`;
      const lonStr = `${Math.abs(lonDeg).toFixed(4)}° ${lonDeg >= 0 ? "E" : "W"}`;

      setSelectedTarget({ active: true, lat: latStr, lon: lonStr });
      if (onSelectTargetRef.current) onSelectTargetRef.current({ lat: latStr, lon: lonStr });
    }

    // 6. REALISTIC SUN LIGHTING & 3D VOLUMETRIC LIGHT RAYS FALLING ON EARTH
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    sunLight.position.set(-5, 3, 4);
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // 3D Volumetric Daylight Cone (Soft Neutral Daylight #FFFBF5)
    const sunBeamGroup = new THREE.Group();
    sunBeamGroup.position.set(-3.5, 2.8, 2.0);
    sunBeamGroup.lookAt(earthTiltGroup.position);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfffbf5,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    sunRaysMatRef.current = beamMat;

    // Single wide continuous smooth volumetric daylight cone (no striped cylinders)
    const beamGeo = new THREE.CylinderGeometry(0.1, 1.8, 6.0, 64, 1, true);
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.rotation.x = Math.PI / 2;
    sunBeamGroup.add(beamMesh);

    // 3D SUN / STAR OBJECT (Soft Neutral Daylight #FFFFFF, Halo #FFF8EE)
    const sunMeshGroup = new THREE.Group();
    sunMeshGroup.position.set(-6.2, 2.6, 3.2);

    const sunCoreGeo = new THREE.SphereGeometry(0.07, 32, 32);
    const sunCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sunCore = new THREE.Mesh(sunCoreGeo, sunCoreMat);
    sunMeshGroup.add(sunCore);

    const sunHaloGeo = new THREE.SphereGeometry(0.18, 32, 32);
    const sunHaloMat = new THREE.MeshBasicMaterial({
      color: 0xfff8ee,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sunHalo = new THREE.Mesh(sunHaloGeo, sunHaloMat);
    sunMeshGroup.add(sunHalo);

    const sunOuterGeo = new THREE.SphereGeometry(0.38, 32, 32);
    const sunOuterMat = new THREE.MeshBasicMaterial({
      color: 0xfff0e8,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sunOuter = new THREE.Mesh(sunOuterGeo, sunOuterMat);
    sunMeshGroup.add(sunOuter);

    sunMeshGroup.visible = false;
    scene.add(sunMeshGroup);
    sunMeshGroupRef.current = sunMeshGroup;

    const fillLight = new THREE.DirectionalLight(0x475569, 0.3);
    fillLight.position.set(-5, -2, -4);
    scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.35);
    ambientLightRef.current = ambientLight;
    scene.add(ambientLight);

    // Subtle space background stars
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 100;
    const starPos = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 16;
      starPos[i + 1] = (Math.random() - 0.5) * 16;
      starPos[i + 2] = (Math.random() - 0.5) * 16;
    }

    starsGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starsMat = new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 0.008,
      transparent: true,
      opacity: 0.25,
    });
    starsMatRef.current = starsMat;
    const starField = new THREE.Points(starsGeo, starsMat);
    scene.add(starField);

    setSceneState({ scene, camera });

    // 7. RAYCASTER & POINTER EVENTS (NO MATERIAL MUTATION ON EARTH)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const satBodies = satMeshGroups.map((s) => s.body);
      const intersectsSat = raycaster.intersectObjects(satBodies, true);

      if (intersectsSat.length > 0) {
        const hitSatId = intersectsSat[0].object.userData.id || "SAT-01";
        setHoveredSat(hitSatId);
      } else {
        setHoveredSat(null);
      }
    };

    const handleCanvasClick = (e) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const satBodies = satMeshGroups.map((s) => s.body);
      const intersectsSat = raycaster.intersectObjects(satBodies, true);
      if (intersectsSat.length > 0) {
        const hitGroup = intersectsSat[0].object.parent;
        gsap.to(camera.position, {
          x: hitGroup.position.x * 1.3,
          y: hitGroup.position.y * 1.3 + 0.1,
          z: hitGroup.position.z * 1.3,
          duration: 1.1,
          ease: "power2.inOut",
          onUpdate: () => controls.update(),
        });
        return;
      }

      if (earthModelRef.current) {
        const intersectsEarth = raycaster.intersectObject(earthModelRef.current, true);
        if (intersectsEarth.length > 0) {
          const point = intersectsEarth[0].point;
          const geo = vectorToLatLon(point);
          updateTargetCoordinates(geo.lat, geo.lon);

          gsap.fromTo(
            targetRing.scale,
            { x: 0.5, y: 0.5, z: 0.5 },
            { x: 1.3, y: 1.3, z: 1.3, duration: 0.4, ease: "power2.out" }
          );
        }
      }
    };

    container.addEventListener("mousemove", handlePointerMove, { passive: true });
    container.addEventListener("click", handleCanvasClick);

    // Subtle, highly restrained scroll parallax (Max 30px shift, max 3.5% scale shift)
    const handleScroll = () => {
      if (prefersReducedMotion) return;
      const scrollY = window.scrollY;
      if (scrollY < 1400 && earthTiltGroup) {
        const scrollRatio = Math.min(scrollY / 1400, 1.0);
        earthTiltGroup.position.y = -0.18 - scrollRatio * 0.12;
        earthTiltGroup.scale.setScalar(1.0 + scrollRatio * 0.035);
        orbitsGroup.position.copy(earthTiltGroup.position);
        orbitsGroup.scale.copy(earthTiltGroup.scale);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    // 8. ANIMATION LOOP — CONTINUOUS TILTED ROTATION (150s/REV) + PERSISTENT ORBIT MOTION
    let animId;
    let isVisible = true;
    let orbitProgresses = [0, 0.35, 0.70];
    const clock = new THREE.Clock();

    const observer = new IntersectionObserver(([entry]) => { isVisible = entry.isIntersecting; }, { threshold: 0.1 });
    observer.observe(container);

    const rotationSpeedPerSec = (Math.PI * 2) / 150; // Exactly 150 seconds per 1 revolution

    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (!isVisible) return;

      const delta = clock.getDelta();
      controls.update();

      // Earth slow continuous rotation around its 23.5° tilted axis
      if (!isUserInteracting && !prefersReducedMotion) {
        earthGroup.rotation.y += rotationSpeedPerSec * delta;
      }

      // Update directional light position dynamically with moving 3D Sun object
      if (sunMeshGroupRef.current && sunMeshGroupRef.current.visible && sunLightRef.current) {
        sunLightRef.current.position.copy(sunMeshGroupRef.current.position);
      }

      // Satellites travel around inclined diagonal orbital paths
      satMeshGroups.forEach((s, idx) => {
        orbitProgresses[idx] += delta * s.config.speed;
        if (orbitProgresses[idx] > 1) orbitProgresses[idx] = 0;

        const pos = calculateOrbitPoint(
          s.config.radius,
          s.config.inclination,
          s.config.raan,
          orbitProgresses[idx]
        );

        s.group.position.copy(pos);
        s.group.lookAt(0, 0, 0);
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener("mousemove", handlePointerMove);
      container.removeEventListener("click", handleCanvasClick);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
      observer.disconnect();

      earthTiltGroup.clear();
      orbitsGroup.clear();
      starsGeo.dispose();
      starsMat.dispose();
      renderer.dispose();
    };
  }, []);

  // CINEMATIC ORBITAL SUNRISE ANIMATION (2.2S SWEEP FROM LEFT → RIGHT)
  useEffect(() => {
    const isLight = theme === "light";

    if (sunMeshGroupRef.current) {
      if (isLight) {
        sunMeshGroupRef.current.visible = true;
        // Reset 3D Sun to far-left offscreen position
        sunMeshGroupRef.current.position.set(-6.2, 2.6, 3.2);

        // Sweep 3D Sun object across scene from far left (-6.2) to right (+3.6)
        gsap.to(sunMeshGroupRef.current.position, {
          x: 3.6,
          y: 2.2,
          z: 2.8,
          duration: 2.2,
          ease: "power2.inOut",
        });
      } else {
        // Reverse sweep back toward left on dark mode toggle
        gsap.to(sunMeshGroupRef.current.position, {
          x: -6.2,
          y: 2.6,
          z: 3.2,
          duration: 1.8,
          ease: "power2.inOut",
          onComplete: () => {
            if (sunMeshGroupRef.current) sunMeshGroupRef.current.visible = false;
          },
        });
      }
    }

    if (ambientLightRef.current) {
      gsap.to(ambientLightRef.current, {
        intensity: isLight ? 0.62 : 0.35,
        duration: 2.0,
        ease: "power2.inOut",
      });
    }

    if (sunLightRef.current) {
      gsap.to(sunLightRef.current, {
        intensity: isLight ? 3.6 : 2.2,
        duration: 2.0,
        ease: "power2.inOut",
      });

      const targetColor = isLight ? new THREE.Color(0xfff4e0) : new THREE.Color(0xffffff);
      gsap.to(sunLightRef.current.color, {
        r: targetColor.r,
        g: targetColor.g,
        b: targetColor.b,
        duration: 2.0,
        ease: "power2.inOut",
      });
    }

    if (atmosphereMatRef.current) {
      gsap.to(atmosphereMatRef.current, {
        opacity: isLight ? 0.22 : 0,
        duration: 2.0,
        ease: "power2.inOut",
      });
    }

    if (sunRaysMatRef.current) {
      gsap.to(sunRaysMatRef.current, {
        opacity: isLight ? 0.10 : 0,
        duration: 2.0,
        ease: "power2.inOut",
      });
    }

    if (orbitLinesMatRef.current) {
      orbitLinesMatRef.current.forEach((mat) => {
        gsap.to(mat, {
          opacity: isLight ? 0.26 : 0.40,
          duration: 2.0,
        });
      });
    }

    if (starsMatRef.current) {
      gsap.to(starsMatRef.current, {
        opacity: isLight ? 0.08 : 0.25,
        duration: 2.0,
      });
    }
  }, [theme]);

  return (
    <div className="earth-spatial-viewport" data-earth-viewport="true">
      {!modelLoaded && (
        <div className="spatial-engine-loader">
          <span className="loader-pulse-dot"></span>
          <span>LOADING SPATIAL VIEW...</span>
        </div>
      )}

      <div ref={containerRef} className="earth-3d-canvas-container" />

      {/* 3D DEPTH PARTICLE FIELD INTEGRATION */}
      {sceneState && (
        <ParticleField
          scene={sceneState.scene}
          camera={sceneState.camera}
        />
      )}

      {/* MINIMAL SATELLITE BADGE — SHOWN ONLY ON HOVER */}
      {hoveredSat && (
        <div className="minimal-sat-badge">
          <Radio className="icon-xs violet-pulse" />
          <span>{hoveredSat} · ACTIVE ORBIT</span>
        </div>
      )}

      {/* SELECTED TARGET COORDINATE BADGE — SHOWN ONLY AFTER EXPLICIT USER CLICK */}
      {selectedTarget.active && (
        <div className="minimal-target-badge">
          <Target className="icon-xs violet" />
          <span>{selectedTarget.lat}</span>
          <span>{selectedTarget.lon}</span>
        </div>
      )}
    </div>
  );
}



