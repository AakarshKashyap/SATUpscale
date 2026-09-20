# AWS SAM (Serverless Application Model) Deployment

This directory contains guidance for deploying SATUpscale using the AWS Serverless Application Model (SAM).

---

## Overview

AWS SAM allows you to package and deploy the entire SATUpscale backend stack (API Gateway, Lambda Container Function, DynamoDB Table, and S3 Bucket) through a declarative CloudFormation specification.

---

## Prerequisites

1. [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed.
2. [Docker](https://www.docker.com/) installed and running (for container image packaging).
3. AWS credentials configured (`aws configure`).

---

## Deployment Workflow

### 1. Build the Application
Compile and package the containerized Lambda application:

```bash
sam build --use-container
```

### 2. Guided Deployment
Deploy the stack to your AWS account with interactive parameter prompts:

```bash
sam deploy --guided
```

When prompted:
- **Stack Name**: `satupscale-stack`
- **AWS Region**: `us-east-1`
- **Parameter CognitoUserPoolId**: Your Cognito User Pool ID.
- **Parameter CognitoClientId**: Your Frontend Client ID.
- **Confirm changes before deploy**: `Y`
- **Allow SAM CLI to create IAM roles**: `Y`

### 3. CI/CD Non-Interactive Deploy
For automated deployment pipelines (GitHub Actions, GitLab CI, AWS CodePipeline):

```bash
sam deploy \
  --stack-name saTupscale-prod \
  --resolve-s3 \
  --resolve-image-repos \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      CognitoUserPoolId="us-east-1_XXXXXXXXX" \
      CognitoClientId="YYYYYYYYYYYYYYYYYYYYYYYY"
```

---

## Stack Outputs

Upon successful deployment, SAM outputs the following endpoints:

| Output Key | Description |
| :--- | :--- |
| `ApiUrl` | Base URL for REST endpoints (`https://{ApiId}.execute-api.us-east-1.amazonaws.com/prod`). |
| `LambdaFunctionArn` | ARN of the containerized inference function. |
| `S3BucketName` | Output asset storage bucket (`srm-upscaler-outputs`). |
| `DynamoTableName` | Jobs metadata DynamoDB table (`SRMJobs`). |
