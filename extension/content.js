// SATUpscale Companion Content Script
(function () {
  let isSelectionMode = false;
  let hoveredElement = null;
  let bannerElement = null;

  // ----------------------------------------------------
  // AUTOMATIC COGNITO AUTH SESSION BRIDGE
  // ----------------------------------------------------
  function syncAuthSession() {
    if (
      !window.location.host.includes("localhost:5173") &&
      !window.location.host.includes("satupscale")
    ) {
      return;
    }

    try {
      let idToken = null;
      let user = null;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (
          key &&
          key.includes("CognitoIdentityServiceProvider") &&
          key.endsWith(".idToken")
        ) {
          idToken = localStorage.getItem(key);
          break;
        }
      }

      if (!idToken) {
        idToken = localStorage.getItem("satup_id_token");
      }

      if (!idToken) {
        return;
      }

      const parts = idToken.split(".");
      if (parts.length !== 3) {
        return;
      }

      const payload = JSON.parse(atob(parts[1]));

      user = {
        name:
          payload.name ||
          payload.email?.split("@")[0] ||
          payload["cognito:username"] ||
          "User",
        email: payload.email || "",
        sub: payload.sub || ""
      };

      chrome.runtime.sendMessage(
        {
          action: "AUTH_SESSION_SYNC",
          token: idToken,
          user
        },
        () => {
          // Handled silently
        }
      );
    } catch {
      // Handled silently
    }
  }

  syncAuthSession();
  setTimeout(syncAuthSession, 1500);

  // ----------------------------------------------------
  // DOM IMAGE INSPECTION ENGINE
  // ----------------------------------------------------
  function findPageImages() {
    const candidateUrls = new Set();
    const imagesList = [];

    // 1. Scan <img> elements
    document.querySelectorAll("img").forEach((img) => {
      const src = img.currentSrc || img.src;
      if (src && isValidImage(img.naturalWidth || img.width, img.naturalHeight || img.height, src)) {
        if (!candidateUrls.has(src)) {
          candidateUrls.add(src);
          imagesList.push({
            url: src,
            width: img.naturalWidth || img.width || 0,
            height: img.naturalHeight || img.height || 0,
            alt: img.alt || "Page Image"
          });
        }
      }
    });

    // 2. Scan elements with background-image CSS
    document.querySelectorAll("*").forEach((el) => {
      const bg = window.getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none" && bg.startsWith("url(")) {
        const cleanUrl = bg.replace(/^url\(['"]?/, "").replace(/['"]?\)$/, "");
        const rect = el.getBoundingClientRect();
        if (cleanUrl && isValidImage(rect.width, rect.height, cleanUrl)) {
          if (!candidateUrls.has(cleanUrl)) {
            candidateUrls.add(cleanUrl);
            imagesList.push({
              url: cleanUrl,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              alt: "Background Image"
            });
          }
        }
      }
    });

    return imagesList.slice(0, 12);
  }

  function isValidImage(width, height, url) {
    if (!url || url.startsWith("data:image/svg") || url.includes("favicon")) return false;
    // Filter out small icons/avatars (minimum 80x80px)
    if (width > 0 && width < 80) return false;
    if (height > 0 && height < 80) return false;
    return true;
  }

  // ----------------------------------------------------
  // INTERACTIVE SELECTION MODE
  // ----------------------------------------------------
  function startSelectionMode() {
    if (isSelectionMode) return;
    isSelectionMode = true;
    document.body.classList.add("satup-selection-mode-active");

    // Create top floating helper banner
    bannerElement = document.createElement("div");
    bannerElement.id = "satup-selection-banner";
    bannerElement.innerHTML = `
      <div class="satup-badge-dot"></div>
      <span>SATUpscale Mode: Click any satellite raster on page to capture (Press ESC to cancel)</span>
    `;
    document.body.appendChild(bannerElement);

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
  }

  function stopSelectionMode() {
    isSelectionMode = false;
    document.body.classList.remove("satup-selection-mode-active");

    if (hoveredElement) {
      hoveredElement.classList.remove("satup-hover-highlight");
      hoveredElement = null;
    }

    if (bannerElement && bannerElement.parentNode) {
      bannerElement.parentNode.removeChild(bannerElement);
      bannerElement = null;
    }

    document.removeEventListener("mouseover", handleMouseOver, true);
    document.removeEventListener("mouseout", handleMouseOut, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKeyDown, true);
  }

  function handleMouseOver(e) {
    if (!isSelectionMode) return;
    const target = e.target;
    if (target.tagName === "IMG" || window.getComputedStyle(target).backgroundImage !== "none") {
      if (hoveredElement) hoveredElement.classList.remove("satup-hover-highlight");
      hoveredElement = target;
      hoveredElement.classList.add("satup-hover-highlight");
    }
  }

  function handleMouseOut(e) {
    if (!isSelectionMode) return;
    if (hoveredElement) {
      hoveredElement.classList.remove("satup-hover-highlight");
      hoveredElement = null;
    }
  }

  function handleClick(e) {
    if (!isSelectionMode) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    let imageUrl = null;

    if (target.tagName === "IMG") {
      imageUrl = target.currentSrc || target.src;
    } else {
      const bg = window.getComputedStyle(target).backgroundImage;
      if (bg && bg !== "none") {
        imageUrl = bg.replace(/^url\(['"]?/, "").replace(/['"]?\)$/, "");
      }
    }

    if (imageUrl) {
      chrome.runtime.sendMessage({
        action: "IMAGE_CAPTURED",
        imageUrl: imageUrl
      });
    }

    stopSelectionMode();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape" && isSelectionMode) {
      stopSelectionMode();
    }
  }

  // ----------------------------------------------------
  // MESSAGING LISTENER
  // ----------------------------------------------------
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "INSPECT_IMAGES") {
      const images = findPageImages();
      sendResponse({ images });
    } else if (message.action === "START_SELECTION_MODE") {
      startSelectionMode();
      sendResponse({ status: "SELECTION_STARTED" });
    } else if (message.action === "CANCEL_SELECTION_MODE") {
      stopSelectionMode();
      sendResponse({ status: "SELECTION_STOPPED" });
    }
    return true;
  });
})();
