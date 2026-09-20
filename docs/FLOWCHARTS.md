# SATUpscale — System Architecture & Workflow Flowcharts

> **Note:** All diagrams in this document use standard **GitHub Flavored Mermaid syntax**. They render interactively on GitHub, in VS Code / IDE markdown previews, and in documentation sites.  
> **Privacy Notice:** All proprietary credentials, AWS account IDs, user pool IDs, and secrets have been sanitized.

---

## 1. End-to-End System Architecture

High-level architecture showing how the Frontend, Authentication layer, API Gateway, Serverless Compute, and Storage interact.

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Layer"]
        Frontend["Web Frontend / Browser Extension"]
    end

    subgraph AuthLayer ["Identity & Access"]
        Cognito["Amazon Cognito User Pool<br/>(JWT RS256 Tokens)"]
    end

    subgraph IngestionLayer ["API & Routing"]
        APIGW["Amazon API Gateway (REST)<br/>(Cognito Authorizer)"]
    end

    subgraph ComputeLayer ["Serverless ML Compute"]
        Lambda["AWS Lambda Container (Python 3.11 / PyTorch)<br/>- Dynamic Scale Engine<br/>- EDSR Baseline Model<br/>- Anti-Hallucination Quality Gate"]
    end

    subgraph StorageLayer ["Data & Asset Persistence"]
        S3[("Amazon S3 Bucket<br/>├── original/{userId}/{jobId}.ext<br/>└── output/{userId}/{jobId}.ext")]
        DDB[("Amazon DynamoDB (Jobs Table)<br/>- Partition Key: jobId<br/>- GSI: UserHistoryIndex<br/>- 48h Auto-TTL")]
    end

    Frontend -->|"1. User Authentication"| Cognito
    Cognito -->|"2. ID Token (JWT)"| Frontend
    Frontend -->|"3. POST /upscale (Bearer ID Token)"| APIGW
    APIGW -->|"4. Authorize & Forward"| Lambda
    Lambda -->|"5. Store Raw Input"| S3
    Lambda -->|"6. Create Job Record (pending)"| DDB
    Lambda -->|"7. Store Enhanced Result"| S3
    Lambda -->|"8. Update Record (done)"| DDB
    Lambda -->|"9. Return Presigned URLs"| Frontend
```

---

## 2. ML Inference & Anti-Hallucination Quality Gate

This diagram details the core computer vision pipeline inside the Lambda container (`ml/inference/upscale.py`).

```mermaid
flowchart TD
    Start["Input Image (Base64)"] --> Validate["Decode & Format Validation<br/>(JPEG / PNG / WebP)"]
    
    Validate --> DimCheck{"Max Dimension <= 2048px?"}
    DimCheck -- "No" --> Reject["Reject Request (400 Bad Request)"]
    
    DimCheck -- "Yes" --> Assess["Pre-Inference Quality Assessment<br/>(Laplacian Blur, Contrast, Brightness, Noise)"]
    
    Assess --> ScalePlan["Scale Calculation & Chaining<br/>(e.g., 8x decomposes into [4, 2] EDSR)"]
    
    ScalePlan --> SafeBox["Downsample Input to 256px Inference Box<br/>(Protects against timeout and memory spikes)"]
    
    SafeBox --> RunEDSR["Run EDSR Deep Neural Network"]
    SafeBox --> RunLanczos["Generate Lanczos Baseline Reference"]
    
    RunEDSR --> Gate["Anti-Hallucination Quality Gate"]
    RunLanczos --> Gate
    
    subgraph GateDetails ["Quality Gate Verification"]
        Gate --> Sig1["Signal 1: Round-Trip SSIM<br/>Downsample EDSR to input size<br/>Compare vs Original (SSIM >= 0.60)"]
        Gate --> Sig2["Signal 2: High-Frequency Ratio<br/>Laplacian Var(EDSR) / Var(Lanczos)<br/>Threshold <= 4.0x"]
    end
    
    Sig1 & Sig2 --> Decision{"Both Checks Pass?"}
    
    Decision -- "Pass" --> AcceptEDSR["Accept EDSR Upscale<br/>upscaleMethod = 'edsr'"]
    Decision -- "Fail (Artifacts/Spirals)" --> FallbackLanczos["Fallback to Clean Lanczos<br/>upscaleMethod = 'lanczos_fallback'"]
    
    AcceptEDSR --> PostProc["Post-Processing<br/>(Color & Dynamic Range Preservation)"]
    FallbackLanczos --> PostProc
    
    PostProc --> FinalCap["Resize to Target Dimensions & Cap at 2048px"]
    FinalCap --> Deliver["Output Enhanced Image Buffer"]
