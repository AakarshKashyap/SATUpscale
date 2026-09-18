const readyState = document.getElementById("readyState");
const processingState = document.getElementById("processingState");
const completeState = document.getElementById("completeState");

const imagePreview = document.getElementById("imagePreview");
const resultPreview = document.getElementById("resultPreview");

const upscaleBtn = document.getElementById("upscaleBtn");
const openWebsiteBtn = document.getElementById("openWebsiteBtn");
const newImageBtn = document.getElementById("newImageBtn");

let selectedImageUrl = null;


// ------------------------------------
// SHOW SELECTED IMAGE
// ------------------------------------

chrome.storage.local.get(["selectedImageUrl"], (result) => {

  selectedImageUrl = result.selectedImageUrl;

  if (!selectedImageUrl) {
    imagePreview.innerHTML = `
      <span>✦</span>
      <p>No image selected</p>
    `;

    return;
  }

  imagePreview.innerHTML = `
    <img
      src="${selectedImageUrl}"
      alt="Selected satellite image"
      style="width:100%; height:100%; object-fit:cover;"
    />
  `;
});


// ------------------------------------
// START PROCESSING
// ------------------------------------

upscaleBtn.addEventListener("click", () => {

  if (!selectedImageUrl) {
    alert("Please select an image first.");
    return;
  }

  readyState.classList.add("hidden");
  processingState.classList.remove("hidden");

  // Simulate AI processing
  setTimeout(() => {

    processingState.classList.add("hidden");
    completeState.classList.remove("hidden");

    resultPreview.innerHTML = `
      <img
        src="${selectedImageUrl}"
        alt="Enhanced satellite image"
        style="
          width:100%;
          height:100%;
          object-fit:cover;
          filter:saturate(1.25) contrast(1.15);
        "
      />
    `;

  }, 2500);

});


// ------------------------------------
// OPEN WEBSITE
// ------------------------------------

openWebsiteBtn.addEventListener("click", () => {

  if (!selectedImageUrl) return;

  const websiteUrl =
    "http://localhost:5173/result?image=" +
    encodeURIComponent(selectedImageUrl);

  chrome.tabs.create({
    url: websiteUrl
  });

});


// ------------------------------------
// PROCESS ANOTHER IMAGE
// ------------------------------------

newImageBtn.addEventListener("click", () => {

  completeState.classList.add("hidden");
  readyState.classList.remove("hidden");

});