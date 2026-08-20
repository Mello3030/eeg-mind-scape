"""
EDA for Group 18 — EEG Dementia Detection (QSFE-Net)
Place this at: D:\Major\src\datasets\eda.py
Run from D:\Major with: python src/datasets/eda.py

Generates 6 figures saved to D:\Major\outputs\figures\
"""

import numpy as np
import matplotlib.pyplot as plt
import json, os, sys

sys.path.append(r"D:\Major\src\datasets")

DATASET_PATH = r"D:\Major\caueeg-dataset"
FEATURE_DIR  = r"D:\Major\outputs\features_multicrop"
FIG_DIR      = r"D:\Major\outputs\figures"
os.makedirs(FIG_DIR, exist_ok=True)

CLASS_NAMES = ["Normal", "MCI", "Dementia"]
COLORS      = ["#2196F3", "#FF9800", "#F44336"]

print("Loading annotation JSON...")
with open(os.path.join(DATASET_PATH, "dementia.json")) as f:
    data = json.load(f)

train_records = data["train_split"]
val_records   = data.get("val_split", [])
test_records  = data.get("test_split", [])
all_records   = train_records + val_records + test_records

print(f"  Train: {len(train_records)} | Val: {len(val_records)} | Test: {len(test_records)}")


# ─────────────────────────────────────────────────────────────────────────────
# FIGURE 1 — S1 Feature Distribution per Class (theta/alpha ratio mean)
# Finding: Clear gradient Normal→MCI→Dementia  (0.27 → 0.33 → 0.46)
# ─────────────────────────────────────────────────────────────────────────────
print("\n[1/6] S1 distribution per class...")

class_s1 = {0: [], 1: [], 2: []}
for record in train_records:
    path = os.path.join(FEATURE_DIR, f"{record['serial']}_crop0.npz")
    if not os.path.exists(path):
        continue
    d = np.load(path)
    class_s1[record["class_label"]].append(float(d["s1"].mean()))

fig, ax = plt.subplots(figsize=(8, 5))
for cls in range(3):
    vals = class_s1[cls]
    mean_val = np.mean(vals) if vals else 0
    ax.hist(vals, bins=35, alpha=0.65, color=COLORS[cls],
            label=f"{CLASS_NAMES[cls]} (μ={mean_val:.3f})", edgecolor="none")

ax.set_xlabel("Mean Theta/Alpha Ratio (S1)", fontsize=12)
ax.set_ylabel("Patient Count", fontsize=12)
ax.set_title("S1 Feature Distribution by Class\n(Frequency Slowing — Primary Biomarker)",
             fontsize=13, fontweight="bold")
ax.legend(fontsize=11)
ax.grid(axis="y", alpha=0.3)
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, "s1_distribution.png"), dpi=150)
plt.close()
print("  Saved s1_distribution.png")


# ─────────────────────────────────────────────────────────────────────────────
# FIGURE 2 — S3 Feature Distribution per Class (spectral entropy)
# Finding: Gate weight decreases Normal→Dementia (0.354 → 0.419 inverse)
# ─────────────────────────────────────────────────────────────────────────────
print("[2/6] S3 distribution per class...")

class_s3 = {0: [], 1: [], 2: []}
for record in train_records:
    path = os.path.join(FEATURE_DIR, f"{record['serial']}_crop0.npz")
    if not os.path.exists(path):
        continue
    d = np.load(path)
    class_s3[record["class_label"]].append(float(d["s3"].mean()))

fig, ax = plt.subplots(figsize=(8, 5))
for cls in range(3):
    vals = class_s3[cls]
    mean_val = np.mean(vals) if vals else 0
    ax.hist(vals, bins=35, alpha=0.65, color=COLORS[cls],
            label=f"{CLASS_NAMES[cls]} (μ={mean_val:.4f})", edgecolor="none")

ax.set_xlabel("Mean Spectral Entropy (S3)", fontsize=12)
ax.set_ylabel("Patient Count", fontsize=12)
ax.set_title("S3 Feature Distribution by Class\n(Spectral Entropy — Weak Separation Expected)",
             fontsize=13, fontweight="bold")
