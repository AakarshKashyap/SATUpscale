"""
satup-setup - ML Inference Pipeline with Dynamic Scaling to 2048px
Loaded once at Lambda cold start, reused on warm invocations.

Enhanced Pipeline:
  PIL Image (any size, up to 2048)
    -> Quality Assessment:
         - Blur detection (Laplacian variance)
         - Input quality score (0-100)
         - Optimal scale factor recommendation (2-32x via EDSR chaining)
    -> resize to <=256 (aspect-ratio preserving, only if needed)
    -> EDSR inference (dynamic chaining of 2x and 4x models)
         - 2x:   Single 2x upscale
         - 4x:   Single 4x upscale
         - 8x:   4x → 2x chain
         - 16x:  4x → 4x chain
         - 32x:  4x → 4x → 2x chain (max, only for small inputs)
    -> post-processing (adaptive based on scale factor and output size):
         Stage 1: Bilateral filter  (reduces EDSR watercolor artifact)
                  CLAHE             (local adaptive contrast, LAB colorspace)
         Stage 2: Dynamic saturation (histogram-based)
                  Adaptive sharpness (stronger for larger scales)
    -> PIL Image (format-ready for S3 save)

Scaling Examples (to 2048px cap):
  64x64   → 2x-32x   (optimal: 32x to reach 2048)
  128x128 → 2x-16x   (optimal: 16x to reach 2048)
  256x256 → 2x-8x    (optimal: 8x to reach 2048)
  512x512 → 2x-4x    (optimal: 4x to reach 2048)
  1024x1024 → 2x     (optimal: 2x to reach 2048)
  2048x2048 → 1x     (already at cap)

Lambda Timeout Safety:
  - Timing budget: ~12s max for full pipeline (14s Lambda timeout buffer)
  - Quality checks include inference time estimates
  - Fallback to lower scale if projected time > budget
"""

import os
import logging
import time
from typing import Tuple, Dict, List

# pyrefly: ignore [missing-import]
import cv2
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
import torch
# pyrefly: ignore [missing-import]
import torchvision.transforms.functional as TF
# pyrefly: ignore [missing-import]
from PIL import Image, ImageEnhance
# pyrefly: ignore [missing-import]
from torchsr.models import edsr_baseline

logger = logging.getLogger(__name__)

# -- Paths (absolute, robust inside Lambda /var/task) ----------------------------
_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "edsr")
_PATH_4X   = os.path.join(_MODEL_DIR, "model.pth")
_PATH_2X   = os.path.join(_MODEL_DIR, "model_2x.pth")

# -- Size constants ---------------------------------------------------------------
MAX_OUTPUT_PX    = 2048   # Hard cap - all outputs capped here
MAX_INPUT_PX     = 2048   # Hard reject - anything larger returns 400
INFERENCE_CAP_PX = 256    # Resize largest dimension to this before inference

# -- Lambda timeout safety (milliseconds) -----------------------------------------
LAMBDA_TIMEOUT_MS = 14000  # Buffer before 15s Lambda timeout
INFERENCE_TIME_BUDGET_MS = 12000  # Max total pipeline time

# -- EDSR output quality gate -----------------------------------------------------
# Two-signal hallucination detector:
#   1. Round-trip SSIM: downsample EDSR output back to input size, compare vs original.
#      Hallucinations introduce features not in the input → low round-trip SSIM.
#   2. HF artifact ratio: measure how much high-frequency energy EDSR added vs Lanczos.
#      Hallucinations inject extreme HF patterns not present in clean upscales.
# Failing EITHER signal triggers Lanczos fallback.
EDSR_ROUNDTRIP_SSIM_THRESHOLD = 0.60  # Below → hallucinating
EDSR_HF_RATIO_THRESHOLD       = 4.0   # Above → excessive HF artifacts (hallucination)

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
            model_obj.load_state_dict(
                torch.load(path, map_location="cpu", weights_only=True)
            )
        except TypeError:
            model_obj.load_state_dict(torch.load(path, map_location="cpu"))
        model_obj.eval()
        return model_obj

    _model_4x = _load(edsr_baseline(scale=4, pretrained=False), _PATH_4X)
    _model_2x = _load(edsr_baseline(scale=2, pretrained=False), _PATH_2X)

    logger.info("Models ready. 4x: %s | 2x: %s", _PATH_4X, _PATH_2X)
    return _model_4x, _model_2x


