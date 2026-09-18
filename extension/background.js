chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "satup-upscale",
    title: "Upscale with SATUP",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "satup-upscale") {
    chrome.storage.local.set({
      selectedImageUrl: info.srcUrl
    });
  }
});