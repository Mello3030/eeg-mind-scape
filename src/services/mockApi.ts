/**
 * Frontend-only mock API layer.
 *
 * Every function here mirrors an endpoint of the Express backend documented in
 * the project README. Swap this module for an Axios client pointed at
 * VITE_API_URL to go live - signatures are identical.
 *
 * All inference results produced here are MOCK data (MOCK_INFERENCE mode) and
 * are labelled as such in the UI. They are never presented as real model output.
 */
import { useEffect, useState } from "react";
import { CHANNELS_19, CLASSES, GATE_WEIGHTS, MODEL, type ClassLabel } from "@/lib/qsfe";

export const MOCK_INFERENCE = true;

export type Sex = "M" | "F" | "Other";
export type RecordingStatus = "UPLOAD" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface Patient {
  id: string;
  externalPatientId: string;
  age: number;
  sex: Sex;
  notes: string;
  createdAt: string;
}

export interface EEGRecording {
  id: string;
  patientId: string;
  filename: string;
  filePath: string;
  samplingRate: number;
  channels: number;
  duration: number;
  status: RecordingStatus;
  createdAt: string;
  hasWaveform: boolean;
}

export interface Analysis {
  id: string;
  eegRecordingId: string;
  patientId: string;
  modelVersion: string;
  status: RecordingStatus;
  prediction: ClassLabel | null;
  normalProbability: number;
  mciProbability: number;
  dementiaProbability: number;
  confidence: number;
  gateWeights: { S1: number; S2: number; S3: number; S4: number };
  featureSummary: {
    s1: { thetaAlphaRatio: number; alphaPeakHz: number; thetaPower: number };
    s2: { meanCoherence: number; frontalPosterior: number; interhemispheric: number };
    s3: { meanEntropy: number; minEntropy: number; maxEntropy: number };
    s4: { meanAsymmetry: number; frontalAsymmetry: number; temporalAsymmetry: number };
  };
  mock: boolean;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

interface DB {
  patients: Patient[];
  recordings: EEGRecording[];
  analyses: Analysis[];
}

const KEY = "qsfe.db.v1";
let db: DB = { patients: [], recordings: [], analyses: [] };
const listeners = new Set<() => void>();

const emit = () => {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(db));
  listeners.forEach((l) => l());
};

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const iso = (daysAgo: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, (daysAgo * 7) % 60, 0, 0);
  return d.toISOString();
};

function rand(seed: number) {
  let s = seed || 7;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function probsFor(label: ClassLabel, r: () => number) {
  const base = { Normal: [0.5, 0.28, 0.22], MCI: [0.26, 0.49, 0.25], Dementia: [0.22, 0.28, 0.5] }[label];
  const raw = base.map((b) => Math.max(0.05, b + (r() - 0.5) * 0.16));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / sum);
}

function makeAnalysis(
  patientId: string,
  recordingId: string,
  label: ClassLabel,
  createdAt: string,
  seedValue: number,
): Analysis {
  const r = rand(seedValue);
  const p = probsFor(label, r);
  const n = p[0] ?? 0.34;
  const m = p[1] ?? 0.33;
  const d = p[2] ?? 0.33;
  const g = GATE_WEIGHTS[label];
  const jitter = (v: number) => Math.min(0.999, Math.max(0.01, v + (r() - 0.5) * 0.05));
  return {
    id: uid("an"),
    eegRecordingId: recordingId,
    patientId,
    modelVersion: MODEL.version,
    status: "COMPLETED",
    prediction: label,
    normalProbability: n,
    mciProbability: m,
    dementiaProbability: d,
    confidence: Math.max(n, m, d),
    gateWeights: { S1: jitter(g.S1), S2: jitter(g.S2), S3: jitter(g.S3), S4: jitter(g.S4) },
    featureSummary: {
      s1: { thetaAlphaRatio: 0.6 + r() * 1.4, alphaPeakHz: 7.5 + r() * 3, thetaPower: 0.15 + r() * 0.2 },
      s2: { meanCoherence: 0.32 + r() * 0.3, frontalPosterior: 0.28 + r() * 0.3, interhemispheric: 0.35 + r() * 0.3 },
      s3: { meanEntropy: 0.72 + r() * 0.2, minEntropy: 0.55 + r() * 0.1, maxEntropy: 0.9 + r() * 0.08 },
      s4: {
        meanAsymmetry: (r() - 0.5) * 0.4,
        frontalAsymmetry: (r() - 0.5) * 0.5,
        temporalAsymmetry: (r() - 0.5) * 0.3,
      },
    },
    mock: true,
    createdAt,
    completedAt: createdAt,
    errorMessage: null,
  };
}