# ================================================================================
# EDSR output quality gate
# ================================================================================

def _compute_ssim(img_a: np.ndarray, img_b: np.ndarray) -> float:
    """
    Compute mean Structural Similarity Index (SSIM) between two same-size
    uint8 RGB arrays. Returns a value in [-1, 1]; 1.0 = identical.
    Uses a simple luminance-only SSIM for speed.
    """
    gray_a = cv2.cvtColor(img_a, cv2.COLOR_RGB2GRAY).astype(np.float32)
    gray_b = cv2.cvtColor(img_b, cv2.COLOR_RGB2GRAY).astype(np.float32)

    C1, C2 = 6.5025, 58.5225  # (0.01*255)^2, (0.03*255)^2
    mu_a = cv2.GaussianBlur(gray_a, (11, 11), 1.5)
    mu_b = cv2.GaussianBlur(gray_b, (11, 11), 1.5)
    mu_a2, mu_b2, mu_ab = mu_a ** 2, mu_b ** 2, mu_a * mu_b

    sig_a2 = cv2.GaussianBlur(gray_a ** 2, (11, 11), 1.5) - mu_a2
    sig_b2 = cv2.GaussianBlur(gray_b ** 2, (11, 11), 1.5) - mu_b2
    sig_ab = cv2.GaussianBlur(gray_a * gray_b, (11, 11), 1.5) - mu_ab

    num = (2 * mu_ab + C1) * (2 * sig_ab + C2)
    den = (mu_a2 + mu_b2 + C1) * (sig_a2 + sig_b2 + C2)
    ssim_map = np.where(den > 0, num / den, 1.0)
    return float(ssim_map.mean())


def _is_edsr_output_valid(
    edsr_result: Image.Image,
    orig_input: Image.Image,
    lanczos_reference: Image.Image,
) -> Tuple[bool, float]:
    """
    Two-signal hallucination detector.

    Signal 1 — Round-trip SSIM:
        Downsample the EDSR output back to the original input dimensions and
        compare SSIM with the original image. A good upscale is content-preserving;
        a hallucinated one introduces features that weren't in the input, so the
        round-trip will look nothing like the original.

    Signal 2 — HF artifact ratio:
        Measure the Laplacian (high-frequency) energy in the EDSR output vs the
        Lanczos reference at the same size. Hallucinations inject extreme ring/spiral
        patterns with far more HF content than any clean upscale would produce.

    Returns:
        (is_valid, round_trip_ssim)
    """
    try:
        orig_w, orig_h = orig_input.size
        target_size    = edsr_result.size

        # --- Signal 1: Round-trip SSIM -------------------------------------------
        roundtrip = edsr_result.resize((orig_w, orig_h), Image.LANCZOS)
        orig_arr  = np.array(orig_input.convert("RGB"))
        rt_arr    = np.array(roundtrip.convert("RGB"))
        rt_ssim   = _compute_ssim(orig_arr, rt_arr)

        # --- Signal 2: HF artifact ratio -----------------------------------------
        edsr_arr = np.array(edsr_result.convert("RGB"))
        lz_arr   = np.array(lanczos_reference.resize(target_size, Image.LANCZOS).convert("RGB"))

        edsr_gray = cv2.cvtColor(edsr_arr, cv2.COLOR_RGB2GRAY).astype(np.float32)
        lz_gray   = cv2.cvtColor(lz_arr,   cv2.COLOR_RGB2GRAY).astype(np.float32)

        edsr_hf   = float(np.var(cv2.Laplacian(edsr_gray, cv2.CV_64F)))
        lz_hf     = float(np.var(cv2.Laplacian(lz_gray,   cv2.CV_64F)))
        hf_ratio  = edsr_hf / (lz_hf + 1e-6)  # avoid divide-by-zero

        # --- Decision ------------------------------------------------------------
        rt_ok  = rt_ssim  >= EDSR_ROUNDTRIP_SSIM_THRESHOLD
        hf_ok  = hf_ratio <= EDSR_HF_RATIO_THRESHOLD
        is_valid = rt_ok and hf_ok

        logger.info(
            "EDSR quality gate: round_trip_ssim=%.3f (threshold=%.2f, ok=%s) | "
            "hf_ratio=%.2f (threshold=%.1f, ok=%s) | valid=%s",
            rt_ssim,  EDSR_ROUNDTRIP_SSIM_THRESHOLD,  rt_ok,
            hf_ratio, EDSR_HF_RATIO_THRESHOLD,         hf_ok,
            is_valid,
        )
        return is_valid, rt_ssim

    except Exception as exc:
        logger.warning("EDSR quality gate failed (%s); treating output as valid", exc)
        return True, 1.0


