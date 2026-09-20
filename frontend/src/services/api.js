import { authService } from "./auth";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "";

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
      throw new Error("Your session expired. Please sign in again.");
    }
  }

  if (response.status === 401) {
    await authService.logout();
    window.dispatchEvent(new Event("satup:auth-expired"));
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `${errorLabel} (${response.status}): ${errText || response.statusText}`
    );
  }

  return response;
}

/**
 * Submits an image to the real backend upscale endpoint.
 * @param {File|Blob} file
 * @returns {Promise<{jobId: string, outputUrl: string, status: string}>}
 */
export async function upscaleImage(file) {
  const base64Image = await fileToBase64(file);
  await getAuthenticatedRequest();

  const response = await requestWithAuth(
    `${API_BASE_URL}/upscale`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image: base64Image
      })
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
  const { userId } = await getAuthenticatedRequest();

  const response = await requestWithAuth(
    `${API_BASE_URL}/history?userId=${encodeURIComponent(userId)}`,
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