```

---

## 3. Request Lifecycle & Dual-Storage State Machine

Illustrates state transitions, S3 dual-key partitioning, and DynamoDB job persistence (`ml/inference/lambda_handler.py`).

```mermaid
stateDiagram-v2
    [*] --> IngestRequest: Client calls POST /upscale
    
    state IngestRequest {
        VerifyAuth: Verify Bearer ID Token & Extract userId
        RateLimit: Check UserHistoryIndex (Limit: 20 jobs/hr)
    }

    IngestRequest --> JobCreated: Rate limit & token valid
    
    state JobCreated {
        CreatePending: Insert DynamoDB record (status = pending, 48h TTL)
        UploadOriginal: Upload original image to S3 (original/{userId}/{jobId}.ext)
        UpdateProcessing: Update DynamoDB (status = processing, originalKey)
    }

    JobCreated --> RunningML: Original asset secured

    state RunningML {
        ExecuteInference: upscale_image() with dynamic scaling
        UploadEnhanced: Upload upscaled image to S3 (output/{userId}/{jobId}.ext)
    }

    RunningML --> JobCompleted: Inference finished

    state JobCompleted {
        SanitizeMetrics: Cast float metrics to DynamoDB Decimal
        UpdateDone: Update DynamoDB (status = done, metrics, dimensions)
        GeneratePresigned: Sign 1-hour GET URLs (originalUrl + outputUrl)
    }

    JobCompleted --> [*]: Return 200 OK JSON to Client
```

---

## 4. Frontend Result & Before / After Comparison Journey

Traces how the user interacts with the application from dropzone upload to the split-screen comparison slider.

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant UI as Frontend App
    participant API as Backend API
    participant S3 as Amazon S3

    User->>UI: Selects / Drops image file
    UI->>UI: Convert file to Base64
    UI->>API: POST /upscale { image: base64, scale_factor: 2 }
    
    activate API
    UI->>User: Display processing animation / progress indicator
    API-->>UI: 200 OK { jobId, originalUrl, outputUrl, upscaleMethod, edsr_ssim }
    deactivate API

    UI->>S3: Load originalUrl (Left pane / Before)
    UI->>S3: Load outputUrl (Right pane / After)
    
    UI->>User: Render Interactive Split Slider & Quality Badge
    User->>UI: Drags comparison slider left/right
    User->>UI: Clicks "Download Enhanced Image"
    UI->>User: Triggers local browser download
```

---

## 5. Multi-Tenant Data Isolation & Security Flow

Demonstrates how user data is kept strictly isolated across DynamoDB and S3 using JWT claims.

```mermaid
flowchart TD
    UserReq["Incoming HTTP Request<br/>(Authorization: Bearer ID_TOKEN)"] --> APIGW["API Gateway Authorizer<br/>(Validates Token Signature with JWKS)"]
    
    APIGW --> ExtractClaim["Lambda Extracts 'sub' Claim<br/>userId = claims['sub']"]
    
    subgraph DataPartitioning ["Strict Tenant Isolation"]
        ExtractClaim --> S3Partition["S3 Key Isolation:<br/>s3://bucket/original/{userId}/{jobId}.ext<br/>s3://bucket/output/{userId}/{jobId}.ext"]
        ExtractClaim --> DBPartition["DynamoDB Query Isolation:<br/>SELECT * FROM Jobs WHERE userId = :currentUserId"]
    end
    
    DBPartition --> SafeResponse["Return Only Authenticated User's Assets"]
    S3Partition --> SafeResponse
```