# ================================================================================
# Dynamic Scale Factor Calculation
# ================================================================================

def _decompose_scale_factor(scale_factor: int) -> List[int]:
    """
    Decompose a scale factor into EDSR model operations (2x or 4x).
    EDSR models can only do 2x or 4x, so we chain them to achieve larger scales.
    
    Args:
        scale_factor: Target scale (2, 4, 8, 16, 32)
    
    Returns:
        List of scale factors to apply in sequence
        e.g., 8 -> [4, 2], 16 -> [4, 4], 32 -> [4, 4, 2]
    """
    if scale_factor == 2:
        return [2]
    elif scale_factor == 4:
        return [4]
    elif scale_factor == 8:
        return [4, 2]
    elif scale_factor == 16:
        return [4, 4]
    elif scale_factor == 32:
        return [4, 4, 2]
    else:
        # Fallback: compose from 4x and 2x
        result = []
        remaining = scale_factor
        while remaining >= 4:
            result.append(4)
            remaining = remaining // 4
        if remaining == 3:
            result.append(4)
            result.append(2)  # 4*2=8, but we wanted 3, so: 8x upscaled then down - not ideal
        elif remaining == 2:
            result.append(2)
        return result


def _calculate_optimal_scale_factor(
    input_width: int, 
    input_height: int,
    input_quality: float,
    fallback_to_lower: bool = True
) -> Tuple[int, str]:
    """
    Calculate the optimal scale factor to reach 2048px cap.
    Takes into account input quality and Lambda timeout constraints.
    
    Args:
        input_width: Input image width
        input_height: Input image height
        input_quality: Quality score (0-100)
        fallback_to_lower: If optimal scale would timeout, try lower scales
    
    Returns:
        (scale_factor, reason_string)
    """
    max_input_dim = max(input_width, input_height)
    
    # Edge case: already at or exceeds cap
    if max_input_dim >= MAX_OUTPUT_PX:
        return 1, "Image already at or exceeds 2048px cap"
    
    # Calculate max possible scale to reach 2048
    max_possible_scale = MAX_OUTPUT_PX / max_input_dim
    
    # Supported scales (in order of quality, best to worst)
    supported_scales = []
    for scale in [32, 16, 8, 4, 2]:
        if scale <= max_possible_scale:
            supported_scales.append(scale)
    
    if not supported_scales:
        return 2, "Image too large; minimum 2x will be used"
    
    # Quality-based filtering
    if input_quality < 30:
        # Very low quality - don't upscale aggressively
        feasible_scales = [s for s in supported_scales if s <= 4]
        if not feasible_scales:
            feasible_scales = [2]
        reason = "Low input quality; limiting to lower scale factors"
    elif input_quality < 50:
        # Mediocre quality - moderate upscaling
        feasible_scales = [s for s in supported_scales if s <= 8]
        if not feasible_scales:
            feasible_scales = [2]
        reason = "Mediocre input quality; recommending moderate scaling"
    else:
        # Good quality - can use higher scales
        feasible_scales = supported_scales
        reason = "Input quality is good; using optimal scaling"
    
    # Pick the highest scale from feasible options
    optimal_scale = feasible_scales[0]  # List is sorted descending due to construction
    
    return optimal_scale, reason


