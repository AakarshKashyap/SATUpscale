# SATUpscale: AI-Powered Satellite Imagery Super-Resolution

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![AWS Serverless](https://img.shields.io/badge/AWS-Lambda%20%7C%20S3%20%7C%20DynamoDB%20%7C%20Cognito-orange.svg)](https://aws.amazon.com)
[![PyTorch](https://img.shields.io/badge/PyTorch-EDSR%20Super--Resolution-red.svg)](https://pytorch.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-blueviolet.svg)](https://vitejs.dev)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)

SATUpscale is an end-to-end, cloud-native AI platform designed for earth observation and geospatial intelligence. It reconstructs low-resolution satellite rasters into sharp, high-fidelity imagery using deep Enhanced Deep Residual Networks (EDSR) with dynamic multi-scale model chaining, automated perceptual quality assessment, and strict hallucination safeguards.

---

## 1. Problem Statement

Satellite imagery acquired from Low Earth Orbit (LEO) and Medium Earth Orbit (MEO) constellations frequently suffers from:
- **Atmospheric scattering and sensor optical limits:** Blurring and loss of high-frequency spatial details.
- **Data transfer bandwidth constraints:** Downlinked tiles are often heavily compressed or subsampled.
- **Hallucination risks in generic generative AI:** Standard generative models often fabricate non-existent geographical features (false roads, distorted coastlines, fictitious structures), compromising scientific analysis.
- **Rigid scaling architectures:** Legacy super-resolution systems support only a single fixed scale factor (typically 4× or 8×), ignoring image dimensions and aspect ratios.

---

## 2. The Solution

SATUpscale provides a verifiable super-resolution workflow across web and browser companion interfaces:
1. **Dynamic Scaling (Auto / 2× / 4× / 8× / 16× / 32×):** Chains PyTorch-based EDSR models to scale small satellite crops up to a safe 2,048px cap.
2. **Deterministic Hallucination Gate:** Uses round-trip Structural Similarity Index Measure (SSIM) and high-frequency spectral energy ratios. If the neural model hallucinates ungrounded details, it automatically falls back to an artifact-free Lanczos interpolation.
3. **Adaptive Post-Processing:** Two-stage refinement featuring Bilateral filtering (watercolor artifact suppression), Contrast-Limited Adaptive Histogram Equalization (CLAHE in LAB color space), dynamic saturation recovery, and scale-tuned unsharp masking.
4. **Cloud-Native AWS Backend:** Secure, multi-tenant serverless execution utilizing AWS Lambda, private S3 storage with temporary presigned URLs, DynamoDB with automated 48-hour TTL lifecycle management, and AWS Cognito user authentication.
5. **Browser Companion Extension (Manifest V3):** Right-click or visually select satellite tiles directly from web mapping interfaces (Sentinel Hub, Google Maps, OpenStreetMap) and trigger authenticated cloud upscaling in one click.

---

## 3. End-to-End System Architecture

```text
Web Client / Chrome Extension
         │
         │  (Authorization: Bearer <Cognito ID Token>)
         ▼
  AWS API Gateway (REST / HTTP v2)
         │
         ▼
 AWS Lambda Inference Handler (Python 3.10 + Container / PyTorch)
  ├── 1. Cognito RS256 JWKS Token Verification (sub = userId)
  ├── 2. DynamoDB Rate Limit Verification (20 jobs / user / hr)
  ├── 3. S3 Input Upload (`original/{userId}/{jobId}.ext`)
  ├── 4. Automated Input Quality & Blur Assessment (Laplacian Variance)
  ├── 5. EDSR Neural Scaling & Dynamic Model Chaining
  ├── 6. Dual-Signal Hallucination Gate (Round-Trip SSIM > 0.60)
  ├── 7. Multi-Stage Post-Processing (CLAHE, Bilateral Filter, Sharpening)
  ├── 8. S3 Output Upload (`output/{userId}/{jobId}.ext`)
  └── 9. DynamoDB Job Metadata Logging (`SRMJobs` Table, 48h TTL)
         │
         ▼
  Client receives 1-Hour Presigned URLs & Navigates to `/result/:jobId`
```

---

## 4. Machine Learning & Inference Pipeline

### Multi-Scale EDSR Chaining
Rather than training monolithic models for every scale factor, SATUpscale combines baseline EDSR 2× and 4× models:
- **2×:** Single 2× EDSR model pass
- **4×:** Single 4× EDSR model pass
- **8×:** Sequential chain: 4× → 2×
- **16×:** Sequential chain: 4× → 4×
- **32×:** Sequential chain: 4× → 4× → 2×
- **Auto:** Computes optimal integer scale factor based on input dimensions up to the 2,048px output cap.

### Hallucination Detection & Lanczos Gate
To ensure scientific integrity, the inference pipeline runs a two-signal quality gate on the model output:
1. **Round-Trip SSIM:** The super-resolved image is downsampled back to the input resolution and compared against the original input. Hallucinated artifacts reduce SSIM below `0.60`, which immediately aborts the neural output.
2. **High-Frequency Spectral Ratio:** Compares the high-frequency energy ratio against an anti-aliased Lanczos baseline to detect noise amplification.

### Post-Processing Stages
- **Stage 1 (Artifact Suppression):** Bilateral filtering smooths subtle neural watercoloring while preserving rigid edges, followed by LAB-space CLAHE for local topography enhancement.
- **Stage 2 (Radiometric Balance):** Dynamic histogram saturation adjustment and unsharp masking scaled proportional to the magnification factor.

---

## 5. Security & Multi-Tenancy Architecture

| Layer | Implementation |
|---|---|
| **Authentication** | AWS Cognito User Pools. Frontend and extension strictly transmit the **Cognito ID Token** via `Authorization: Bearer <idToken>`. |
| **Token Verification** | Lambda caches Cognito JWKS public keys, validates signatures (RS256), verifies `aud`/`client_id`, issuer, expiration, and extracts `sub` as the authoritative user identity. Client-supplied user IDs are never trusted. |
| **S3 Storage** | S3 bucket blocks all public access (`BlockPublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets`). Object keys are partitioned by `userId`: `original/{userId}/{jobId}.ext` and `output/{userId}/{jobId}.ext`. |
| **Access Control** | Clients access images exclusively via 1-hour presigned GET URLs generated on demand. Raw S3 URLs are never returned. |
| **Resource Isolation** | DynamoDB `GET /upscale/{jobId}` enforces strict ownership checks (`item.userId == request.userId`). Users cannot inspect other users' jobs. |
| **Cost & Data Control** | S3 bucket lifecycle rules and DynamoDB TTL automatically delete original and processed assets after 48 hours. Rate limiting restricts users to 20 upscales per hour. |
| **Logging & Privacy** | Request payloads (including up to 10MB base64 images) and authorization headers are sanitized and never logged to CloudWatch. |

---

## 6. Repository Layout

```text
SATUpscale/
├── frontend/                     # React 19 + Vite Web Application
│   ├── src/
│   │   ├── components/           # Navigation, Dropzones, Visualizers
│   │   ├── context/              # AuthContext with automatic refresh
│   │   ├── pages/                # Landing, Dashboard, Enhance, Result, History, Settings
│   │   └── services/             # Cognito auth.js and API Gateway api.js
│   ├── public/                   # Static satellite imagery and 3D globe assets
│   ├── package.json
│   └── vite.config.js
│
├── extension/                    # Chrome Companion Extension (Manifest V3)
│   ├── manifest.json             # Extension permissions and host configurations
│   ├── background.js             # Service worker handling session sync & API calls
│   ├── content.js                # On-page DOM image inspection and selection mode
│   ├── popup.html & popup.js     # Extension UI and state machine
│   └── icons/                    # Extension action icons
│
├── ml/                           # ML Inference Engine
│   └── inference/
│       ├── lambda_handler.py     # AWS Lambda entrypoint, JWT verification & routing
│       └── upscale.py            # PyTorch EDSR chaining & hallucination detection
│
├── docs/                         # Additional architecture flowcharts & guides
│   ├── FLOWCHARTS.md
│   └── CORS_SETUP.md
│
├── setup.sh                      # Automated AWS S3 & DynamoDB provisioning script
└── README.md
```

---

## 7. Getting Started & Local Development

### Prerequisites
- Node.js (v18 or higher) & npm
- Python 3.10+ & PyTorch (for local ML testing)
- AWS CLI configured with administrator or deployment credentials
- Google Chrome (for companion extension)

### 1. Frontend Setup
```bash
cd frontend
npm install

# Copy environment template and configure your parameters
cp .env.example .env
```

Edit `frontend/.env`:
```ini
VITE_AWS_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=your_cognito_user_pool_id
VITE_COGNITO_CLIENT_ID=your_cognito_client_id
VITE_COGNITO_DOMAIN=your_cognito_domain.amazoncognito.com
VITE_API_BASE_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
VITE_APP_URL=http://localhost:5173
```

Run the development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Run verification tests:
```bash
node test-checklist.js
```

### 2. Chrome Extension Setup
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the upper right corner.
3. Click **Load unpacked** and select the `extension/` directory inside this repository.
4. When logged into the SATUpscale web application (either locally or on production), the extension automatically synchronizes your authenticated session.

### 3. AWS Infrastructure Setup
Run the included provisioning script to configure S3 private buckets, CORS, lifecycle expiration, DynamoDB tables, and GSI indexes:
```bash
chmod +x setup.sh
./setup.sh
```

---

## 8. REST API Specification

All authenticated requests require `Authorization: Bearer <Cognito_ID_Token>`.

### `POST /upscale`
Submit an image raster for super-resolution.
- **Request Body:**
  ```json
  {
    "image": "<base64_encoded_image_string>",
    "scale_factor": 8
  }
  ```
  *(Note: `scale_factor` is optional. Omitting or passing `null` activates auto-scaling).*
- **Response (200 OK):**
  ```json
  {
    "jobId": "b18b4886-c31a-4d74-9d58-c9c43d8a8b11",
    "status": "done",
    "actualScale": 8,
    "scalingChain": ["4x", "2x"],
    "originalUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/original/...?X-Amz-Signature=...",
    "processedUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/output/...?X-Amz-Signature=...",
    "processingTimeMs": 2840,
    "qualityAssessment": {
      "inputQualityScore": 76.5,
      "blurDetection": { "isBlurry": false }
    }
  }
  ```

### `GET /upscale/{jobId}`
Retrieve metadata, processing status, and freshly signed URLs for a job.
- **Response (200 OK):**
  ```json
  {
    "jobId": "b18b4886-c31a-4d74-9d58-c9c43d8a8b11",
    "status": "done",
    "actualScaleFactor": 8,
    "originalUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/original/...",
    "processedUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/output/...",
    "processingTimeMs": 2840
  }
  ```

### `GET /history`
Query paginated user enhancement history (newest first).
- **Response (200 OK):**
  ```json
  {
    "jobs": [
      {
        "jobId": "b18b4886-c31a-4d74-9d58-c9c43d8a8b11",
        "status": "done",
        "actualScaleFactor": 8,
        "timestamp": 1726844400,
        "processedUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/output/..."
      }
    ]
  }
  ```

### `GET /stats`
Aggregated telemetry for the authenticated user account.
- **Response (200 OK):**
  ```json
  {
    "totalImages": 14,
    "averageProcessingTimeMs": 2420,
    "averageScaleFactor": 7.4,
    "averageInputQuality": 71.8
  }
  ```

---

## 9. Submission & Deployment Checklist

- [x] **Zero Hardcoded Secrets:** No AWS access keys, secret keys, passwords, or tokens in source code or Git history.
- [x] **Secure ID-Token Auth:** Only valid Cognito ID Tokens accepted by API Gateway & Lambda authorizers.
- [x] **Multi-Scale Real AI Inference:** PyTorch EDSR model chaining supporting Auto, 2×, 4×, 8×, 16×, and 32× up to 2,048px.
- [x] **Hallucination Protection:** Round-trip SSIM validation with Lanczos fallback.
- [x] **Private S3 & Presigned Access:** Zero public read access; all downloads mediated via temporary 1-hour presigned URLs.
- [x] **Memory Management:** Object URLs systematically revoked on replace, reset, and unmount.
- [x] **Reliable Cross-Origin Downloads:** Presigned S3 asset downloads executed via blob retrieval, eliminating browser tab-opening bugs.
- [x] **Clean Chrome Extension:** Manifest V3 compliant with automated session bridge and zero localhost dependencies.
- [x] **Production Build Verified:** Vite clean build with exit code 0 and automated test checklist passing 10/10.

---

## 10. License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.