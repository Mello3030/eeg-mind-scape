/**
 * Static domain facts about QSFE-Net — the things that describe the method
 * rather than measure it.
 *
 * Anything measurable now comes from the API instead: architecture and
 * parameter count from `/model/info`, the confusion matrix and per-class
 * metrics from `/model/performance` (computed against the local test split),
 * the ablation table from `/model/ablation` (parsed from the training run's own
 * results file), and gate activations from the analyses themselves. This module
 * deliberately holds no accuracy numbers, so there is nothing here to drift out
 * of step with the served checkpoint.
 */

import type { ClassLabel } from "@/services/api";

export type { ClassLabel };
export { CLASSES } from "@/services/api";

export const MODEL = {
  name: "QSFE-Net",
  longName: "Quadrant-Stream Fusion EEG Network",
  dataset: { name: "CAUEEG", channels: 19, samplingRate: 200, classes: 3 },
};

export const STREAMS = [
  {
    id: "S1" as const,
    name: "Frequency Slowing",
    features: 95,
    formula: "Rθ/α = Pθ / Pα",
    description:
      "Theta/alpha ratio plus absolute delta, theta, alpha and beta band power for each of the 19 channels (19 × 5). Cortical slowing (increased theta, reduced alpha) is one of the most replicated EEG correlates of cognitive decline.",
  },
  {
    id: "S2" as const,
    name: "Inter-Electrode Coherence",
    features: 684,
    formula: "Cₓᵧ(f) = |Sₓᵧ(f)|² / (Sₓₓ(f) Sᵧᵧ(f))",
    description:
      "Magnitude-squared coherence for all 171 electrode pairs across four bands. Functional disconnection between cortical regions is an early marker of network breakdown.",
  },
  {
    id: "S3" as const,
    name: "Spectral Entropy",
    features: 19,
    formula: "H = -Σ pᵢ log(pᵢ)",
    description:
      "Shannon entropy of the normalised power spectral density per channel. Lower entropy indicates a less complex, more rhythmic signal.",
  },
  {
    id: "S4" as const,
    name: "Hemispheric Asymmetry",
    features: 32,
    formula: "A = (P_left - P_right) / (P_left + P_right)",
    description:
      "Normalised left/right power differences across 8 symmetric electrode pairs per band. Asymmetric degeneration can precede global slowing.",
  },
];

export const TOTAL_FEATURES = STREAMS.reduce((s, x) => s + x.features, 0); // 830

/**
 * Channel order as the CAUEEG EDF files store it — the model reads the first 19
 * channels positionally, so this order is what indexes every per-channel
 * biomarker the API returns. It is not a display convention; do not re-sort it
 * without re-indexing the data alongside.
 */
export const CHANNELS_19 = [
  "Fp1",
  "F3",
  "C3",
  "P3",
  "O1",
  "Fp2",
  "F4",
  "C4",
  "P4",
  "O2",
  "F7",
  "T3",
  "T5",
  "F8",
  "T4",
  "T6",
  "Fz",
  "Cz",
  "Pz",
];

export const BANDS: Record<string, [number, number]> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
};

/** The serving pipeline as `ML/backend` actually implements it. */
export const PIPELINE = [
  "EDF file",
  "pyEDFlib read (first 19 channels)",
  "Resample to 200 Hz if needed",
  "N evenly spaced 10 s crops",
  "Per-channel z-normalisation",
  "Feature extraction (830)",
  "QSFE-Net inference",
  "Average probabilities + gates across crops",
];

export const STREAM_IDS = ["S1", "S2", "S3", "S4"] as const;

export const classColor = (c: ClassLabel | null | undefined) =>
  c === "Normal"
    ? "var(--normal)"
    : c === "MCI"
      ? "var(--mci)"
      : c === "Dementia"
        ? "var(--dementia)"
        : "var(--muted-foreground)";

export const pct = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