def _estimate_inference_time_ms(
    input_width: int,
    input_height: int,
    scale_factors: List[int]
) -> float:
    """
    Estimate total inference time for a chain of EDSR models.
    Used to avoid Lambda timeout.
    
    Empirical estimates (on Lambda with GPU/fast CPU):
    - 64x64 → 2x: ~400ms
    - 64x64 → 4x: ~800ms
    - 256x256 → 2x: ~600ms
    - 256x256 → 4x: ~1500ms
    
    Args:
        input_width, input_height: Input dimensions
        scale_factors: List of scales to apply [4, 2] etc
    
    Returns:
        Estimated time in milliseconds
    """
    # Effective input size after resize-to-256 cap
    max_dim = max(input_width, input_height)
    if max_dim > INFERENCE_CAP_PX:
        scale_to_cap = INFERENCE_CAP_PX / max_dim
        effective_w = int(input_width * scale_to_cap)
        effective_h = int(input_height * scale_to_cap)
    else:
        effective_w, effective_h = input_width, input_height
    
    # Base time for one inference pass
    base_ms = 400  # Minimum inference time
    
    # Add time per model in chain
    total_time = base_ms
    current_w, current_h = effective_w, effective_h
    
    for scale in scale_factors:
        # Rough estimate: 2x scales faster than 4x
        if scale == 2:
            model_time = 500
        else:  # 4x
            model_time = 1000
        
        # Larger tensors take longer
        tensor_pixels = current_w * current_h
        if tensor_pixels > 100_000:
            model_time *= 1.3
        
        total_time += model_time
        current_w *= scale
        current_h *= scale
    
    # Add post-processing overhead (~500ms for bilateral+CLAHE+color+sharpness)
    total_time += 800
    
    return total_time


# ================================================================================
# Quality Assessment
# ================================================================================

def _detect_blur(pil_image: Image.Image) -> Tuple[bool, float]:
    """
    Detect if image is blurry using Laplacian variance method.
    
    Sharp images have higher variance (more high-frequency content).
    Blurry images have low variance (smooth, no details).
    
    Returns:
        (is_blurry: bool, blur_score: float)
    """
    try:
        gray = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        is_blurry = laplacian_var < 100
        
        logger.info(f"Blur detection: score={laplacian_var:.2f}, is_blurry={is_blurry}")
        return is_blurry, float(laplacian_var)
    except Exception as e:
        logger.warning(f"Blur detection failed: {e}")
        return False, 0.0


def _estimate_input_quality(pil_image: Image.Image) -> float:
    """
    Estimate input image quality score (0-100).
    """
    try:
        arr = np.array(pil_image, dtype=np.float32)
        gray = cv2.cvtColor(arr.astype(np.uint8), cv2.COLOR_RGB2GRAY)
        
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        blur_score = min(100, (laplacian_var / 500) * 100)
        
        edges = cv2.Sobel(gray, cv2.CV_64F, 1, 1, ksize=3)
        edge_std = np.std(edges)
        noise_score = min(100, (edge_std / 50) * 100)
        
        px = pil_image.size[0] * pil_image.size[1]
        res_score = min(100, (px / 1_000_000) * 100)
        
        quality = (blur_score * 0.45 + noise_score * 0.30 + res_score * 0.25)
        quality = float(np.clip(quality, 0, 100))
        
        logger.info(f"Quality assessment: {quality:.1f}")
        return quality
    except Exception as e:
        logger.warning(f"Quality estimation failed: {e}")
        return 50.0


# ================================================================================
# Post-processing Stage 1: CLAHE + Bilateral filter (OpenCV)
# ================================================================================

