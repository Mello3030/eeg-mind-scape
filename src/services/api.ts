/**
 * API client for the QSFE-Net FastAPI backend (ML/backend).
 *
 * One backend serves everything: accounts, patients, analyses, history,
 * reports, and the model itself. The wire format is snake_case; this module is
 * the single place that renames it to the camelCase the components use. Nested
 * payloads that are already display-ready — biomarkers, per-crop detail,
 * recording metadata — are carried through untouched rather than flattened.
 */

export type ClassLabel = "Normal" | "MCI" | "Dementia";
export const CLASSES: ClassLabel[] = ["Normal", "MCI", "Dementia"];
export type StreamKey = "S1" | "S2" | "S3" | "S4";
export type Role = "researcher" | "administrator";
export type Sex = "M" | "F" | "Other";

export const API_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8000";

/* ------------------------------------ core ----------------------------------- */

const TOKEN_KEY = "qsfe.token";
export const getToken = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
};

/**
 * Notified when the API rejects our token.
 *
 * Clearing localStorage is not enough on its own: AuthContext holds `user` in
 * React state, so without this the session looks alive, the route guard lets the
 * page render, and every panel fails quietly. Subscribers drop their session and
 * the guard redirects.
 */
type UnauthorizedHandler = () => void;
const unauthorizedHandlers = new Set<UnauthorizedHandler>();

export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** FastAPI reports errors as `detail`, which is either a string or a list of
 * validation objects; both are reduced to one readable line here. */
function readDetail(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string; loc?: unknown[] } | undefined;
    if (first?.msg) {
      const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null;
      return field ? `${String(field)}: ${first.msg}` : first.msg;
    }
  }
  return `Request failed with status ${status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    setToken(null);
    for (const handler of unauthorizedHandlers) handler();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(readDetail(body, res.status), res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
};

/* ------------------------------------ auth ----------------------------------- */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export async function apiRegister(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
}) {
  const result = await request<{ token: string; user: SessionUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setToken(result.token);
  return result.user;
}

export async function apiLogin(email: string, password: string) {
  const result = await request<{ token: string; user: SessionUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  return result.user;
}

export const apiMe = () => request<SessionUser>("/api/auth/me");

/* ---------------------------------- patients ---------------------------------- */

export interface Patient {
  id: string;
  code: string | null;
  name: string | null;
  age: number | null;
  sex: string | null;
  notes: string | null;
  datasetSerial: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientRow extends Patient {
  analyses: number;
  uploads: number;
  latest: Analysis | null;
}

export interface PatientDetail extends Patient {
  analyses: Analysis[];
}

interface RawPatient {
  id: string;
  code: string | null;
  name: string | null;
  age: number | null;
  sex: string | null;
  notes: string | null;
  dataset_serial: string | null;
  created_at: string;
  updated_at: string;
  n_predictions?: number;
  n_uploads?: number;
  latest_prediction?: RawAnalysis | null;
}

function toPatient(p: RawPatient): Patient {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    age: p.age,
    sex: p.sex,
    notes: p.notes,
    datasetSerial: p.dataset_serial,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export async function listPatients(): Promise<PatientRow[]> {
  const res = await request<{ items: RawPatient[] }>(`/api/patients${qs({ limit: 50 })}`);
  return res.items.map((p) => ({
    ...toPatient(p),
    analyses: p.n_predictions ?? 0,
    uploads: p.n_uploads ?? 0,
    latest: p.latest_prediction ? toAnalysis(p.latest_prediction) : null,
  }));
}

export async function getPatient(id: string): Promise<PatientDetail> {
  const [raw, history] = await Promise.all([
    request<RawPatient>(`/api/patients/${id}`),
    request<{ items: RawAnalysis[] }>(`/api/history${qs({ patient_id: id, limit: 50 })}`),
  ]);
  return { ...toPatient(raw), analyses: history.items.map(toAnalysis) };
}

export function createPatient(input: {
  code?: string | undefined;
  name?: string | undefined;
  age?: number | undefined;
  sex?: Sex | undefined;
  notes?: string | undefined;
}) {
  return request<RawPatient>("/api/patients", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(toPatient);
}

export function updatePatient(
  id: string,
  patch: {
    name?: string | undefined;
    age?: number | undefined;
    sex?: Sex | undefined;
    notes?: string | undefined;
  },
) {
  return request<RawPatient>(`/api/patients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).then(toPatient);
}

export const deletePatient = (id: string) =>
  request<{ deleted: string }>(`/api/patients/${id}`, { method: "DELETE" });

