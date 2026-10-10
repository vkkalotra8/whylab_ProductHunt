# WhyLab Vision: Synthetic Flagship Fixture Dataset

**DISCLAIMER**: This dataset is completely synthetic and generated deterministically with a fixed random seed. It contains three intentionally planted computer-vision failure modes designed to verify WhyLab Vision's empirical falsification and leakage diagnostic capabilities.

## Planted Defects Specification

### 1. Planted Shortcut (Scale Ruler / Watermark Artifact)
- **Train Positive Prevalence**: Present in **78.0%** of malignant training cases.
- **Production Positive Prevalence**: Present in only **5.0%** of real-world captures.
- **Diagnostic Consequence**: The model learned the watermark as a shortcut for malignancy. In production where watermarks are absent, positive recall collapses to **~22%**, creating a severe false-negative incident.

### 2. Planted Cross-Split Near-Duplicate Leakage
- **Leakage Prevalence**: **6.0%** of validation images (`derm_val_004`, `derm_val_018`, `derm_val_032`) are near-copies (Hamming distance = 1 bit) of training set images.
- **Diagnostic Consequence**:
  - Accuracy on leaked images: **100.0%**
  - Accuracy on clean images: **63.8%**
  - **Leakage-Inflated Performance Gap**: **+36.2 percentage points** (proven with 95% Wilson CI).

### 3. Planted Acquisition Distribution Shift
- **Training Environment**: Tripod-mounted high-resolution dermatoscope (`site_A`, mean sharpness: **280**, mean luminance: **135**).
- **Production Environment**: Handheld mobile camera (`site_B`, mean sharpness: **112**, mean luminance: **104**).
- **Diagnostic Consequence**: Slices over sharpness quintiles expose severe degradation under real-world blur.