def _apply_clahe_and_bilateral(
    img: Image.Image,
    scale_factor: int
) -> Image.Image:
    """
    Apply bilateral filter + CLAHE to the upscaled image.
    Parameters adapt based on scale factor to avoid over-processing small upscales.
    
    Args:
        img: Upscaled PIL image
        scale_factor: Total scale factor applied (2, 4, 8, 16, 32)
    """
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    # Bilateral filter - adaptive radius based on scale
    # Larger scales can handle stronger filtering
    if scale_factor <= 2:
        bilateral_d = 5
    elif scale_factor <= 4:
        bilateral_d = 7
    else:
        bilateral_d = 9
    
    img_bilateral = cv2.bilateralFilter(
        img_cv,
        d=bilateral_d,
        sigmaColor=75,
        sigmaSpace=75
    )

    # CLAHE on L channel (LAB)
    img_lab = cv2.cvtColor(img_bilateral, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(img_lab)
    
    # Adaptive CLAHE parameters
    if scale_factor <= 2:
        clip_limit = 1.5
        tile_size = 6
    elif scale_factor <= 4:
        clip_limit = 2.0
        tile_size = 8
    else:
        clip_limit = 2.5
        tile_size = 10
    
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_size, tile_size))
    l_enhanced = clahe.apply(l_ch)
    img_lab_enhanced = cv2.merge([l_enhanced, a_ch, b_ch])
    img_enhanced = cv2.cvtColor(img_lab_enhanced, cv2.COLOR_LAB2BGR)

    return Image.fromarray(cv2.cvtColor(img_enhanced, cv2.COLOR_BGR2RGB))


# ================================================================================
# Post-processing Stage 2: Dynamic saturation + adaptive sharpness (PIL)
# ================================================================================

def _compute_color_params(img: Image.Image, scale_factor: int) -> Tuple[float, float]:
    """
    Compute saturation and sharpness values, adaptive to scale factor.
    Larger scales benefit from stronger sharpening.
    
    Args:
        img: Upscaled PIL image
        scale_factor: Total scale factor
    
    Returns:
        (saturation_multiplier, sharpness_multiplier)
    """
    arr = np.array(img, dtype=np.float32)

    # Saturation from HSV
    r = arr[:, :, 0] / 255.0
    g = arr[:, :, 1] / 255.0
    b = arr[:, :, 2] / 255.0
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    sat = np.where(max_c > 0, (max_c - min_c) / max_c, 0.0)
    mean_sat = float(sat.mean())

    # Saturation - same logic as before
    if mean_sat < 0.15:
        color = 1.35
    elif mean_sat > 0.45:
        color = 1.10
    else:
        color = 1.25
    color = float(np.clip(color, 1.0, 1.40))

    # Sharpness - adaptive to scale
    # Smaller scales (2-4x) need less sharpening
    # Larger scales (8-32x) benefit from stronger sharpening
    if scale_factor <= 2:
        sharpness = 1.2
    elif scale_factor <= 4:
        sharpness = 1.4
    elif scale_factor <= 8:
        sharpness = 1.6
    else:  # 16x, 32x
        sharpness = 1.8

    return color, sharpness


# ================================================================================
# Public API
# ================================================================================

