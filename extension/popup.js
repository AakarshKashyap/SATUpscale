// SATUpscale Companion Popup Script
const PLATFORM_BASE_URL = "http://localhost:5173";

// STATE MACHINE DEFINITION
const STATES = {
  CHECKING: "checkingAuthState",
  GUEST: "guestState",
  READY: "readyState",
  SELECTED: "selectedState",
  UPLOADING: "uploadingState",
  PROCESSING: "processingState",
  COMPLETED: "completedState",
  ERROR: "errorState"
};

// DOM ELEMENTS
const authStatusPill = document.getElementById("authStatusPill");
const authStatusText = document.getElementById("authStatusText");
const headerUserSub = document.getElementById("headerUserSub");
const headerUserName = document.getElementById("headerUserName");

const checkingAuthState = document.getElementById("checkingAuthState");
const guestState = document.getElementById("guestState");
const readyState = document.getElementById("readyState");
const selectedState = document.getElementById("selectedState");
const uploadingState = document.getElementById("uploadingState");
const processingState = document.getElementById("processingState");
const completedState = document.getElementById("completedState");
const errorState = document.getElementById("errorState");

const selectedImagePreview = document.getElementById("selectedImagePreview");
const resultImagePreview = document.getElementById("resultImagePreview");
const detectedGrid = document.getElementById("detectedGrid");
const downloadResultLink = document.getElementById("downloadResultLink");

const errorSubtitle = document.getElementById("errorSubtitle");
const errorDetailMessage = document.getElementById("errorDetailMessage");

// BUTTONS
const signInBtn = document.getElementById("signInBtn");
const selectOnPageBtn = document.getElementById("selectOnPageBtn");
const refreshImagesBtn = document.getElementById("refreshImagesBtn");
const enhanceSelectedBtn = document.getElementById("enhanceSelectedBtn");
const reselectBtn = document.getElementById("reselectBtn");
const openResultBtn = document.getElementById("openResultBtn");
const enhanceAnotherBtn = document.getElementById("enhanceAnotherBtn");
const retryActionBtn = document.getElementById("retryActionBtn");
const openPlatformBtn = document.getElementById("openPlatformBtn");
const footerPlatformLink = document.getElementById("footerPlatformLink");

let currentSelectedUrl = null;
let currentActiveJob = null;
let isAuthenticated = false;

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initListeners();
  verifyAndResolveSession();
  listenStorageChanges();
});

function initListeners() {
  signInBtn.addEventListener("click", () => openPlatformRoute("/login"));
  selectOnPageBtn.addEventListener("click", startPageSelectionMode);
  refreshImagesBtn.addEventListener("click", scanActiveTabImages);
  enhanceSelectedBtn.addEventListener("click", startEnhancementJob);
  reselectBtn.addEventListener("click", clearSelectionAndReturn);
  openResultBtn.addEventListener("click", openResultInPlatform);
  enhanceAnotherBtn.addEventListener("click", clearSelectionAndReturn);
  retryActionBtn.addEventListener("click", startEnhancementJob);
  openPlatformBtn.addEventListener("click", () => openPlatformRoute("/dashboard"));
  footerPlatformLink.addEventListener("click", (e) => {
    e.preventDefault();
    openPlatformRoute("/dashboard");
  });
}

function listenStorageChanges() {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.satup_active_job || changes.selectedImageUrl || changes.satup_token || changes.satup_user) {
      verifyAndResolveSession();
    }
  });
}

// ----------------------------------------------------
// COGNITO AUTHENTICATION VERIFICATION ENGINE
// ----------------------------------------------------
function verifyAndResolveSession() {
  showPanel(STATES.CHECKING);

  // Send verification request to service worker
  chrome.runtime.sendMessage({ action: "VERIFY_AUTH_SESSION" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      // Fallback local storage check
      checkLocalStorageSession();
      return;
    }

    if (response.authenticated) {
      setAuthenticatedHeader(response.user);
      evaluateActiveState();
    } else {
      setGuestHeader();
      showPanel(STATES.GUEST);
    }
  });
}

function checkLocalStorageSession() {
  chrome.storage.local.get(["satup_token", "satup_user"], (data) => {
    if (data.satup_token && data.satup_user) {
      setAuthenticatedHeader(data.satup_user);
      evaluateActiveState();
    } else {
      setGuestHeader();
      showPanel(STATES.GUEST);
    }
  });
}

function setAuthenticatedHeader(user) {
  isAuthenticated = true;
  authStatusPill.className = "auth-pill authenticated";
  authStatusText.textContent = "● Connected";
  
  if (user && (user.name || user.email)) {
    headerUserSub.classList.remove("hidden");
    headerUserName.textContent = user.name || user.email;
  } else {
    headerUserSub.classList.add("hidden");
  }
}