/* ---------------------------------- analyses ---------------------------------- */

export interface GroundTruth {
  className: ClassLabel;
  split: string;
  correct: boolean;
  age: number | null;
}

export interface Analysis {
  id: string;
  patientId: string | null;
  uploadId: string | null;
  /** upload | dataset_features | dataset_edf */
  sourceKind: string;
  sourceRef: string | null;
  prediction: ClassLabel;
  confidence: number;
  probabilities: Record<ClassLabel, number>;
  gateWeights: Record<StreamKey, number>;
  dominantStream: StreamKey | null;
  nCrops: number;
  checkpoint: string | null;
  createdAt: string;
  groundTruth: GroundTruth | null;
  notes: string | null;
}

/** Per-channel and per-pair quantities decoded from the four feature streams.
 * Shapes follow the backend's biomarker decoder; only the parts the UI reads
 * are typed narrowly. */
export interface Biomarkers {
  /** Scalar headline figures, plus `relative_band_power` which is a nested
   * band -> fraction object rather than a number. */
  summary: Record<string, number | string | Record<string, number>>;
  frequency_slowing: {
    channels: string[];
    theta_alpha_ratio: number[];
    band_power: Record<string, number[]>;
    relative_band_power: Record<string, number[]>;
  };
  coherence: {
    mean_by_band: Record<string, number>;
    top_alpha_pairs: Array<{ pair: string; coherence: number }>;
    lowest_alpha_pairs: Array<{ pair: string; coherence: number }>;
  };
  complexity: { channels: string[]; spectral_entropy: number[] };
  asymmetry: {
    pairs: string[];
    by_band: Record<string, number[]>;
    most_asymmetric: { pair?: string; band?: string; value?: number };
  };
}

export interface AnalysisDetail extends Analysis {
  biomarkers: Biomarkers | null;
  perCrop: Array<Record<string, unknown>> | null;
  recording: {
    sample_rate?: number;
    duration_seconds?: number;
    crop_starts?: number[];
    crop_length?: number;
    n_source_channels?: number;
    resampled_from?: number | null;
  } | null;
  timingMs: Record<string, number> | null;
  device: string | null;
  patient: Patient | null;
  upload: {
    id: string;
    filename: string;
    size_bytes: number;
    sha256: string;
    sample_rate: number | null;
    duration_seconds: number | null;
    n_channels: number | null;
  } | null;
}

interface RawAnalysis {
  id: string;
  patient_id: string | null;
  upload_id: string | null;
  source_kind: string;
  source_ref: string | null;
  predicted_label: string;
  predicted_index: number;
  confidence: number;
  probabilities: Record<string, number>;
  gates: Record<string, number>;
  dominant_stream: string | null;
  n_crops: number;
  checkpoint: string | null;
  created_at: string;
  notes?: string | null;
  ground_truth?: {
    class_name?: string;
    split?: string;
    correct?: boolean;
    age?: number | null;
  } | null;
  biomarkers?: Biomarkers | null;
  per_crop?: Array<Record<string, unknown>> | null;
  recording?: AnalysisDetail["recording"];
  timing_ms?: Record<string, number> | null;
  device?: string | null;
  patient?: RawPatient | null;
  upload?: AnalysisDetail["upload"];
}

const ZERO_GATES: Record<StreamKey, number> = { S1: 0, S2: 0, S3: 0, S4: 0 };

function toAnalysis(a: RawAnalysis): Analysis {
  const gates = a.gates ?? {};
  const truth = a.ground_truth;
  return {
    id: a.id,
    patientId: a.patient_id,
    uploadId: a.upload_id,
    sourceKind: a.source_kind,
    sourceRef: a.source_ref,
    prediction: a.predicted_label as ClassLabel,
    confidence: a.confidence,
    probabilities: {
      Normal: a.probabilities?.["Normal"] ?? 0,
      MCI: a.probabilities?.["MCI"] ?? 0,
      Dementia: a.probabilities?.["Dementia"] ?? 0,
    },
    gateWeights: {
      S1: gates["s1"] ?? ZERO_GATES.S1,
      S2: gates["s2"] ?? ZERO_GATES.S2,
      S3: gates["s3"] ?? ZERO_GATES.S3,
      S4: gates["s4"] ?? ZERO_GATES.S4,
    },
    dominantStream: a.dominant_stream ? (a.dominant_stream.toUpperCase() as StreamKey) : null,
    nCrops: a.n_crops,
    checkpoint: a.checkpoint,
    createdAt: a.created_at,
    notes: a.notes ?? null,
    groundTruth: truth?.class_name
      ? {
          className: truth.class_name as ClassLabel,
          split: truth.split ?? "",
          correct: Boolean(truth.correct),
          age: truth.age ?? null,
        }
      : null,
  };
}