function seed(): DB {
  const spec: Array<[string, number, Sex, ClassLabel[], string]> = [
    ["CAU-0142", 71, "F", ["MCI", "MCI", "Dementia"], "Longitudinal follow-up, 6-month interval."],
    ["CAU-0187", 64, "M", ["Normal", "Normal"], "Control cohort, no reported complaints."],
    ["CAU-0203", 78, "M", ["Dementia", "Dementia"], "Referred after MMSE decline."],
    ["CAU-0219", 69, "F", ["MCI"], "Subjective memory complaints."],
    ["CAU-0244", 58, "F", ["Normal"], "Baseline recording."],
    ["CAU-0261", 74, "M", ["MCI", "Normal"], "Repeat session after medication change."],
    ["CAU-0288", 81, "F", ["Dementia"], "Marked cortical slowing noted by clinician."],
    ["CAU-0301", 66, "M", ["Normal", "MCI"], "Screening programme participant."],
  ];
  const out: DB = { patients: [], recordings: [], analyses: [] };
  let day = 42;
  spec.forEach(([ext, age, sex, labels, notes], pi) => {
    const patient: Patient = {
      id: uid("pt"),
      externalPatientId: ext,
      age,
      sex,
      notes,
      createdAt: iso(day + 5),
    };
    out.patients.push(patient);
    labels.forEach((label, li) => {
      const createdAt = iso(day, 9 + li);
      const rec: EEGRecording = {
        id: uid("eeg"),
        patientId: patient.id,
        filename: `${ext}_s${li + 1}.edf`,
        filePath: `/uploads/${ext}_s${li + 1}.edf`,
        samplingRate: 200,
        channels: 19,
        duration: 280 + li * 9,
        status: "COMPLETED",
        createdAt,
        hasWaveform: false,
      };
      out.recordings.push(rec);
      out.analyses.push(makeAnalysis(patient.id, rec.id, label, createdAt, pi * 37 + li * 11 + 3));
      day -= 4;
    });
    day -= 2;
  });
  return out;
}

export function initDb() {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.patients?.length) {
        db = parsed;
        return;
      }
    } catch {
      /* fall through to reseed */
    }
  }
  db = seed();
  emit();
}

export function resetDb() {
  db = seed();
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive read hook: recomputes `select` whenever the mock DB changes. */
export function useDb<T>(select: (database: DB) => T): T {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    initDb();
    setValue(select(db));
    return subscribe(() => setValue(select(db)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (value ?? select(db)) as T;
}

/* ---------------------------------- reads --------------------------------- */

export const listPatients = () => db.patients;
export const getPatient = (id: string) =>
  db.patients.find((p) => p.id === id || p.externalPatientId === id) ?? null;
export const listAnalyses = () => [...db.analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const getAnalysis = (id: string) => db.analyses.find((a) => a.id === id) ?? null;
export const getRecording = (id: string) => db.recordings.find((r) => r.id === id) ?? null;
export const listRecordings = (patientId: string) => db.recordings.filter((r) => r.patientId === patientId);
export const analysesForPatient = (patientId: string) => listAnalyses().filter((a) => a.patientId === patientId);

export function dashboardStats() {
  const analyses = db.analyses.filter((a) => a.status === "COMPLETED");
  const count = (c: ClassLabel) => analyses.filter((a) => a.prediction === c).length;
  return {
    total: db.analyses.length,
    normal: count("Normal"),
    mci: count("MCI"),
    dementia: count("Dementia"),
    patients: db.patients.length,
    recordings: db.recordings.length,
    distribution: CLASSES.map((c) => ({ name: c, value: count(c) })),
  };
}

/* --------------------------------- writes --------------------------------- */

export function createPatient(input: { externalPatientId: string; age: number; sex: Sex; notes?: string }) {
  const existing = db.patients.find((p) => p.externalPatientId === input.externalPatientId);
  if (existing) return existing;
  const patient: Patient = {
    id: uid("pt"),
    externalPatientId: input.externalPatientId,
    age: input.age,
    sex: input.sex,
    notes: input.notes ?? "",
    createdAt: new Date().toISOString(),
  };
  db.patients = [patient, ...db.patients];
  emit();
  return patient;
}

export function updatePatient(id: string, patch: Partial<Patient>) {
  db.patients = db.patients.map((p) => (p.id === id ? { ...p, ...patch } : p));
  emit();
}

/** POST /api/eeg/upload + POST /api/analyses, then polls the ML service. */
export function uploadAndAnalyse(input: {
  externalPatientId: string;
  age: number;
  sex: Sex;
  notes?: string;
  filename: string;
  onStatus?: (s: RecordingStatus, analysisId: string) => void;
}) {
  const patient = createPatient(input);
  const recording: EEGRecording = {
    id: uid("eeg"),
    patientId: patient.id,
    filename: input.filename,
    filePath: `/uploads/${input.filename}`,
    samplingRate: 200,
    channels: 19,
    duration: 300,
    status: "PROCESSING",
    createdAt: new Date().toISOString(),
    hasWaveform: false,
  };
  const pending: Analysis = {
    ...makeAnalysis(patient.id, recording.id, "Normal", new Date().toISOString(), Date.now() % 9000),
    status: "PROCESSING",
    prediction: null,
    completedAt: null,
  };
  db.recordings = [recording, ...db.recordings];
  db.analyses = [pending, ...db.analyses];
  emit();
  input.onStatus?.("PROCESSING", pending.id);

  window.setTimeout(() => {
    const label = CLASSES[Math.floor(Math.random() * 3)] ?? "Normal";
    const finished = makeAnalysis(patient.id, recording.id, label, pending.createdAt, Date.now() % 9000);
    db.analyses = db.analyses.map((a) => (a.id === pending.id ? { ...finished, id: pending.id } : a));
    db.recordings = db.recordings.map((r) =>
      r.id === recording.id ? { ...r, status: "COMPLETED" as RecordingStatus } : r,
    );
    emit();
    input.onStatus?.("COMPLETED", pending.id);
  }, 2600);

  return { patient, recording, analysisId: pending.id };
}

/** Placeholder for GET /api/eeg/:id/waveform - no synthetic EEG is fabricated. */
export function getWaveform(): { channels: string[]; data: number[][] } | null {
  return null;
}

export const EEG_CHANNELS = CHANNELS_19;