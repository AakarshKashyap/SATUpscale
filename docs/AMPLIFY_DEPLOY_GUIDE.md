# AWS Amplify Git Deployment Guide

This guide walks you through deploying the SATUpscale web application using **AWS Amplify Hosting** directly connected to your GitHub repository.

---

## 1. Prerequisites
- A GitHub repository containing the latest commits: `AakarshKashyap/SATUpscale` on branch `feature/web-extension-mvp` (or `main`).
- AWS Management Console access.

---

## 2. Step-by-Step Deployment in AWS Amplify Console

### Step 1: Open AWS Amplify
1. Log in to the [AWS Management Console](https://console.aws.amazon.com/).
2. In the top search bar, type **Amplify** and navigate to the AWS Amplify service.
3. Make sure your region is set to **`us-east-1` (N. Virginia)**.
4. Click **Create new app** (or **Deploy an app**).

### Step 2: Connect Your GitHub Repository
1. Under **Start with an existing code repository**, select **GitHub** and click **Next**.
2. Authorize AWS Amplify to access your GitHub account.
3. Select:
   - **Recently updated repository**: `AakarshKashyap/SATUpscale`
   - **Branch**: `feature/web-extension-mvp` (or `main`)
4. Click **Next**.

### Step 3: Configure Build & App Root
1. **Monorepo / Subfolder Detection**:
   - If Amplify asks if this is a monorepo, check **"My app is a monorepo"** and enter the app root as:
     ```text
     frontend
     ```
   - If not prompted, Amplify will automatically detect the root `amplify.yml` and run `cd frontend && npm ci && npm run build`.
2. Click **Next**.

### Step 4: Add Environment Variables
Before clicking deploy, expand **Advanced settings** (or go to **App settings > Environment variables**):

Add the following 5 variables:

| Variable Key | Value |
| :--- | :--- |
| `VITE_AWS_REGION` | `us-east-1` |
| `VITE_COGNITO_USER_POOL_ID` | `us-east-1_X6Xtv869G` |
| `VITE_COGNITO_CLIENT_ID` | `2akj9d7fa1fbnn5p08m017daap` |
| `VITE_COGNITO_DOMAIN` | `satup-setup.auth.us-east-1.amazoncognito.com` |
| `VITE_API_BASE_URL` | `https://0237u8c62a.execute-api.us-east-1.amazonaws.com/prod` |

### Step 5: Save & Deploy
1. Click **Save and deploy**.
2. AWS Amplify will provision a build runner, run `npm ci` and `npm run build`, and deploy your application to a global Amazon CloudFront CDN.
3. You will be provided with an active URL (e.g., `https://feature-web-extension-mvp.<appid>.amplifyapp.com`).

---

## 3. Configure SPA Rewrites & Redirects (Crucial for React Router)

Because SATUpscale uses client-side routing (`/dashboard`, `/enhance`, `/result`, `/history`), direct page refreshes need to be redirected to `index.html`:

1. In the AWS Amplify Console left sidebar, click **Rewrites and redirects**.
2. Click **Edit** and click **Add rule**.
3. Configure the rule:
   - **Source address**: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>`
   - **Target address**: `/index.html`
   - **Type**: `200 (Rewrite)`
4. Click **Save**.

Now refreshing any page like `/enhance` or `/dashboard` will render the React app seamlessly without 404 errors.

---

## 4. Automatic CI/CD
Whenever you push new commits to GitHub (`git push origin feature/web-extension-mvp`), AWS Amplify will automatically detect the push, rebuild your application, and publish the update with zero downtime.
