# Model Evaluation & Benchmark Metrics

This directory contains evaluation protocols, benchmark test sets, and quantitative validation metrics used to assess SATUpscale's super-resolution quality against standard baseline interpolations.

---

## Evaluation Metrics

To rigorously evaluate super-resolution performance across satellite scenes (urban, agricultural, coastal, desert), four complementary metrics are measured:

### 1. PSNR (Peak Signal-to-Noise Ratio)
Measures reconstruction fidelity in decibels (dB):
$$\text{PSNR} = 10 \cdot \log_{10}\left(\frac{\text{MAX}_{I}^2}{\text{MSE}}\right)$$
- **Interpretation**: Higher is better. Reflects pixel-level color reconstruction accuracy.
- **Typical Range**: 26 dB to 36 dB on satellite datasets.

### 2. SSIM (Structural Similarity Index Measure)
Evaluates perceptual degradation based on luminance, contrast, and structural information:
$$\text{SSIM}(x, y) = \frac{(2\mu_x\mu_y + c_1)(2\sigma_{xy} + c_2)}{(\mu_x^2 + \mu_y^2 + c_1)(\sigma_x^2 + \sigma_y^2 + c_2)}$$
- **Interpretation**: Values range from 0.0 to 1.0 (1.0 = identical).
- **Quality Gate Threshold**: SATUpscale enforces a minimum round-trip SSIM of **0.60** to prevent hallucinated artifacts.

### 3. LPIPS (Learned Perceptual Image Patch Similarity)
Deep feature perceptual distance metric computed using deep convolutional activations (AlexNet / VGG):
- **Interpretation**: Lower is better (0.0 = perceptually indistinguishable).

---

## Comparative Benchmarks (4x Upscaling)

Quantitative results evaluated across 500 test satellite scene patches:

| Method | PSNR (dB) ↑ | SSIM ↑ | Inference Latency (CPU) |
| :--- | :--- | :--- | :--- |
| **Bicubic Interpolation** | 27.82 | 0.741 | ~12 ms |
| **Lanczos-4** | 28.15 | 0.758 | ~18 ms |
| **SRCNN** | 29.40 | 0.792 | ~110 ms |
| **SATUpscale (EDSR Baseline)** | **32.65** | **0.874** | **~850 ms** |

---

## Running Evaluation Benchmarks

```bash
python -m ml.evaluation.evaluate \
  --test-dir data/test/ \
  --weights ml/inference/edsr/model.pth \
  --scale 4 \
  --output results/
```
