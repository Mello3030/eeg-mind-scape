/**
 * QSFE-Net static research constants.
 * Values documented from the final-year project (Run 8, CAUEEG dataset).
 */

export type ClassLabel = "Normal" | "MCI" | "Dementia";
export const CLASSES: ClassLabel[] = ["Normal", "MCI", "Dementia"];

export const MODEL = {
  name: "QSFE-Net",
  version: "v1.0.0-run8",
  parameterCount: 79431,
  testAccuracy: 0.5339,
  validationAccuracy: 0.5378,
  macroF1: 0.5226,
  checkpointPath: "checkpoints/qsfe_net_run8.pth",
  dataset: { name: "CAUEEG", channels: 19, samplingRate: 200, classes: 3 },
};

export const STREAMS = [
  {
    id: "S1" as const,
    name: "Frequency Slowing",
    features: 95,
    formula: "R\u03B8/\u03B1 = P\u03B8 / P\u03B1",
    description:
      "Relative band power and theta/alpha ratios per electrode. Cortical slowing (increased theta, reduced alpha) is one of the most replicated EEG correlates of cognitive decline.",
  },
  {
    id: "S2" as const,
    name: "Inter-Electrode Coherence",
    features: 684,
    formula: "C\u2093\u1D67(f) = |S\u2093\u1D67(f)|\u00B2 / (S\u2093\u2093(f) S\u1D67\u1D67(f))",
    description:
      "Magnitude-squared coherence for all 171 electrode pairs across four bands. Functional disconnection between cortical regions is an early marker of network breakdown.",
  },
  {
    id: "S3" as const,
    name: "Spectral Entropy",
    features: 19,
    formula: "H = -\u03A3 p\u1D62 log(p\u1D62)",
    description:
      "Shannon entropy of the normalised power spectral density per channel. Lower entropy indicates a less complex, more rhythmic signal.",
  },
  {
    id: "S4" as const,
    name: "Hemispheric Asymmetry",
    features: 32,
    formula: "A = log(P_left) - log(P_right)",
    description:
      "Log power differences between symmetric electrode pairs per band. Asymmetric degeneration can precede global slowing.",
  },
];

export const TOTAL_FEATURES = STREAMS.reduce((s, x) => s + x.features, 0); // 830

/** Run 8 mean gate activations per class. */
export const GATE_WEIGHTS: Record<ClassLabel, { S1: number; S2: number; S3: number; S4: number }> = {
  Normal: { S1: 0.765, S2: 0.975, S3: 0.498, S4: 0.47 },
  MCI: { S1: 0.765, S2: 0.978, S3: 0.425, S4: 0.387 },
  Dementia: { S1: 0.75, S2: 0.978, S3: 0.426, S4: 0.329 },
};

export const CONFUSION_MATRIX = {
  labels: CLASSES,
  // rows = true class, cols = predicted class
  matrix: [
    [71, 26, 21],
    [34, 55, 29],
    [25, 30, 45],
  ],
};

export const CLASS_METRICS = [
  { label: "Normal", precision: 0.546, recall: 0.602, f1: 0.573, support: 118 },
  { label: "MCI", precision: 0.495, recall: 0.466, f1: 0.48, support: 118 },
  { label: "Dementia", precision: 0.474, recall: 0.45, f1: 0.462, support: 100 },
];

export const TRAINING_CURVE = [
  { epoch: 1, trainAcc: 0.351, valAcc: 0.362, trainLoss: 1.098, valLoss: 1.094 },
  { epoch: 5, trainAcc: 0.402, valAcc: 0.411, trainLoss: 1.071, valLoss: 1.068 },
  { epoch: 10, trainAcc: 0.448, valAcc: 0.452, trainLoss: 1.043, valLoss: 1.046 },
  { epoch: 15, trainAcc: 0.481, valAcc: 0.478, trainLoss: 1.018, valLoss: 1.029 },
  { epoch: 20, trainAcc: 0.503, valAcc: 0.497, trainLoss: 0.998, valLoss: 1.017 },
  { epoch: 25, trainAcc: 0.522, valAcc: 0.512, trainLoss: 0.979, valLoss: 1.008 },
  { epoch: 30, trainAcc: 0.539, valAcc: 0.524, trainLoss: 0.962, valLoss: 1.002 },
  { epoch: 35, trainAcc: 0.551, valAcc: 0.531, trainLoss: 0.948, valLoss: 0.999 },
  { epoch: 40, trainAcc: 0.563, valAcc: 0.536, trainLoss: 0.935, valLoss: 0.997 },
  { epoch: 45, trainAcc: 0.574, valAcc: 0.5378, trainLoss: 0.924, valLoss: 0.996 },
  { epoch: 50, trainAcc: 0.585, valAcc: 0.5361, trainLoss: 0.913, valLoss: 0.998 },
  { epoch: 55, trainAcc: 0.596, valAcc: 0.533, trainLoss: 0.903, valLoss: 1.003 },
  { epoch: 60, trainAcc: 0.607, valAcc: 0.529, trainLoss: 0.893, valLoss: 1.011 },
];

export const ABLATION = [
  { config: "S1 only", streams: "Frequency slowing", params: 26_115, testAccuracy: 0.4915, macroF1: 0.4762 },
  { config: "S2 only", streams: "Coherence", params: 46_851, testAccuracy: 0.5169, macroF1: 0.5031 },
  { config: "S3 only", streams: "Spectral entropy", params: 21_251, testAccuracy: 0.4237, macroF1: 0.3988 },
  { config: "S4 only", streams: "Asymmetry", params: 22_083, testAccuracy: 0.4322, macroF1: 0.4105 },
  { config: "S1 + S2", streams: "Slowing + coherence", params: 63_267, testAccuracy: 0.5551, macroF1: 0.5418 },
  { config: "S1 + S2 + S3", streams: "Three streams", params: 71_267, testAccuracy: 0.5424, macroF1: 0.5297 },
  { config: "Full (S1-S4)", streams: "All four streams", params: 79_431, testAccuracy: 0.5339, macroF1: 0.5226 },
];

export const ABLATION_FINDING =
  "The S1 + S2 configuration (55.51% test accuracy) outperformed the full four-stream model (53.39%). At the current dataset scale, the spectral-entropy (S3) and hemispheric-asymmetry (S4) streams contribute more noise than signal \u2014 consistent with their low learned gate activations (~0.33-0.50).";

export const BASELINES = [
  { model: "QSFE-Net (ours)", params: 79_431, paramsLabel: "79,431", testAccuracy: 0.5339, ours: true },
  { model: "CEEDNet Single", params: 25_700_000, paramsLabel: "25.7M", testAccuracy: 0.7732, ours: false },
  { model: "CEEDNet Ensemble", params: 253_800_000, paramsLabel: "253.8M", testAccuracy: 0.7916, ours: false },
];

export const CHANNELS_19 = [
  "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8", "T3", "C3", "Cz",
  "C4", "T4", "T5", "P3", "Pz", "P4", "T6", "O1", "O2",
];

export const PIPELINE = [
  "EDF file",
  "MNE loading (19 ch, 200 Hz)",
  "Trim to max 300 s",
  "Band-pass 0.5\u201330 Hz",
  "30 s crop",
  "Feature extraction (830)",
  "QSFE-Net inference",
];

export const classColor = (c: ClassLabel) =>
  c === "Normal" ? "var(--normal)" : c === "MCI" ? "var(--mci)" : "var(--dementia)";

export const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;