# Model Training & Fine-Tuning Pipeline

This directory documents the model architectures, loss formulations, training configurations, and convergence procedures used to produce SATUpscale's EDSR checkpoint weights (`edsr/model.pth` and `edsr/model_2x.pth`).

---

## Model Architecture: EDSR (Enhanced Deep Residual Networks)

SATUpscale utilizes the **EDSR-baseline** architecture (Lim et al., 2017), which optimizes conventional ResNet structures for super-resolution:
- **Removal of Batch Normalization**: Eliminates range normalization artifacts, preserves absolute pixel radiance, and frees up substantial GPU memory (~40% reduction).
- **Residual Scaling**: Residual blocks feature scaling layers (factor `0.1`) placed before the skip connection to stabilize deep network convergence.
- **Sub-Pixel Convolutional Shuffling**: Efficient pixel shuffle upsampling layers reconstruct spatial resolution at the final stage.

---

## Loss Formulations

To balance pixel fidelity against structural sharpness without hallucinating geographical artifacts, training employs a composite loss:

$$\mathcal{L}_{\text{total}} = \alpha \mathcal{L}_{1} + \beta \mathcal{L}_{\text{SSIM}} + \gamma \mathcal{L}_{\text{Perceptual}}$$

1. **Pixel-Wise L1 Loss ($\mathcal{L}_{1}$)**:
   Measures absolute color difference across all RGB channels:
   $$\mathcal{L}_{1}(I_{\text{SR}}, I_{\text{HR}}) = \frac{1}{N} \sum |I_{\text{SR}} - I_{\text{HR}}|$$
   *(L1 produces sharper edges than Mean Squared Error L2 loss without over-smoothing).*

2. **Structural Similarity Loss ($\mathcal{L}_{\text{SSIM}}$)**:
   $$\mathcal{L}_{\text{SSIM}}(I_{\text{SR}}, I_{\text{HR}}) = 1 - \text{SSIM}(I_{\text{SR}}, I_{\text{HR}})$$
   Ensures that luminance, contrast, and structural textures (road grids, riverbeds) maintain physical geometry.

3. **Perceptual Feature Loss ($\mathcal{L}_{\text{Perceptual}}$)**:
   Feature representations extracted from pre-trained VGG-19 convolutional layers to enforce natural visual sharpness.

---

## Hyperparameters & Training Setup

| Hyperparameter | Value |
| :--- | :--- |
| **Optimizer** | Adam ($\beta_1 = 0.9$, $\beta_2 = 0.999$, $\epsilon = 10^{-8}$) |
| **Initial Learning Rate** | $1 \times 10^{-4}$ (halved every 200 epochs) |
| **Batch Size** | 16 patches per GPU |
| **Patch Dimensions** | $64 \times 64$ (LR input) $\rightarrow$ $256 \times 256$ (HR target) |
| **Weight Decay** | $0$ (unregularized L1 loss) |
| **Hardware** | NVIDIA A100 (40GB) or RTX 4090 |
| **Epochs** | 1,000 epochs |

---

## Exporting Weights for Inference

Trained PyTorch models are stripped of optimizer states and exported as lightweight state dictionaries for fast loading in AWS Lambda:

```python
import torch

# Load trained training checkpoint
checkpoint = torch.load("checkpoint_best.pth", map_location="cpu")

# Extract pure model weights
model_weights = checkpoint.get("model_state_dict", checkpoint)

# Save inference-optimized weight dictionary
torch.save(model_weights, "ml/inference/edsr/model.pth")
```
