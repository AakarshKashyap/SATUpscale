const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://0237u8c62.execute-api.us-east-1.amazonaws.com/prod";

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
        // Strip data:image/...;base64, prefix
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

/**
 * Submits an image to the real backend upscale endpoint.
 * @param {File|Blob} file
 * @param {string} userId
 * @returns {Promise<{jobId: string, outputUrl: string, status: string}>}
 */
export async function upscaleImage(file, userId) {
  const base64Image = await fileToBase64(file);

  const response = await fetch(`${API_BASE_URL}/upscale`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      userId,
      image: base64Image
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Upscale request failed (${response.status}): ${errText || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Fetches enhancement history for a user.
 * @param {string} userId
 * @returns {Promise<{jobs: Array<{jobId: string, processedUrl: string, originalUrl?: string, timestamp: number, status: string}>}>}
 */
export async function getHistory(userId) {
  const response = await fetch(
    `${API_BASE_URL}/history?userId=${encodeURIComponent(userId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch history (${response.status}): ${errText || response.statusText}`
    );
  }

  return response.json();
}
