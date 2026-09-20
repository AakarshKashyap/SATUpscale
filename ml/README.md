# SATUpscale — Machine Learning Subsystem

The SATUpscale machine learning subsystem provides state-of-the-art super-resolution for Earth Observation (EO) and remote sensing satellite imagery, utilizing Enhanced Deep Residual Networks (EDSR).

---

## The Challenge in Satellite Imagery

Unlike natural photographic images (portraits, landscapes), satellite imagery presents unique domain challenges:
1. **Physical Ground Sampling Distance (GSD)**: Every pixel corresponds to a real-world physical area (e.g., 10m/px in Sentinel-2, 30m/px in Landsat).
2. **High-Frequency Spectral Content**: Fine geographical features (roads, runways, building outlines, agricultural crop boundaries) are easily corrupted by standard interpolation or blurred by sensor noise.
3. **The Hallucination Danger**: Generative adversarial models (GANs) and diffusion models frequently invent fictitious roads or buildings. In scientific and geospatial intelligence workflows, **hallucinations are catastrophic**.
4. **Variable Input Scales**: Satellite tiles captured from web maps arrive in unpredictable crops and dimensions.

---

## The Solution: EDSR Multi-Scale Model Chaining

SATUpscale deploys an **Enhanced Deep Residual Network (EDSR)** baseline architecture with modular weights:

```text
Input Satellite Image (PIL)
        │
        ▼
┌───────────────────────────────────────┐
│       Quality & Blur Assessment       │
│ • Laplacian Variance Blur Score       │
│ • Input Quality Score (0 - 100)       │
│ • Recommended Scale Resolution        │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│        Dynamic Model Chaining         │
│  2x:   [EDSR 2x]                      │
│  4x:   [EDSR 4x]                      │
│  8x:   [EDSR 4x] ──► [EDSR 2x]        │
│  16x:  [EDSR 4x] ──► [EDSR 4x]        │
│  32x:  [EDSR 4x] ──► [EDSR 4x] ──► 2x │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│      Anti-Hallucination Gate          │
│ • Downscale output back to input size │
│ • Compute Round-Trip SSIM (>= 0.60)   │
│ • Fallback to Lanczos if compromised  │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│      Two-Stage Post-Processing        │
│ Stage 1: Bilateral Filter + CLAHE     │
│ Stage 2: Saturation + Unsharp Mask    │
└───────────────────┬───────────────────┘
                    │
                    ▼
Enhanced High-Fidelity Satellite Raster
```

---

## Subsystem Layout

- [**`inference/`**](inference/README.md): Production container deployment, model loader, dynamic scale chaining, and anti-hallucination verification.
- [**`preprocessing/`**](preprocessing/README.md): Satellite band extraction, normalization, and patch tiling pipelines.
- [**`training/`**](training/README.md): Dataset preparation, loss formulations (L1, perceptual, SSIM), and fine-tuning routines.
- [**`evaluation/`**](evaluation/README.md): Quantitative benchmark suites (PSNR, SSIM, LPIPS) comparing EDSR against baseline interpolators.
