"""
satup-setup - ML Inference Pipeline
Loaded once at Lambda cold start, reused on warm invocations.

Pipeline:
  PIL Image (any size, up to 2048)
    -> resize to <=256 (aspect-ratio preserving, only if needed)
    -> EDSR-Baseline 4x  (e.g. 64->256)
    -> EDSR-Baseline 2x  (e.g. 256->512)
    -> post-processing:
         Stage 1: Bilateral filter  (reduces EDSR watercolor artifact)
                  CLAHE             (local adaptive contrast, LAB colorspace)
         Stage 2: Dynamic saturation (histogram-based, avoids forest color bleed)
                  Fixed sharpness   (1.5x)
    -> PIL Image (format-ready for S3 save)

Input size -> Output size examples:
  64x64   -> 512x512   (optimal, fastest)
  128x128 -> 1024x1024
  256x256 -> 2048x2048 (max quality)
  >256    -> resized to 256 first -> 2048x2048
  >2048   -> REJECTED (ValueError)
"""

import os
import logging

import cv2
import numpy as np
import torch
import torchvision.transforms.functional as TF
from PIL import Image, ImageEnhance
from torchsr.models import edsr_baseline

logger = logging.getLogger(__name__)

# -- Paths (absolute, robust inside Lambda /var/task) ----------------------------
_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "edsr")
_PATH_4X   = os.path.join(_MODEL_DIR, "model.pth")
_PATH_2X   = os.path.join(_MODEL_DIR, "model_2x.pth")

# -- Size constants ---------------------------------------------------------------
MAX_INPUT_PX     = 2048   # Hard reject - anything larger returns 400
INFERENCE_CAP_PX = 256    # Resize largest dimension to this before inference
                           # 256 input -> 2048 output (largest safe output)

# -- Global model cache (populated once on cold start) ---------------------------
_model_4x = None
_model_2x = None


# ================================================================================
# Model loading
# ================================================================================

def _load_models():
    """
    Load EDSR models into memory. Called automatically on first inference.
    On warm Lambda invocations the cached globals are returned immediately.
    Cold start adds ~2-3s, subsequent calls are instant.
    """
    global _model_4x, _model_2x

    if _model_4x is not None and _model_2x is not None:
        return _model_4x, _model_2x

    logger.info("Cold start -- loading EDSR models from %s", _MODEL_DIR)

    def _load(model_obj, path):
        """Load state dict. Supports both old and new PyTorch APIs."""
        try:
            # weights_only=True is safer and avoids pickle execution (PyTorch >= 2.0)
            model_obj.load_state_dict(
                torch.load(path, map_location="cpu", weights_only=True)
            )
        except TypeError:
            # Older PyTorch builds do not support weights_only param
            model_obj.load_state_dict(torch.load(path, map_location="cpu"))
        model_obj.eval()
        return model_obj

    _model_4x = _load(edsr_baseline(scale=4, pretrained=False), _PATH_4X)
    _model_2x = _load(edsr_baseline(scale=2, pretrained=False), _PATH_2X)

    logger.info("Models ready. 4x: %s | 2x: %s", _PATH_4X, _PATH_2X)
    return _model_4x, _model_2x


# ================================================================================
# Post-processing Stage 1: CLAHE + Bilateral filter (OpenCV)
# ================================================================================

