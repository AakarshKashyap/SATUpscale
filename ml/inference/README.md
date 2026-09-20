# ML Inference Engine & Lambda Container

This directory houses the core inference pipeline ([`upscale.py`](upscale.py)), containerized AWS Lambda handler ([`lambda_handler.py`](lambda_handler.py)), Docker specification ([`Dockerfile`](Dockerfile)), and pre-trained EDSR weight checkpoints.

---

## Core Components

### 1. `upscale.py` (Super-Resolution Pipeline)
- **Input Handling**: Accepts any PIL Image up to 2,048px along the longest dimension.
- **Quality Assessment**:
  - Computes Laplacian variance on grayscale conversions to detect sensor motion or atmospheric blur.
  - Generates a normalized `inputQualityScore` (0–100) and user-facing warning banners (`qualityWarning`, `blurWarning`).
- **Dynamic Scale Chaining**:
  - Native models loaded from disk: `edsr/model_2x.pth` (2× scale) and `edsr/model.pth` (4× scale).
  - High-order scaling factors are constructed by serial chaining:
    - **`2x`**: Single pass through `model_2x.pth`.
    - **`4x`**: Single pass through `model.pth`.
    - **`8x`**: `4x` pass followed by `2x` pass.
    - **`16x`**: `4x` pass followed by `4x` pass.
    - **`32x`**: `4x` pass followed by `4x` pass followed by `2x` pass.
- **Anti-Hallucination Quality Gate**:
  - Downscales the upscaled image back to original resolution and computes **Structural Similarity (SSIM)** against the ground-truth input.
  - If round-trip SSIM drops below `0.60` (indicating synthetic distortion or structural hallucinations), the pipeline automatically falls back to an artifact-free Lanczos interpolation.
- **Adaptive Post-Processing**:
  - **Bilateral Filter**: Suppresses watercolor/patchwork artifacts characteristic of deep residual networks while preserving sharp edges.
  - **CLAHE**: Contrast-Limited Adaptive Histogram Equalization applied in LAB color space to enhance geographical contrast without color shift.
  - **Dynamic Saturation**: Recovers muted vegetation/ocean tones via histogram-guided saturation enhancement.
  - **Unsharp Masking**: High-pass filter sharpness enhancement scaled proportionally to the upscaling magnitude.

### 2. `lambda_handler.py` (Serverless Controller)
- Implements the AWS Lambda entry point (`handler(event, context)`).
- Intercepts requests, validates Cognito `IdToken` against RS256 JWKS public keys.
- Manages dual S3 asset persistence (`original/{userId}/{jobId}` and `output/{userId}/{jobId}`).
- Enforces DynamoDB float serialization safety via `_dynamo_safe()`.
- Generates 1-hour presigned download URLs for client consumption.

---

## Docker Container & Dependencies

The inference runtime is containerized using AWS Lambda's official Python 3.10 base image:

```dockerfile
FROM public.ecr.aws/lambda/python:3.10

# Install Linux system libraries for OpenCV and PyTorch
RUN yum install -y mesa-libGL glib2

# Install Python ML dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application source code and model weights
COPY edsr/ /var/task/edsr/
COPY upscale.py /var/task/
COPY lambda_handler.py /var/task/

CMD [ "lambda_handler.handler" ]
```

### Key Python Dependencies (`requirements.txt`):
- `torch` & `torchvision`: PyTorch tensor computation engine (CPU-optimized build).
- `torchsr`: PyTorch Super-Resolution model library.
- `opencv-python-headless`: Computer vision processing, bilateral filtering, and CLAHE.
- `pillow`: Image I/O and format conversions.
- `boto3`: AWS SDK for S3 and DynamoDB integration.
- `cryptography` & `pyjwt`: Cryptographic verification of Cognito RS256 JWT tokens.

---

## Local Testing

You can run automated tests for both the Lambda routing layer and the ML inference pipeline:

```bash
# Run unit tests for Lambda routing
python -m unittest ml/inference/tests/test_lambda.py

# Run standalone ML inference pipeline test
python ml/inference/upscale.py
```
