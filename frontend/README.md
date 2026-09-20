# SATUpscale — Web Application Frontend

A modern, responsive geospatial intelligence and satellite image super-resolution web application built with **React 19**, **Vite**, **Three.js**, and **AWS Amplify**.

---

## Features

- **Interactive 3D Earth Globe**: Rendered via Three.js with realistic atmospheric glow, particle fields, and coordinate markers.
- **Dynamic Satellite Super-Resolution**: Direct upload interface with user-selectable scaling factors (`2x`, `4x`, `8x`, `16x`, `32x`, or auto-cap at 2048px).
- **Interactive Before / After Comparison**: Interactive split slider to compare low-resolution inputs directly against EDSR-enhanced outputs.
- **Quality & Hallucination Feedback**: Real-time display of Laplacian blur score, input quality score (0–100), and hallucination guardrail indicators.
- **Secure Multi-Tenant Auth**: Seamless integration with AWS Cognito User Pools using AWS Amplify v6, strictly sending Cognito `IdToken`s to protected API routes.
- **Extension Synchronization**: Caches active `IdToken` in storage (`satup_id_token`) to allow the companion Chrome Extension to authenticate without separate logins.
- **User Dashboard & Analytics**: Visual aggregate metrics (total processed tiles, average resolution increase, runtime processing latency, and history logs).

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) |
| **3D & Graphics** | [Three.js](https://threejs.org/) |
| **Animations** | [GSAP](https://greensock.com/gsap/) + [Lenis](https://lenis.darkroom.engineering/) Smooth Scroll |
| **Mapping** | [Leaflet](https://leafletjs.com/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Authentication** | [AWS Amplify (v6)](https://docs.amplify.aws/) |
| **Routing** | [React Router DOM (v7)](https://reactrouter.com/) |

---

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.x, v20.x, or later)
- [npm](https://www.npmjs.com/) (v9.x or later)

### 2. Environment Configuration
Copy `.env.example` to create your local `.env` file:

```bash
cp .env.example .env
```

Populate `.env` with your AWS and API Gateway endpoints:

```ini
# AWS Region
VITE_AWS_REGION=us-east-1

# Cognito Authentication
VITE_COGNITO_USER_POOL_ID=your_cognito_user_pool_id
VITE_COGNITO_CLIENT_ID=your_cognito_client_id
VITE_COGNITO_DOMAIN=your_cognito_domain.amazoncognito.com

# Backend API Gateway Endpoint
VITE_API_BASE_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
VITE_APP_URL=http://localhost:5173
```

> [!NOTE]
> `.env` is gitignored to protect sensitive stage identifiers and local tokens. Always commit template changes to `.env.example`.

### 3. Installation
Install all project dependencies:

```bash
npm install
```

### 4. Development Server
Start the local Vite development server:

```bash
npm run dev
```

Navigate to `http://localhost:5173` in your browser.

### 5. Production Build
Generate optimized static assets for deployment:

```bash
npm run build
```

The output bundle will be generated in `dist/`, ready for hosting on **AWS S3 + CloudFront**, **Vercel**, or **AWS Amplify Hosting**.

To preview the production build locally:

```bash
npm run preview
```

---

## Automated Verification Suite

To verify that all frontend integration requirements and security criteria are met:

```bash
node test-checklist.js
```

This verifies:
1. Strict use of Cognito `IdToken` (never AccessToken).
2. Token persistence in `localStorage` and `sessionStorage`.
3. Standardized `Authorization: Bearer <IdToken>` headers.
4. Scale factor payload construction (`2x`, `4x`, `8x`, `16x`, `32x`, `auto`).
5. Quality assessment metric normalization.
6. Rate limit (`429`) and authentication failure (`401`) handling.
7. Fresh presigned S3 URL resolution with 1-hour expiration.

---

## Directory Structure

```text
frontend/
├── public/                     # Static assets (3D Earth models, images)
├── src/
│   ├── assets/                 # SVGs and component-level imagery
│   ├── components/
│   │   ├── globe/              # Three.js 3D Earth & particle field
│   │   ├── navigation/         # Navbars, custom cursors, theme toggles
│   │   ├── BeforeAfterSlider   # Split-pane interactive comparison
│   │   ├── ProtectedRoute      # Authenticated route wrapper
│   │   └── TileReveal          # Animated transition components
│   ├── context/
│   │   └── AuthContext.jsx     # Global authentication state
│   ├── hooks/
│   │   ├── useLenis.js         # Smooth scrolling lifecycle
│   │   └── useTheme.js         # Dark/Light theme switching
│   ├── pages/
│   │   ├── LandingPage.jsx     # Product overview and 3D hero showcase
│   │   ├── LoginPage.jsx       # User authentication
│   │   ├── SignupPage.jsx      # Account creation & verification
│   │   ├── DashboardPage.jsx   # Usage analytics & quick actions
│   │   ├── EnhancePage.jsx     # Upload dropzone & scaling selector
│   │   ├── ResultPage.jsx      # Split-screen comparison & export
│   │   ├── HistoryPage.jsx     # Past enhancement catalog
│   │   └── SettingsPage.jsx    # User profile & credentials
│   ├── services/
│   │   ├── api.js              # REST client for backend endpoints
│   │   └── auth.js             # Amplify Cognito service wrapper
│   ├── App.css                 # Core design system and glassmorphic UI
│   ├── App.jsx                 # Application routing tree
│   └── main.jsx                # Application root mount
├── test-checklist.js           # Automated verification test suite
├── vite.config.js              # Vite bundler configuration
└── package.json                # Project dependencies and build scripts
```