def _apply_clahe_and_bilateral(img: Image.Image) -> Image.Image:
    """
    Apply bilateral filter + CLAHE to the upscaled image.

    Bilateral filter:
      Edge-preserving smoothing. Directly targets the EDSR "watercolor" artifact
      where flat regions look painted. Smooths textures while keeping hard edges.
      Parameters: d=9 (neighbourhood), sigmaColor=75, sigmaSpace=75.

    CLAHE (Contrast Limited Adaptive Histogram Equalization):
      Applied to the L channel in LAB colorspace so color is untouched.
      Boosts local contrast region by region (roads, field borders, building edges)
      without blowing out already-bright areas. Better than global contrast boost.
      Parameters: clipLimit=2.0, tileGridSize=8x8.
    """
    # PIL RGB -> OpenCV BGR
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    # Stage 1a: Bilateral filter - reduce watercolor artifact
    img_bilateral = cv2.bilateralFilter(img_cv, d=9, sigmaColor=75, sigmaSpace=75)

    # Stage 1b: CLAHE on L channel (LAB) - local adaptive contrast
    img_lab = cv2.cvtColor(img_bilateral, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(img_lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l_ch)
    img_lab_enhanced = cv2.merge([l_enhanced, a_ch, b_ch])
    img_enhanced = cv2.cvtColor(img_lab_enhanced, cv2.COLOR_LAB2BGR)

    # OpenCV BGR -> PIL RGB
    return Image.fromarray(cv2.cvtColor(img_enhanced, cv2.COLOR_BGR2RGB))


# ================================================================================
# Post-processing Stage 2: Dynamic saturation + sharpness (PIL)
# ================================================================================

def _compute_color_params(img: Image.Image):
    """
    Compute saturation and sharpness values from image histogram.
    Contrast is intentionally excluded - CLAHE handles it better.

    Saturation - driven by mean HSV saturation:
      Low sat  (<0.15) -> 1.35x  Urban/desert/barren needs more colour
      High sat (>0.45) -> 1.10x  Forest/vegetation, avoids colour bleed
      Default          -> 1.25x  Tested safe value

    Sharpness - fixed at 1.5x (well tested, not image-dependent)

    All values hard-clamped so extreme histograms cannot produce unsafe output.
    """
    arr = np.array(img, dtype=np.float32)  # (H, W, 3), range 0-255

    # Compute per-pixel HSV saturation from RGB
    r = arr[:, :, 0] / 255.0
    g = arr[:, :, 1] / 255.0
    b = arr[:, :, 2] / 255.0
    max_c    = np.maximum(np.maximum(r, g), b)
    min_c    = np.minimum(np.minimum(r, g), b)
    sat      = np.where(max_c > 0, (max_c - min_c) / max_c, 0.0)
    mean_sat = float(sat.mean())

    if mean_sat < 0.15:
        color = 1.35   # Urban/desert/barren - needs saturation
    elif mean_sat > 0.45:
        color = 1.10   # Dense forest/vegetation - avoid colour bleed
    else:
        color = 1.25   # Tested default

    color     = float(np.clip(color, 1.0, 1.40))
    sharpness = 1.5   # Fixed

    return color, sharpness


# ================================================================================
# Public API
# ================================================================================

def upscale_image(pil_image: Image.Image):
    """
    Run the full 8x upscale pipeline on a PIL Image.

    Args:
        pil_image: Input image (any PIL mode; converted to RGB internally).

    Returns:
        (result_image, metadata)
        - result_image: upscaled PIL Image (RGB), ready to save in any format
        - metadata: dict with inputSize, inferenceSize, outputSize,
                    color, sharpness values used, postProcessing info

    Raises:
        ValueError   - if image exceeds MAX_INPUT_PX on any side
        RuntimeError - if inference fails unexpectedly
    """
    # Normalise to RGB
    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")

    orig_w, orig_h = pil_image.size

    # Hard size limit - reject rather than silently degrade
    if orig_w > MAX_INPUT_PX or orig_h > MAX_INPUT_PX:
        raise ValueError(
            f"Image too large ({orig_w}x{orig_h}). "
            f"Maximum allowed: {MAX_INPUT_PX}x{MAX_INPUT_PX}. "
            "Please crop or resize before uploading."
        )

    # Resize for inference (aspect-ratio preserving)
    # Recommended: 64x64 input  -> 512x512  output (fastest, best quality per pixel)
    # Supported:   up to 256x256 -> 2048x2048 output
    # Larger inputs: scaled so longest side = INFERENCE_CAP_PX
    if orig_w > INFERENCE_CAP_PX or orig_h > INFERENCE_CAP_PX:
        scale = INFERENCE_CAP_PX / max(orig_w, orig_h)
        new_w = max(1, int(orig_w * scale))
        new_h = max(1, int(orig_h * scale))
        logger.info("Resizing %dx%d -> %dx%d for inference", orig_w, orig_h, new_w, new_h)
        pil_image = pil_image.resize((new_w, new_h), Image.LANCZOS)

    inf_w, inf_h = pil_image.size

    # -- EDSR inference: 4x then 2x = 8x total -----------------------------------
    model_4x, model_2x = _load_models()

    tensor_in = TF.to_tensor(pil_image).unsqueeze(0)   # [1, 3, H, W], float32

    with torch.no_grad():
        tensor_4x = model_4x(tensor_in)    # [1, 3, H*4, W*4]
        tensor_8x = model_2x(tensor_4x)    # [1, 3, H*8, W*8]

    result = TF.to_pil_image(tensor_8x.squeeze(0).clamp(0, 1))
    out_w, out_h = result.size

    # -- Post-processing Stage 1: CLAHE + Bilateral (OpenCV) ---------------------
    # Fixes watercolor artifact + gives adaptive local contrast
    result = _apply_clahe_and_bilateral(result)

    # -- Post-processing Stage 2: Dynamic saturation + sharpness (PIL) -----------
    color_val, sharpness_val = _compute_color_params(result)
    result = ImageEnhance.Color(result).enhance(color_val)
    result = ImageEnhance.Sharpness(result).enhance(sharpness_val)

    metadata = {
        "inputSize":      f"{orig_w}x{orig_h}",
        "inferenceSize":  f"{inf_w}x{inf_h}",
        "outputSize":     f"{out_w}x{out_h}",
        "color":          round(color_val, 3),
        "sharpness":      sharpness_val,
        "postProcessing": "bilateral+clahe+color+sharpness",
    }

    logger.info(
        "Upscale complete -- %s -> %s (color=%.2f sharpness=%.1f pp=%s)",
        metadata["inputSize"], metadata["outputSize"],
        color_val, sharpness_val, metadata["postProcessing"],
    )

    return result, metadata