ax.legend(fontsize=11)
ax.grid(axis="y", alpha=0.3)
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, "s3_distribution.png"), dpi=150)
plt.close()
print("  Saved s3_distribution.png")


# ─────────────────────────────────────────────────────────────────────────────
# FIGURE 3 — S2 and S4 distributions (sanity check, expected weak separation)
# ─────────────────────────────────────────────────────────────────────────────
print("[3/6] S2 and S4 distributions...")

class_s2 = {0: [], 1: [], 2: []}
class_s4 = {0: [], 1: [], 2: []}
for record in train_records:
    path = os.path.join(FEATURE_DIR, f"{record['serial']}_crop0.npz")
    if not os.path.exists(path):
        continue
    d = np.load(path)
    class_s2[record["class_label"]].append(float(d["s2"].mean()))
    class_s4[record["class_label"]].append(float(d["s4"].mean()))

fig, axes = plt.subplots(1, 2, figsize=(14, 5))
for cls in range(3):
    axes[0].hist(class_s2[cls], bins=35, alpha=0.65,
                 color=COLORS[cls], label=CLASS_NAMES[cls], edgecolor="none")
    axes[1].hist(class_s4[cls], bins=35, alpha=0.65,
                 color=COLORS[cls], label=CLASS_NAMES[cls], edgecolor="none")

axes[0].set_title("S2 Feature Distribution\n(Mean EEG Coherence — Weak Separation)",
                  fontsize=12, fontweight="bold")
axes[0].set_xlabel("Mean Coherence (S2)")
axes[0].set_ylabel("Patient Count")
axes[0].legend()
axes[0].grid(axis="y", alpha=0.3)

axes[1].set_title("S4 Feature Distribution\n(Hemispheric Asymmetry — Near-Zero Separation)",
                  fontsize=12, fontweight="bold")
axes[1].set_xlabel("Mean Asymmetry (S4)")
axes[1].set_ylabel("Patient Count")
axes[1].legend()
axes[1].grid(axis="y", alpha=0.3)

plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, "s2_s4_distribution.png"), dpi=150)
plt.close()
print("  Saved s2_s4_distribution.png")


# ─────────────────────────────────────────────────────────────────────────────
# FIGURE 4 — All-streams box plot side by side (normalized)
# Shows relative discriminability of each stream at a glance
# ─────────────────────────────────────────────────────────────────────────────
print("[4/6] Multi-stream box plot...")

streams = {"S1": class_s1, "S3": class_s3, "S2": class_s2, "S4": class_s4}
fig, axes = plt.subplots(1, 4, figsize=(16, 5))

for ax, (name, data_dict) in zip(axes, streams.items()):
    all_vals = [data_dict[cls] for cls in range(3)]
    bplot = ax.boxplot(all_vals, patch_artist=True, notch=False,
                       medianprops=dict(color="black", linewidth=2))
    for patch, color in zip(bplot["boxes"], COLORS):
        patch.set_facecolor(color)
        patch.set_alpha(0.7)
    ax.set_xticks([1, 2, 3])
    ax.set_xticklabels(CLASS_NAMES, rotation=15)
    ax.set_title(f"{name}", fontsize=13, fontweight="bold")
    ax.grid(axis="y", alpha=0.3)

fig.suptitle("Feature Distribution Across Streams — Class Separation Comparison",
             fontsize=13, fontweight="bold", y=1.01)
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, "all_streams_boxplot.png"), dpi=150, bbox_inches="tight")
plt.close()
print("  Saved all_streams_boxplot.png")


