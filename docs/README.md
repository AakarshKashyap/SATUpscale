# SATUpscale Documentation Center

Welcome to the comprehensive documentation center for SATUpscale, an end-to-end satellite imagery super-resolution platform.

---

## Architecture & Visual Flowcharts
- [**System Architecture & Workflow Flowcharts**](FLOWCHARTS.md): Complete visual flowcharts covering system architecture, ML inference pipeline, request lifecycle state machine, frontend journey, and multi-tenant security isolation.
- [**Data Layer & REST API Contract**](../SCHEMA.md): Complete schema documentation for Amazon S3 key partitioning, DynamoDB job tables, and REST endpoints.
- [**CORS Setup Guide**](CORS_SETUP.md): API Gateway and S3 Cross-Origin Resource Sharing configuration.

---

## Subsystem Documentation
- [**Frontend Application**](../frontend/README.md): React 19, Vite, Three.js 3D Earth viewport, Amplify Cognito authentication, and test suite.
- [**Chrome Companion Extension**](../extension/README.md): Manifest V3 extension, context menu capture, area selector tool, and auth synchronization.
- [**Backend Architecture**](../backend/README.md): Serverless unified container architecture, REST routing, and AWS ECR/Lambda deployment.
  - [`POST /upscale` (Create Job)](../backend/lambda/create-job/README.md)
  - [`GET /history` (User History)](../backend/lambda/get-history/README.md)
  - [`GET /upscale/{jobId}` (Get Job)](../backend/lambda/get-job/README.md)
  - [`POST /upload-url` (Direct S3 Ingest)](../backend/lambda/generate-upload-url/README.md)
- [**Machine Learning Subsystem**](../ml/README.md): EDSR neural architecture, multi-scale chaining, and hallucination gate.
  - [Inference Engine](../ml/inference/README.md)
  - [Preprocessing Pipeline](../ml/preprocessing/README.md)
  - [Training & Loss Formulations](../ml/training/README.md)
  - [Evaluation & Benchmark Metrics](../ml/evaluation/README.md)
- [**Cloud Infrastructure & IaC**](../infrastructure/README.md): AWS resource specifications and IAM policies.
  - [AWS SAM Deployment](../infrastructure/sam/README.md)
  - [Terraform Modules](../infrastructure/terraform/README.md)