function toAnalysisDetail(a: RawAnalysis): AnalysisDetail {
  return {
    ...toAnalysis(a),
    biomarkers: a.biomarkers ?? null,
    perCrop: a.per_crop ?? null,
    recording: a.recording ?? null,
    timingMs: a.timing_ms ?? null,
    device: a.device ?? null,
    patient: a.patient ? toPatient(a.patient) : null,
    upload: a.upload ?? null,
  };
}

/** Most recent analyses across the workspace. Safe to use directly as a
 * react-query queryFn, so it takes no arguments. */
export async function listAnalyses(): Promise<Analysis[]> {
  const res = await request<{ items: RawAnalysis[] }>(`/api/history${qs({ limit: 50 })}`);
  return res.items.map(toAnalysis);
}

export const getAnalysis = (id: string) =>
  request<RawAnalysis>(`/api/analyses/${id}`).then(toAnalysisDetail);

export const deleteAnalysis = (id: string) =>
  request<{ deleted: string }>(`/api/analyses/${id}`, { method: "DELETE" });

export const reanalyse = (id: string, nCrops?: number) =>
  request<RawAnalysis>(`/api/analyses/${id}/reanalyse${qs({ n_crops: nCrops })}`, {
    method: "POST",
  }).then(toAnalysisDetail);

