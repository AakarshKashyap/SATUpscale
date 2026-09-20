# Terraform Infrastructure as Code (IaC)

This directory contains Terraform documentation and modular patterns for orchestrating SATUpscale cloud resources across environments (dev, staging, prod).

---

## Managed AWS Resources

| Resource | Terraform Type | Purpose |
| :--- | :--- | :--- |
| **S3 Asset Bucket** | `aws_s3_bucket` | Private bucket for low-res originals and high-res outputs. |
| **S3 Public Block** | `aws_s3_bucket_public_access_block` | Strictly disables all public reads and ACLs. |
| **S3 Lifecycle Rule** | `aws_s3_bucket_lifecycle_configuration` | Auto-deletes assets older than 2 days (48 hours). |
| **DynamoDB Jobs Table** | `aws_dynamodb_table` | Job metadata persistence with GSI `UserHistoryIndex` and TTL. |
| **API Gateway** | `aws_api_gateway_rest_api` | REST endpoints with CORS and Cognito authorizer. |
| **Cognito Authorizer** | `aws_api_gateway_authorizer` | Secures routes with Cognito User Pool JWT verification. |
| **Lambda Function** | `aws_lambda_function` | Container-based ML inference engine from ECR image. |
| **IAM Execution Role** | `aws_iam_role` & `aws_iam_policy` | Least-privilege role for Lambda S3/DynamoDB access. |

---

## Getting Started

### 1. Prerequisites
- [Terraform CLI](https://developer.hashicorp.com/terraform/downloads) (>= 1.5.0)
- AWS CLI configured with administrator privileges

### 2. Configuration (`terraform.tfvars`)
Create a local `terraform.tfvars` file:

```hcl
aws_region             = "us-east-1"
environment            = "prod"
s3_bucket_name         = "srm-upscaler-outputs"
dynamodb_table_name    = "SRMJobs"
cognito_user_pool_id   = "us-east-1_XXXXXXXXX"
cognito_client_id      = "YYYYYYYYYYYYYYYYYYYYYYYY"
lambda_image_uri       = "123456789012.dkr.ecr.us-east-1.amazonaws.com/satupscale-upscaler:latest"
```

### 3. Execution Commands

```bash
# Initialize Terraform and download AWS provider plugins
terraform init

# Validate configuration syntax
terraform validate

# Preview planned cloud infrastructure changes
terraform plan -out=tfplan

# Apply changes to provision resources
terraform apply tfplan
```

### 4. Teardown
To destroy all provisioned infrastructure:

```bash
terraform destroy
```
