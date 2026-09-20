# Satellite Data Preprocessing Pipeline

This directory contains pipelines, utilities, and documentation for preparing Earth Observation (EO) rasters for super-resolution training and inference.

---

## Preprocessing Steps

```text
Multi-Spectral Satellite Raster (GeoTIFF / JP2)
                   │
                   ▼
     Band Selection & Compositing (RGB: B04, B03, B02)
                   │
                   ▼
     Atmospheric & Radiometric Normalization (0 - 10000 -> 0.0 - 1.0)
                   │
                   ▼
     Cloud & Shadow Masking (SCL / QA60 Band Filtering)
                   │
                   ▼
     Patch Extraction & Slicing (256x256 crops with overlap)
                   │
                   ▼
     Quality Filter (Discard >10% nodata / cloud-covered tiles)
                   │
                   ▼
Normalized Training & Validation Pairs (LR / HR)
```

---

## 1. Multi-Spectral Band Compositing
Satellite missions like Sentinel-2 (MSI) provide up to 13 spectral bands at varying resolutions (10m, 20m, 60m):
- **True Color (RGB)**: Band 4 (Red, 665nm), Band 3 (Green, 560nm), Band 2 (Blue, 490nm).
- **False Color (Urban/Veg)**: Band 8 (NIR, 842nm), Band 4 (Red), Band 3 (Green).

The preprocessing pipeline extracts optical RGB bands, normalizes top-of-atmosphere (TOA) or bottom-of-atmosphere (BOA) reflectances, and converts 16-bit unsigned integers to standard 8-bit RGB color spaces.

---

## 2. Radiometric Normalization
Raw satellite pixel digital numbers (DN) span large dynamic ranges. Standard normalization clips reflectances to avoid atmospheric flare saturation:

```python
import numpy as np

def normalize_reflectance(band_array, p_low=1.0, p_high=99.0):
    """Percentile-based dynamic range compression for satellite bands."""
    v_min, v_max = np.percentile(band_array, (p_low, p_high))
    clipped = np.clip(band_array, v_min, v_max)
    normalized = (clipped - v_min) / (v_max - v_min + 1e-6)
    return (normalized * 255).astype(np.uint8)
```

---

## 3. Patch Tiling for Model Training
To train high-resolution residual architectures:
- High-resolution (HR) ground-truth scenes are sliced into non-overlapping `256x256` patches.
- Corresponding low-resolution (LR) inputs are synthetically generated via bicubic downsampling with sensor point-spread function (PSF) Gaussian blurring:
  - Scale `2x`: `128x128` LR -> `256x256` HR
  - Scale `4x`: `64x64` LR -> `256x256` HR