export const updateAnalysisNotes = (id: string, notes: string) =>
  request<RawAnalysis>(`/api/analyses/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  }).then(toAnalysis);

/** Creates (or reuses) the patient, then uploads and scores the recording.
 * Scoring is synchronous — the promise resolves once the model has run. */
export async function uploadAndAnalyse(input: {
  code: string;
  name?: string;
  age?: number;
  sex?: Sex;
  notes?: string;
  file: File;
  nCrops?: number;
}): Promise<{ patient: Patient; analysis: AnalysisDetail }> {
  const existing = await request<{ items: RawPatient[] }>(
    `/api/patients${qs({ search: input.code, limit: 50 })}`,
  );
  const match = existing.items.find((p) => p.code === input.code);

  const patient = match
    ? toPatient(match)
    : await createPatient({
        code: input.code,
        name: input.name || input.code,
        age: input.age,
        sex: input.sex,
        notes: input.notes,
      });

  const form = new FormData();
  form.append("file", input.file);
  form.append("patient_id", patient.id);
  if (input.notes) form.append("notes", input.notes);
  if (input.nCrops) form.append("n_crops", String(input.nCrops));

  const analysis = await request<RawAnalysis>("/api/analyses", { method: "POST", body: form });
  return { patient, analysis: toAnalysisDetail(analysis) };
}

/** Scores a CAUEEG patient from the local dataset, with its ground-truth label. */
export const analyseDatasetRecord = (serial: string, nCrops?: number) =>
  request<RawAnalysis>(`/api/analyses/from-record/${serial}`, {
    method: "POST",
    body: JSON.stringify({ create_patient: true, n_crops: nCrops ?? null }),
  }).then(toAnalysisDetail);

/* ---------------------------------- waveform ---------------------------------- */

export interface Waveform {
  channels: string[];
  sampleRate: number;
  effectiveSampleRate: number;
  startSeconds: number;
  durationSeconds: number;
  totalDurationSeconds: number;
  data: number[][];
  scoredWindows: Array<{ start_seconds: number; duration_seconds: number }>;
}

/** Decimated EEG straight from the source EDF. Returns null when the analysis
 * has no viewable recording (dataset rows scored from cached features). */
export async function getWaveform(
  analysisId: string,
  opts: { start?: number; duration?: number; channels?: string[]; maxPoints?: number } = {},
): Promise<Waveform | null> {
  try {
    const raw = await request<{
      channels: string[];
      sample_rate: number;
      effective_sample_rate: number;
      start_seconds: number;
      duration_seconds: number;
      total_duration_seconds: number;
      data: number[][];
      scored_windows: Waveform["scoredWindows"];
    }>(
      `/api/analyses/${analysisId}/waveform${qs({
        start: opts.start,
        duration: opts.duration,
        max_points: opts.maxPoints,
        channels: opts.channels?.join(","),
      })}`,
    );
    return {
      channels: raw.channels,
      sampleRate: raw.sample_rate,
      effectiveSampleRate: raw.effective_sample_rate,
      startSeconds: raw.start_seconds,
      durationSeconds: raw.duration_seconds,
      totalDurationSeconds: raw.total_duration_seconds,
      data: raw.data,
      scoredWindows: raw.scored_windows ?? [],
    };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 410)) return null;
    throw error;
  }
}

/* --------------------------------- dashboard ----------------------------------- */

export interface DashboardStats {
  total: number;
  patients: number;
  uploads: number;
  normal: number;
  mci: number;
  dementia: number;
  distribution: Array<{ name: ClassLabel; value: number }>;
  meanGates: Record<StreamKey, number>;
  meanConfidence: number;
  accuracyOnLabelled: number | null;
  nLabelled: number;
  dailyCounts: Array<{ date: string; count: number }>;
}

export async function dashboardStats(): Promise<DashboardStats> {
  const raw = await request<{
    total_predictions: number;
    total_patients: number;
    total_uploads: number;
    by_label: Array<{ label: string; count: number; mean_confidence: number }>;
    mean_gates: Record<string, number>;
    mean_confidence: number;
    accuracy_on_labelled: number | null;
    n_labelled: number;
    daily_counts: Array<{ date: string; count: number }>;
  }>("/api/history/stats");

  const count = (label: ClassLabel) => raw.by_label.find((b) => b.label === label)?.count ?? 0;

  return {
    total: raw.total_predictions,
    patients: raw.total_patients,
    uploads: raw.total_uploads,
    normal: count("Normal"),
    mci: count("MCI"),
    dementia: count("Dementia"),
    distribution: CLASSES.map((name) => ({ name, value: count(name) })),
    meanGates: {
      S1: raw.mean_gates?.["s1"] ?? 0,
      S2: raw.mean_gates?.["s2"] ?? 0,
      S3: raw.mean_gates?.["s3"] ?? 0,
      S4: raw.mean_gates?.["s4"] ?? 0,
    },
    meanConfidence: raw.mean_confidence,
    accuracyOnLabelled: raw.accuracy_on_labelled,
    nLabelled: raw.n_labelled,
    dailyCounts: raw.daily_counts ?? [],
  };
}

/* ------------------------------------ model ------------------------------------ */

export interface StreamInfo {
  key: string;
  name: string;
  dim: number;
  description: string;
  clinical_meaning: string;
}

export interface ModelInfo {
  checkpoint: string;
  device: string;
  nParameters: number;
  classNames: ClassLabel[];
  streamDims: Record<string, number>;
  extractorCompatible: boolean;
  streams: StreamInfo[];
  sampleRate: number;
  cropLength: number;
  defaultNCrops: number;
}

export async function modelInfo(): Promise<ModelInfo> {
  const raw = await request<Record<string, never>>("/model/info");
  const r = raw as unknown as {
    checkpoint: string;
    device: string;
    n_parameters: number;
    class_names: ClassLabel[];
    stream_dims: Record<string, number>;
    extractor_compatible: boolean;
    streams: StreamInfo[];
    sample_rate: number;
    crop_length: number;
    default_n_crops: number;
  };
  return {
    checkpoint: r.checkpoint,
    device: r.device,
    nParameters: r.n_parameters,
    classNames: r.class_names,
    streamDims: r.stream_dims,
    extractorCompatible: r.extractor_compatible,
    streams: r.streams,
    sampleRate: r.sample_rate,
    cropLength: r.crop_length,
    defaultNCrops: r.default_n_crops,
  };
}

export interface ModelPerformance {
  split: string;
  checkpoint: string;
  device: string;
  nParameters: number;
  labels: ClassLabel[];
  confusionMatrix: number[][];
  accuracy: number;
  macroF1: number;
  nEvaluated: number;
  elapsedSeconds: number;
  /** Crops actually averaged per recording (a number, or a range when it varies). */
  nCrops: number | number[];
  nCropsRequested: number;
  cropsUniform: boolean;
  perClass: Array<{
    label: ClassLabel;
    precision: number;
    recall: number;
    f1: number;
    support: number;
  }>;
}

export async function modelPerformance(split = "test"): Promise<ModelPerformance> {
  const r = await request<{
    split: string;
    checkpoint: string;
    device: string;
    n_parameters: number;
    labels: ClassLabel[];
    confusion_matrix: number[][];
    accuracy: number;
    macro_f1: number;
    n_evaluated: number;
    elapsed_seconds: number;
    n_crops: number | number[];
    n_crops_requested: number;
    crops_uniform: boolean;
    per_class: ModelPerformance["perClass"];
  }>(`/model/performance${qs({ split })}`);
  return {
    split: r.split,
    checkpoint: r.checkpoint,
    device: r.device,
    nParameters: r.n_parameters,
    labels: r.labels,
    confusionMatrix: r.confusion_matrix,
    accuracy: r.accuracy,
    macroF1: r.macro_f1,
    nEvaluated: r.n_evaluated,
    elapsedSeconds: r.elapsed_seconds,
    nCrops: r.n_crops ?? r.n_crops_requested,
    nCropsRequested: r.n_crops_requested,
    cropsUniform: r.crops_uniform ?? true,
    perClass: r.per_class,
  };
}

export interface Ablation {
  available: boolean;
  /** Ablation rows carry VALIDATION accuracy — `src/train/ablation.py` never
   *  touches the test split. Not comparable to `ModelPerformance.accuracy`. */
  rows: Array<{
    key: string;
    config: string;
    streams: string;
    val_accuracy: number;
    best: boolean;
  }>;
  finding: string | null;
  baselines: Array<{
    model: string;
    params: number;
    params_label: string;
    test_accuracy: number;
    ours: boolean;
  }>;
  baselines_note: string;
}

export const modelAblation = () => request<Ablation>("/model/ablation");

export interface Checkpoint {
  name: string;
  size_bytes: number;
  active: boolean;
  stream_dims: Record<string, number> | null;
  extractor_compatible: boolean | null;
  error: string | null;
}

export const listCheckpoints = () => request<Checkpoint[]>("/model/checkpoints");

/** Swaps the served checkpoint at runtime. Measured performance is invalidated
 * server-side, so `/model/performance` recomputes on the next request. */
export const reloadCheckpoint = (checkpoint: string) =>
  request<unknown>("/model/reload", {
    method: "POST",
    body: JSON.stringify({ checkpoint }),
  });

/* ----------------------------------- dataset ----------------------------------- */

export interface DatasetRecord {
  serial: string;
  class_name: ClassLabel;
  split: string;
  age: number | null;
  symptom: string[];
}

export async function datasetRecords(
  filters: { split?: string; class_name?: string; search?: string; limit?: number } = {},
) {
  return request<{ total: number; items: DatasetRecord[] }>(
    `/dataset/records${qs({ limit: 50, ...filters })}`,
  );
}

export interface DatasetSchema {
  channels: string[];
  bands: Record<string, [number, number]>;
  classes: ClassLabel[];
}

export const datasetSchema = () => request<DatasetSchema>("/dataset/schema");

/* ------------------------------------ health ------------------------------------ */

export interface HealthStatus {
  status: string;
  version: string;
  modelLoaded: boolean;
  modelError: string | null;
  device: string | null;
  checkpoint: string | null;
  extractorCompatible: boolean | null;
  datasetAvailable: boolean;
  database: DatabaseStatus | null;
  paths: Record<string, string>;
}

/** Live view of the store the API is actually writing to. */
export interface DatabaseStatus {
  backend: string;
  url: string;
  schema: string | null;
  /** False for SQLite, which most hosts wipe on restart. */
  persistent: boolean;
  connected: boolean;
  error: string | null;
  counts: Record<string, number | null>;
  warning?: string;
}

export async function apiHealth(): Promise<HealthStatus> {
  const r = await request<{
    status: string;
    version: string;
    model_loaded: boolean;
    model_error: string | null;
    device: string | null;
    checkpoint: string | null;
    extractor_compatible: boolean | null;
    dataset_available: boolean;
    database: DatabaseStatus | null;
    paths: Record<string, string>;
  }>("/health");
  return {
    status: r.status,
    version: r.version,
    modelLoaded: r.model_loaded,
    modelError: r.model_error,
    device: r.device,
    checkpoint: r.checkpoint,
    extractorCompatible: r.extractor_compatible,
    datasetAvailable: r.dataset_available,
    database: r.database ?? null,
    paths: r.paths,
  };
}

/* ------------------------------------ reports ----------------------------------- */

/** Report downloads are plain GETs; the browser needs the token in the URL is
 * not supported, so these are fetched and turned into blobs by the caller. */
export const reportUrl = (id: string, format: "json" | "html" | "pdf") =>
  `${API_URL}/api/reports/${id}${qs({ format })}`;

export async function downloadReport(id: string, format: "json" | "html" | "pdf") {
  const token = getToken();
  const res = await fetch(reportUrl(id, format), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(`Report export failed (${res.status})`, res.status);
  return res.blob();
}