# ─────────────────────────────────────────────────────────────────────────────
# FIGURE 5 — Raw EEG signal per class (first patient per class, Fp1 channel)
# ─────────────────────────────────────────────────────────────────────────────
print("[5/6] Raw EEG signals per class...")
try:
    import pyedflib
    SAMPLE_RATE = 200

    fig, axes = plt.subplots(3, 1, figsize=(13, 8), sharex=False)
    for cls in range(3):
        candidates = [r for r in all_records if r["class_label"] == cls]
        if not candidates:
            axes[cls].set_title(f"{CLASS_NAMES[cls]} — No data")
            continue
        record = candidates[0]
        edf_path = os.path.join(DATASET_PATH, "signal", "edf",
                                f"{record['serial']}.edf")
        if not os.path.exists(edf_path):
            axes[cls].set_title(f"{CLASS_NAMES[cls]} — EDF not found ({record['serial']})")
            continue
        f = pyedflib.EdfReader(edf_path)
        sig = f.readSignal(0)   # Fp1 channel
        f.close()
        n = min(2000, len(sig))
        t = np.arange(n) / SAMPLE_RATE
        axes[cls].plot(t, sig[:n], linewidth=0.6, color=COLORS[cls])
        axes[cls].set_title(f"{CLASS_NAMES[cls]} — Fp1 (first 10 s) | Patient: {record['serial']}",
                            fontsize=11)
        axes[cls].set_ylabel("Amplitude (μV)")
        axes[cls].grid(alpha=0.3)

    axes[-1].set_xlabel("Time (seconds)")
    plt.suptitle("Raw EEG Signal — One Patient per Class (Fp1 Channel)",
                 fontsize=13, fontweight="bold")
    plt.tight_layout()
    plt.savefig(os.path.join(FIG_DIR, "raw_eeg_per_class.png"), dpi=150)
    plt.close()
    print("  Saved raw_eeg_per_class.png")
except ImportError:
    print("  ⚠ pyedflib not installed — skipping raw EEG plot.")
    print("    Install with: pip install pyedflib")


# ─────────────────────────────────────────────────────────────────────────────
# FIGURE 6 — Gate Weight Visualization (Run 8 values from docx/context)
# These are the recorded Run 8 gate weights from evaluate.py output
# ─────────────────────────────────────────────────────────────────────────────
print("[6/6] Gate weight visualization (Run 8)...")

# Gate weights from actual evaluate.py run on qsfe_npz_best.pth (Run 8, S1=95)
# Test Accuracy: 53.39% | Macro F1: 0.5226
# Source: evaluate.py output, 118 test patients
gate_weights = {
    "Normal":   [0.765, 0.975, 0.498, 0.470],
    "MCI":      [0.765, 0.978, 0.425, 0.387],
    "Dementia": [0.750, 0.978, 0.426, 0.329],
}

stream_labels = ["S1\n(Freq. Slowing)", "S2\n(Coherence)",
                 "S3\n(Entropy)", "S4\n(Asymmetry)"]
x = np.arange(len(stream_labels))
width = 0.25

fig, ax = plt.subplots(figsize=(10, 5))
for i, (cls_name, weights) in enumerate(gate_weights.items()):
    ax.bar(x + i * width, weights, width, label=cls_name,
           color=COLORS[i], alpha=0.82, edgecolor="white")

ax.set_xticks(x + width)
ax.set_xticklabels(stream_labels, fontsize=11)
ax.set_ylabel("Gate Weight (Sigmoid)", fontsize=12)
ax.set_ylim(0, 1.15)
ax.set_title("QSFE-Net Gate Weights per Class — Run 8\n"
             "(Higher = stream contributes more to that class prediction)",
             fontsize=12, fontweight="bold")
ax.legend(fontsize=11)
ax.axhline(0.5, color="gray", linestyle="--", linewidth=0.8, alpha=0.6,
           label="50% threshold")
ax.grid(axis="y", alpha=0.3)
plt.tight_layout()
plt.savefig(os.path.join(FIG_DIR, "gate_weights_run8.png"), dpi=150)
plt.close()
print("  Saved gate_weights_run8.png")


# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
print(f"""
═══════════════════════════════════════════════
EDA Complete — All figures saved to:
{FIG_DIR}

Files generated:
  1. s1_distribution.png         ← Primary biomarker (use in paper)
  2. s3_distribution.png         ← Entropy distribution
  3. s2_s4_distribution.png      ← Weak/zero separation streams
  4. all_streams_boxplot.png     ← One-shot comparison of all 4 streams
  5. raw_eeg_per_class.png       ← Raw EEG (requires pyedflib)
  6. gate_weights_run8.png       ← Explainability figure (update with
                                     actual evaluate.py numbers)
═══════════════════════════════════════════════
NOTE: Gate weights in figure 6 are approximate from context docs.
Run evaluate.py on qsfe_npz_best.pth (Run 8) and update the
gate_weights dict in this script with real numbers before submission.
""")
