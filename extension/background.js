// SATUpscale Companion Service Worker (Manifest V3)
const API_BASE_URL = "https://0237u8c62a.execute-api.us-east-1.amazonaws.com/prod";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "satup-enhance-image",
    title: "Enhance with SATUpscale (8x AI)",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "satup-enhance-image" && info.srcUrl) {
    chrome.storage.local.set({
      selectedImageUrl: info.srcUrl,
      satup_active_state: "selected"
    }, () => {
      if (chrome.action && chrome.action.openPopup) {
        chrome.action.openPopup().catch(() => {});
      }
    });
  }
});

// ----------------------------------------------------
// COGNITO WEB-TO-EXTENSION SESSION SYNC ENGINE
// ----------------------------------------------------
async function verifyAndSyncWebSession() {
  try {
    const tabs = await chrome.tabs.query({
      url: [
        "http://localhost:5173/*",
        "http://127.0.0.1:5173/*",
        "https://*.satupscale.com/*"
      ]
    });

    if (tabs && tabs.length > 0) {
      const activeWebTab = tabs[0];
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeWebTab.id },
        func: extractCognitoFromLocalStorage
      });

      if (results && results[0] && results[0].result) {
        const { token, user } = results[0].result;
        if (token && user) {
          const authData = {
            satup_token: token,
            satup_user: user,
            satup_auth_status: "connected",
            satup_last_sync: Date.now()
          };
          await chrome.storage.local.set(authData);
          return { authenticated: true, user, token };
        }
      }
    }
  } catch (err) {
    console.warn("SATUpscale Auth Sync script error:", err);
  }

  // Fallback to cached storage check
  const storageData = await chrome.storage.local.get(["satup_token", "satup_user"]);
  if (storageData.satup_token && storageData.satup_user) {
    const isValid = isJwtTokenValid(storageData.satup_token);
    if (isValid) {
      await chrome.storage.local.set({ satup_auth_status: "connected" });
      return { authenticated: true, user: storageData.satup_user, token: storageData.satup_token };
    }
  }

  // Not authenticated
  await chrome.storage.local.set({ satup_auth_status: "not_connected" });
  await chrome.storage.local.remove(["satup_token", "satup_user"]);
  return { authenticated: false };
}

function extractCognitoFromLocalStorage() {
  let token = null;
  let user = null;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.includes("CognitoIdentityServiceProvider") && key.endsWith(".accessToken")) {
        token = localStorage.getItem(key);
      }
      if (key.includes("CognitoIdentityServiceProvider") && key.endsWith(".idToken")) {
        const idToken = localStorage.getItem(key);
        if (idToken) {
          const parts = idToken.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            user = {
              name: payload.name || payload.email?.split("@")[0] || payload["cognito:username"] || "User",
              email: payload.email || "",
              sub: payload.sub || ""
            };
          }
        }
      }
    }
  } catch (e) {
    console.error("Local storage extraction error", e);
  }

  return { token, user };
}

function isJwtTokenValid(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return false; // Expired
    }
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// RUNTIME MESSAGE HANDLING
// ----------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "VERIFY_AUTH_SESSION") {
    verifyAndSyncWebSession().then((res) => {
      sendResponse(res);
    });
    return true;
  }

  if (message.action === "AUTH_SESSION_SYNC" && message.user) {
    chrome.storage.local.set({
      satup_token: message.token,
      satup_user: message.user,
      satup_auth_status: "connected"
    }, () => {
      sendResponse({ status: "SYNCED" });
    });
    return true;
  }

  if (message.action === "IMAGE_CAPTURED" && message.imageUrl) {
    chrome.storage.local.set({
      selectedImageUrl: message.imageUrl,
      satup_active_state: "selected"
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "EXECUTE_ENHANCEMENT_JOB" && message.imageUrl) {
    executeEnhancementJob(message.imageUrl);
    sendResponse({ status: "JOB_STARTED" });
    return true;
  }
});

async function executeEnhancementJob(imageUrl) {
  await chrome.storage.local.set({
    satup_active_job: {
      state: "uploading",
      inputUrl: imageUrl,
      timestamp: Date.now()
    }
  });

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error("Could not fetch remote image raster.");
    const blob = await res.blob();
    const base64Data = await blobToBase64(blob);

    await chrome.storage.local.set({
      satup_active_job: {
        state: "processing",
        inputUrl: imageUrl,
        timestamp: Date.now()
      }
    });

    const storageData = await chrome.storage.local.get(["satup_token"]);
    const headers = { "Content-Type": "application/json" };
    if (storageData.satup_token) {
      headers["Authorization"] = `Bearer ${storageData.satup_token}`;
    }

    const apiRes = await fetch(`${API_BASE_URL}/upscale`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ image: base64Data })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => "");
      throw new Error(`API Error (${apiRes.status}): ${errText || apiRes.statusText}`);
    }

    const data = await apiRes.json();

    await chrome.storage.local.set({
      satup_active_job: {
        state: "completed",
        inputUrl: imageUrl,
        outputUrl: data.outputUrl || imageUrl,
        jobId: data.jobId || "latest",
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.error("SATUpscale Background Worker Job Error:", err);
    await chrome.storage.local.set({
      satup_active_job: {
        state: "error",
        inputUrl: imageUrl,
        error: err.message || "Failed to process raster with backend API.",
        timestamp: Date.now()
      }
    });
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const base64Index = result.indexOf(",");
        resolve(base64Index !== -1 ? result.slice(base64Index + 1) : result);
      } else {
        reject(new Error("Failed to convert image blob to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}