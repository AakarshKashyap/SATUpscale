import { authService } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Converts a File or Blob into a raw base64 string without data prefix.
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const base64Index = result.indexOf(",");
        if (base64Index !== -1) {
          resolve(result.slice(base64Index + 1));
        } else {
          resolve(result);
        }
      } else {
        reject(new Error("Failed to read file as base64 string"));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

async function getAuthenticatedRequest() {
  const user = await authService.getCurrentUser();
  if (!user?.sub) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const token = await authService.getIdToken();
  return { token, userId: user.sub };
}

async function requestWithAuth(url, options, errorLabel) {
  let request = await getAuthenticatedRequest();
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${request.token}`
    }
  });

  // Handle 401 Unauthorized: Attempt token refresh using Cognito IdToken
  if (response.status === 401) {
    try {
      request = {
        ...request,
        token: await authService.getIdToken(true)
      };
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${request.token}`
        }
      });
    } catch {
      await authService.logout();
      window.dispatchEvent(new Event("satup:auth-expired"));
      throw new Error(
        "Your session expired or is unauthorized. Please sign in again."
      );
    }
  }

  // If still 401 after refresh attempt
  if (response.status === 401) {
    await authService.logout();
    window.dispatchEvent(new Event("satup:auth-expired"));
    throw new Error(
      "Your session expired or is unauthorized. Please sign in again."
    );
  }

  // Handle 429 Rate Limit Exceeded
  if (response.status === 429) {
    const errText = await response.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(errText);
      detail = parsed.error || parsed.message || "";
    } catch {
      detail = errText;
    }

    throw new Error(
      detail
        ? `Rate limit exceeded: ${detail}. Maximum 20 upscales per user per hour.`
        : "Rate limit exceeded (maximum 20 upscales per user per hour). Please wait before submitting another image."
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    let message = errText || response.statusText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error || parsed.message) {
        message = parsed.error || parsed.message;
      }
    } catch {
      // Keep raw message
    }
    throw new Error(`${errorLabel} (${response.status}): ${message}`);
  }

  return response;
}

/**
 * Submits an image to the real backend upscale endpoint.
 * Accepts optional scaleFactor (2, 4, 8, 16, 32) or null (auto-select).
 * @param {File|Blob} file
 * @param {number|null} scaleFactor
 * @returns {Promise<{
 *   jobId: string,
 *   originalUrl: string,
 *   outputUrl: string,
 *   processedUrl: string,
 *   status: string,
 *   requestedScale?: number,
 *   actualScale?: number,
 *   scalingChain?: number[],
 *   qualityAssessment?: {
 *     inputQualityScore: number,
 *     blurDetection?: { isBlurry: boolean, score: number },
 *     qualityWarning?: string|null,
 *     blurWarning?: string|null
 *   }
 * }>}
 */
export async function upscaleImage(file, scaleFactor = null) {
  const base64Image = await fileToBase64(file);

  const body = {
    image: base64Image
  };

  // Only send scale factor when the user explicitly selected one.
  // null means backend auto-selection to 2048px cap.
  // Provide both snake_case and camelCase for full API Gateway & Lambda support.
  if (scaleFactor !== null && scaleFactor !== undefined) {
    const numericScale = Number(scaleFactor);
    body.scale_factor = numericScale;
    body.scaleFactor = numericScale;
  }

  const response = await requestWithAuth(
    `${API_BASE_URL}/upscale`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    "Upscale request failed"
  );

  return response.json();
}

/**
 * Fetches enhancement history for the authenticated user.
 * @returns {Promise<{jobs: Array<{jobId: string, processedUrl: string, originalUrl?: string, timestamp: number, status: string}>}>}
 */
export async function getHistory() {
  const response = await requestWithAuth(
    `${API_BASE_URL}/history`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    },
    "Failed to fetch history"
  );

  return response.json();
}

/**
 * Fetches a single enhancement job and its fresh presigned URLs.
 * Presigned URLs expire in 1 hour; this retrieves fresh URLs on demand.
 * @param {string} jobId
 * @returns {Promise<Object>}
 */
export async function getUpscaleJob(jobId) {
  if (!jobId) {
    throw new Error("Job ID is required.");
  }

  const response = await requestWithAuth(
    `${API_BASE_URL}/upscale/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    },
    "Failed to fetch enhancement result"
  );

  return response.json();
}

/**
 * Fetches aggregate enhancement statistics for the authenticated user.
 * @returns {Promise<{
 *   userId: string,
 *   totalImages: number,
 *   totalProcessingTimeMs: number,
 *   averageProcessingTimeMs: number,
 *   averageScaleFactor: number,
 *   averageInputQuality: number
 * }>}
 */
export async function getUserStats() {
  const response = await requestWithAuth(
    `${API_BASE_URL}/stats`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    },
    "Failed to fetch user stats"
  );

  return response.json();
}

/**
 * Generates a synthetic 64x64 satellite tile image File for testing.
 * @param {number} width
 * @param {number} height
 * @param {string} filename
 * @returns {Promise<File>}
 */
export function createSyntheticTestImage(
  width = 64,
  height = 64,
  filename = "satellite-test-64x64.png"
) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Earth background
    ctx.fillStyle = "#243d2c";
    ctx.fillRect(0, 0, width, height);

    // Forest / vegetation
    ctx.fillStyle = "#365c40";
    ctx.fillRect(6, 6, 26, 24);

    // Water reservoir
    ctx.fillStyle = "#1b3c4f";
    ctx.beginPath();
    ctx.arc(46, 44, 12, 0, Math.PI * 2);
    ctx.fill();

    // Urban highway
    ctx.strokeStyle = "#838c88";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.lineTo(64, 36);
    ctx.stroke();

    canvas.toBlob((blob) => {
      const file = new File([blob], filename, { type: "image/png" });
      resolve(file);
    }, "image/png");
  });
}
