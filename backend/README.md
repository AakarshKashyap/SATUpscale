# SATUpscale Backend Architecture

The backend is implemented as a single containerized AWS Lambda function using PyTorch and OpenCV:

- **Primary Handler & REST Routing:** [`ml/inference/lambda_handler.py`](../ml/inference/lambda_handler.py)
  - Manages JWT authentication (Cognito RS256 via JWKS).
  - Handles `/upscale`, `/history`, `/stats`, and `/upscale/{jobId}` routes.
  - Uploads original and processed images to Amazon S3.
  - Records job state and metrics to Amazon DynamoDB (`SRMJobs`).
  - Generates 1-hour presigned URLs for client download.
- **ML Super-Resolution & Quality Gate:** [`ml/inference/upscale.py`](../ml/inference/upscale.py)
  - Dynamic scale factor resolution (`2×`, `4×`, `8×`, `16×`, `32×`, and Auto).
  - EDSR neural network model execution (`model_2x.pth` and `model.pth`).
  - Dual-signal anti-hallucination quality gate (round-trip SSIM + high-frequency ratio with clean Lanczos fallback).
- **Docker Image & Dependencies:** [`ml/inference/Dockerfile`](../ml/inference/Dockerfile) and [`ml/inference/requirements.txt`](../ml/inference/requirements.txt).