function setGuestHeader() {
  isAuthenticated = false;
  authStatusPill.className = "auth-pill guest";
  authStatusText.textContent = "Disconnected";
  headerUserSub.classList.add("hidden");
}

// ----------------------------------------------------
// ACTIVE PANEL STATE EVALUATOR
// ----------------------------------------------------
function evaluateActiveState() {
  chrome.storage.local.get(["selectedImageUrl", "satup_active_job"], (data) => {
    currentSelectedUrl = data.selectedImageUrl || null;
    currentActiveJob = data.satup_active_job || null;

    // 1. Active Job State Overrides
    if (currentActiveJob) {
      if (currentActiveJob.state === "uploading") {
        showPanel(STATES.UPLOADING);
        return;
      }
      if (currentActiveJob.state === "processing") {
        showPanel(STATES.PROCESSING);
        return;
      }
      if (currentActiveJob.state === "completed") {
        renderCompletedResult(currentActiveJob);
        showPanel(STATES.COMPLETED);
        return;
      }
      if (currentActiveJob.state === "error") {
        renderErrorState(currentActiveJob.error);
        showPanel(STATES.ERROR);
        return;
      }
    }

    // 2. Image Selected State
    if (currentSelectedUrl) {
      renderSelectedPreview(currentSelectedUrl);
      showPanel(STATES.SELECTED);
      return;
    }

    // 3. Authenticated Ready State
    scanActiveTabImages();
    showPanel(STATES.READY);
  });
}

function showPanel(targetStateId) {
  const allPanels = [checkingAuthState, guestState, readyState, selectedState, uploadingState, processingState, completedState, errorState];
  allPanels.forEach((panel) => {
    if (panel.id === targetStateId) {
      panel.classList.remove("hidden");
    } else {
      panel.classList.add("hidden");
    }
  });
}

// ----------------------------------------------------
// IMAGE SELECTION & DETECTION
// ----------------------------------------------------
function renderSelectedPreview(url) {
  selectedImagePreview.innerHTML = `
    <img src="${url}" alt="Selected satellite image" />
  `;
}

function startPageSelectionMode() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "START_SELECTION_MODE" }, () => {
        window.close(); // Close popup so user can click image on page
      });
    }
  });
}

function scanActiveTabImages() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      detectedGrid.innerHTML = `<p class="empty-hint">No active tab</p>`;
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { action: "INSPECT_IMAGES" }, (res) => {
      if (chrome.runtime.lastError || !res?.images || res.images.length === 0) {
        detectedGrid.innerHTML = `<p class="empty-hint">No rasters found on this page</p>`;
        return;
      }

      renderDetectedImages(res.images);
    });
  });
}

function renderDetectedImages(images) {
  detectedGrid.innerHTML = "";
  images.forEach((img) => {
    const thumb = document.createElement("div");
    thumb.className = "detected-thumb";
    thumb.innerHTML = `<img src="${img.url}" alt="${img.alt}" />`;
    thumb.addEventListener("click", () => {
      chrome.storage.local.set({ selectedImageUrl: img.url });
    });
    detectedGrid.appendChild(thumb);
  });
}

// ----------------------------------------------------
// ENHANCEMENT EXECUTION
// ----------------------------------------------------
function startEnhancementJob() {
  if (!currentSelectedUrl) return;

  showPanel(STATES.UPLOADING);

  chrome.runtime.sendMessage({
    action: "EXECUTE_ENHANCEMENT_JOB",
    imageUrl: currentSelectedUrl
  });
}

function clearSelectionAndReturn() {
  chrome.storage.local.remove(["selectedImageUrl", "satup_active_job"], () => {
    showPanel(STATES.READY);
    scanActiveTabImages();
  });
}

// ----------------------------------------------------
// RESULT RENDERING & NAVIGATION
// ----------------------------------------------------
function renderCompletedResult(job) {
  const output = job.outputUrl || job.inputUrl;
  resultImagePreview.innerHTML = `
    <img src="${output}" alt="Enhanced satellite output" />
  `;
  downloadResultLink.href = output;
  downloadResultLink.download = `satup-${job.jobId || "enhanced"}.png`;
}

function openResultInPlatform() {
  const jobId = currentActiveJob?.jobId || "latest";
  const output = currentActiveJob?.outputUrl || currentSelectedUrl;
  const targetUrl = `${PLATFORM_BASE_URL}/result/${jobId}?image=${encodeURIComponent(output)}`;
  openPlatformRoute(targetUrl, true);
}

function renderErrorState(errMessage) {
  errorSubtitle.textContent = "Enhancement pipeline error.";
  errorDetailMessage.textContent = errMessage || "Failed to connect to SATUpscale backend API.";
}

function openPlatformRoute(pathOrUrl, isFullUrl = false) {
  const url = isFullUrl ? pathOrUrl : `${PLATFORM_BASE_URL}${pathOrUrl}`;
  chrome.tabs.create({ url });
}