def upscale_image(pil_image: Image.Image, scale_factor: int = None):
    """
    Run the upscale pipeline on a PIL Image with dynamic scaling to 2048px cap.

    Args:
        pil_image: Input image (any PIL mode; converted to RGB internally).
        scale_factor: Requested upscaling factor. If None, calculates optimal.
                     Supported: 2, 4, 8, 16, 32 (or auto-calculated).

    Returns:
        (result_image, metadata)
        - result_image: upscaled PIL Image (RGB), ready to save in any format
        - metadata: dict with quality scores, timing, recommendations

    Raises:
        ValueError   - if image exceeds MAX_INPUT_PX or invalid scale_factor
        RuntimeError - if inference fails unexpectedly
    """
    t_start = time.time()
    
    # Normalize to RGB
    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")

    orig_w, orig_h = pil_image.size

    # Hard size limit
    if orig_w > MAX_INPUT_PX or orig_h > MAX_INPUT_PX:
        raise ValueError(
            f"Image too large ({orig_w}x{orig_h}). "
            f"Maximum allowed: {MAX_INPUT_PX}x{MAX_INPUT_PX}. "
            "Please crop or resize before uploading."
        )

    # ================================================================================
    # Quality Assessment
    # ================================================================================
    is_blurry, blur_score = _detect_blur(pil_image)
    input_quality = _estimate_input_quality(pil_image)
    
    t_quality = time.time()
    quality_time = (t_quality - t_start) * 1000

    # ================================================================================
    # Calculate Optimal Scale Factor
    # ================================================================================
    if scale_factor is None:
        scale_factor, reason = _calculate_optimal_scale_factor(
            orig_w, orig_h, input_quality
        )
    else:
        # Validate requested scale
        if scale_factor not in [2, 4, 8, 16, 32]:
            raise ValueError(f"scale_factor must be in [2, 4, 8, 16, 32]. Got {scale_factor}")
        
        # Check if it would exceed 2048
        max_possible = MAX_OUTPUT_PX / max(orig_w, orig_h)
        if scale_factor > max_possible:
            scale_factor = int(max_possible)
            if scale_factor < 2:
                scale_factor = 2
            reason = f"Requested scale would exceed 2048px cap; reduced to {scale_factor}x"
        else:
            reason = "User-requested scale"
    
    # Decompose scale into EDSR operations
    scale_chain = _decompose_scale_factor(scale_factor)
    
    # Estimate inference time
    projected_inference_time = _estimate_inference_time_ms(
        orig_w, orig_h, scale_chain
    )
    
    # Safety check: if projected time exceeds budget, lower the scale
    if projected_inference_time > INFERENCE_TIME_BUDGET_MS:
        logger.warning(
            f"Projected inference time {projected_inference_time:.0f}ms exceeds budget {INFERENCE_TIME_BUDGET_MS}ms. "
            f"Reducing scale from {scale_factor}x"
        )
        for reduced_scale in [8, 4, 2]:
            if reduced_scale < scale_factor:
                scale_factor = reduced_scale
                scale_chain = _decompose_scale_factor(scale_factor)
                projected_inference_time = _estimate_inference_time_ms(
                    orig_w, orig_h, scale_chain
                )
                if projected_inference_time <= INFERENCE_TIME_BUDGET_MS:
                    logger.info(f"Fallback scale: {scale_factor}x (est. {projected_inference_time:.0f}ms)")
                    reason = "Reduced scale to stay within Lambda timeout budget"
                    break

    logger.info(f"Scale Factor: {scale_factor}x via chain {scale_chain}, "
                f"estimated {projected_inference_time:.0f}ms")

    # ================================================================================
    # Resize for inference (aspect-ratio preserving)
    # ================================================================================
    if orig_w > INFERENCE_CAP_PX or orig_h > INFERENCE_CAP_PX:
        scale = INFERENCE_CAP_PX / max(orig_w, orig_h)
        new_w = max(1, int(orig_w * scale))
        new_h = max(1, int(orig_h * scale))
        logger.info(f"Resizing {orig_w}x{orig_h} -> {new_w}x{new_h} for inference")
        pil_image = pil_image.resize((new_w, new_h), Image.LANCZOS)

    inf_w, inf_h = pil_image.size
    
    t_resize = time.time()
    resize_time = (t_resize - t_quality) * 1000

    # ================================================================================
    # EDSR inference: Chain models based on scale_chain
    # ================================================================================
    model_4x, model_2x = _load_models()
    tensor_result = TF.to_tensor(pil_image).unsqueeze(0)

    with torch.no_grad():
        for scale in scale_chain:
            model = model_4x if scale == 4 else model_2x
            tensor_result = model(tensor_result)
            logger.info(f"Applied {scale}x, tensor shape: {tensor_result.shape}")

    edsr_result = TF.to_pil_image(tensor_result.squeeze(0).clamp(0, 1))

    # Compute target output size (same for both EDSR and Lanczos paths)
    target_w = orig_w * scale_factor
    target_h = orig_h * scale_factor
    if max(target_w, target_h) > MAX_OUTPUT_PX:
        cap_scale = MAX_OUTPUT_PX / max(target_w, target_h)
        target_w = max(1, int(target_w * cap_scale))
        target_h = max(1, int(target_h * cap_scale))

    # Lanczos reference at the same target size — used for HF ratio comparison
    lanczos_reference = pil_image.resize((target_w, target_h), Image.LANCZOS)
    edsr_valid, ssim_score = _is_edsr_output_valid(
        edsr_result,
        pil_image,          # inference-size image used as round-trip target
        lanczos_reference,
    )

    if edsr_valid:
        result = edsr_result
        upscale_method = "edsr"
        # Cap output at 2048px (safety) — EDSR output size may differ from target
        out_w, out_h = result.size
        if out_w > MAX_OUTPUT_PX or out_h > MAX_OUTPUT_PX:
            cap = MAX_OUTPUT_PX / max(out_w, out_h)
            result = result.resize((int(out_w * cap), int(out_h * cap)), Image.LANCZOS)
            out_w, out_h = result.size
    else:
        logger.warning(
            "EDSR output rejected (round_trip_ssim=%.3f, threshold=%.2f) — falling back to Lanczos",
            ssim_score, EDSR_ROUNDTRIP_SSIM_THRESHOLD
        )
        result = lanczos_reference
        upscale_method = "lanczos_fallback"
        out_w, out_h = result.size
    
    t_inference = time.time()
    inference_time = (t_inference - t_resize) * 1000

    # ================================================================================
    # Post-processing Stage 1: CLAHE + Bilateral (OpenCV)
    # ================================================================================
    result = _apply_clahe_and_bilateral(result, scale_factor)
    
    t_post1 = time.time()
    post1_time = (t_post1 - t_inference) * 1000

    # ================================================================================
    # Post-processing Stage 2: Dynamic saturation + adaptive sharpness (PIL)
    # ================================================================================
    color_val, sharpness_val = _compute_color_params(result, scale_factor)
    result = ImageEnhance.Color(result).enhance(color_val)
    result = ImageEnhance.Sharpness(result).enhance(sharpness_val)
    
    t_post2 = time.time()
    post2_time = (t_post2 - t_post1) * 1000
    total_time = (t_post2 - t_start) * 1000

    # ================================================================================
    # Build quality warnings and recommendations
    # ================================================================================
    quality_warning = None
    if input_quality < 30:
        quality_warning = "Image is very blurry. Output may not improve significantly."
    elif input_quality < 50:
        quality_warning = "Image is somewhat low quality. Consider uploading a higher-resolution image."
    
    blur_warning = None
    if is_blurry:
        blur_warning = "Input image is detected as blurry. Upscaling results may be limited."

    # ================================================================================
    # Compile metadata
    # ================================================================================
    metadata = {
        # Scaling info
        "requestedScale": scale_factor,
        "actualScale": scale_factor,
        "scalingChain": scale_chain,
        "reason": reason,
        "upscaleMethod": upscale_method,   # "edsr" or "lanczos_fallback"
        "edsr_ssim": round(ssim_score, 3), # structural similarity score (0-1)
        
        # Input/Output dimensions
        "inputSize": f"{orig_w}x{orig_h}",
        "inferenceSize": f"{inf_w}x{inf_h}",
        "outputSize": f"{out_w}x{out_h}",
        
        # Quality assessment
        "qualityAssessment": {
            "inputQualityScore": round(input_quality, 1),
            "blurDetection": {
                "isBlurry": bool(is_blurry),
                "score": round(blur_score, 2)
            },
            "qualityWarning": quality_warning,
            "blurWarning": blur_warning
        },
        
        # Processing timing (milliseconds)
        "timingBreakdown": {
            "qualityAssessmentMs": round(quality_time, 1),
            "resizeMs": round(resize_time, 1),
            "inferenceMs": round(inference_time, 1),
            "postProcessing1Ms": round(post1_time, 1),
            "postProcessing2Ms": round(post2_time, 1),
            "totalMs": round(total_time, 1),
            "projectedInferenceMs": round(projected_inference_time, 1)
        },
        
        # Post-processing details
        "color": round(color_val, 3),
        "sharpness": sharpness_val,
        "postProcessing": "bilateral+clahe+color+adaptive-sharpness",
        
        # Comparison
        "comparison": {
            "inputPixels": orig_w * orig_h,
            "outputPixels": out_w * out_h,
            "pixelMultiplier": round((out_w * out_h) / (orig_w * orig_h), 1),
            "sizeIncrease": f"{scale_factor}x"
        }
    }

    logger.info(
        "Upscale complete -- %s -> %s (scale=%dx via %s, quality=%.1f, time=%.0fms)",
        metadata["inputSize"], metadata["outputSize"],
        scale_factor, scale_chain, input_quality, total_time
    )

    return result, metadata