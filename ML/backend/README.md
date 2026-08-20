# QSFE-Net Backend

Python backend for **QSFE-Net** (Quadrant-Stream Fusion EEG Network) —
three-class EEG classification of **Normal / MCI / Dementia**.

Two layers in one FastAPI app:

- **`app/` — the ML server.** Stateless inference: EDF in, prediction + gate
  weights + biomarkers out.
- **`api/` — the application layer.** Patients, stored recordings, prediction
  history, comparison and report export, on SQLite.

Neither layer trains anything, writes to `outputs/`, or modifies the research
code in `src/` — it loads `src/datasets/feature_extraction.py` and
`src/models/qsfe_net.py` by file path so the features computed at serving time
are byte-for-byte the ones used in training.

---

## Quick start

```bash
# from the repository root
pip install -r backend/requirements.txt        # torch: install from pytorch.org first
python backend/run.py --reload
```

Then open <http://127.0.0.1:8000/docs>.

Verify the whole stack without starting a server:

```bash
python backend/scripts/smoke_test.py           # ML server      (add --no-edf to skip the slow path)
python backend/scripts/api_smoke_test.py       # application layer (throwaway DB)
```

---

## What it does

```
EDF upload ──► 19 EEG channels ──► N deterministic 10 s crops ──► z-normalise
           ──► S1 S2 S3 S4 features ──► QSFE-Net ──► averaged probabilities
                                                  + gate weights
                                                  + decoded biomarkers
```

Because a recording is minutes long but the model sees 10 s, several evenly
spaced crops are scored and their softmax probabilities and gate weights are
averaged (`QSFE_DEFAULT_N_CROPS`, default 5).

The **gate weights** are the point of the architecture: they say how much each
clinical stream drove *this* prediction. Every response carries them, alongside
`biomarkers` — the same feature vectors decoded into named quantities
(theta/alpha ratio per channel, band power per channel, alpha coherence per
electrode pair, spectral entropy, left/right asymmetry) ready to plot.

| Stream | Meaning | Dim |
|---|---|---|
| S1 | Frequency slowing: theta/alpha ratio + delta/theta/alpha/beta power, per channel | 95 |
| S2 | Coherence, 171 channel pairs × 4 bands | 684 |
| S3 | Spectral entropy per channel (complexity) | 19 |
| S4 | Hemispheric asymmetry, 8 symmetric pairs × 4 bands | 32 |

---

## ML endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness, model status, resolved paths |
| GET | `/model/info` | Architecture, stream dims, class names, parameters |
| GET | `/model/checkpoints` | Every `.pth` under `outputs/`, with the dims it needs |
| POST | `/model/reload` | Swap the active checkpoint or device at runtime |
| POST | `/predict` | Score an uploaded EDF (multipart `file`) |
| POST | `/predict/features` | Score precomputed `s1..s4` vectors |
| POST | `/predict/record/{serial}` | Score a CAUEEG patient from the local dataset |
| GET | `/dataset` | Split/class counts, task metadata |
| GET | `/dataset/records` | Browse annotations (filter by split, class, search) |
| GET | `/dataset/records/{serial}` | One patient record |
| GET | `/dataset/schema` | Channel names, bands, stream descriptions |

Shared query flags on the predict endpoints: `n_crops`, `include_biomarkers`,
`include_per_crop`.

### Examples

```bash
curl -F "file=@caueeg-dataset/signal/edf/00001.edf" \
     "http://127.0.0.1:8000/predict?n_crops=5"

# a known patient, using the cached .npz crops (fast — no signal processing)
curl -X POST "http://127.0.0.1:8000/predict/record/00789?n_crops=3"

curl "http://127.0.0.1:8000/dataset/records?split=test&class_name=Dementia&limit=5"
```

### Response shape (`/predict`)

```jsonc
{
  "prediction":    { "class_index": 1, "label": "MCI", "confidence": 0.46 },
  "probabilities": { "Normal": 0.31, "MCI": 0.46, "Dementia": 0.23 },
  "gates": {
    "weights":               { "s1": 0.41, "s2": 0.62, "s3": 0.35, "s4": 0.48 },
    "relative_contribution": { "s1": 0.22, "s2": 0.33, "s3": 0.19, "s4": 0.26 },
    "dominant_stream": "s2",
    "dominant_stream_name": "Coherence",
    "streams": [ { "key": "s1", "name": "Frequency slowing", "weight": 0.41, "...": 0 } ]
  },
  "n_crops_scored": 5,
  "biomarkers": {
    "summary":           { "mean_theta_alpha_ratio": 0.59, "mean_spectral_entropy": 4.1, "...": 0 },
    "frequency_slowing": { "channels": ["Fp1", "..."], "theta_alpha_ratio": [0.5], "band_power": {} },
    "coherence":         { "mean_by_band": {}, "top_alpha_pairs": [], "lowest_alpha_pairs": [] },
    "complexity":        { "channels": [], "spectral_entropy": [] },
    "asymmetry":         { "pairs": [], "by_band": {}, "most_asymmetric": {} }
  },
  "recording":  { "sample_rate": 200.0, "duration_seconds": 728.0, "crop_starts": [0] },
  "timing_ms":  { "feature_extraction": 1600.0, "model": 2.0, "total": 1780.0 },
  "model":      { "checkpoint": "qsfe_npz_best.pth", "device": "cuda" },
  "source":     { "kind": "upload", "filename": "00001.edf" },
  "ground_truth": null
}
```

`ground_truth` is filled in only by `/predict/record/{serial}`, where the dataset
label is known — useful for demo screens that show predicted vs. actual.

---

## Application endpoints

Everything under `/api` persists to the database.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/patients` | Create a patient |
| GET | `/api/patients` | List/search patients (name, code, dataset serial) |
| GET · PATCH · DELETE | `/api/patients/{id}` | Read, edit, delete (cascades to analyses and files) |
| POST | `/api/analyses` | **Upload an EDF, score it, store it** (multipart: `file`, `patient_id`, `notes`, `n_crops`) |
| POST | `/api/analyses/from-record/{serial}` | Score a CAUEEG patient and store it with its ground truth |
| POST | `/api/analyses/{id}/reanalyse` | Re-score a stored recording with the current checkpoint |
| GET · DELETE | `/api/analyses/{id}` | Full stored result / delete |
| PATCH | `/api/analyses/{id}` | Edit clinician notes |
| GET | `/api/analyses/{id}/recording` | Download the source EDF |
| GET | `/api/history` | Filter past results: patient, label, source, date range, min confidence |
| GET | `/api/history/stats` | Dashboard aggregates: counts by label, mean gates, accuracy on labelled data, daily volume |
| GET | `/api/history/patients/{id}/timeline` | One patient's analyses over time, with the direction of change |
| GET | `/api/history/compare?ids=a,b,c` | 2–8 analyses side by side (probability, gate and biomarker matrices) |
| GET | `/api/reports/{id}?format=json\|html\|pdf` | Export one analysis as a report |
| GET | `/api/reports/{id}/summary` | Report without the bulky per-channel detail |
| GET | `/api/reports?ids=a,b` | Multi-analysis comparison payload |

```bash
# analyse and file under a patient
curl -F "file=@recording.edf" -F "patient_id=<id>" -F "notes=first visit" http://127.0.0.1:8000/api/analyses

curl "http://127.0.0.1:8000/api/history?label=Dementia&min_confidence=0.6"
curl -o report.pdf "http://127.0.0.1:8000/api/reports/<analysis-id>?format=pdf"
```

### Data model

```
Patient ──< Upload ──< Prediction
   └────────────────────< Prediction
```

- **Patient** — `code` (MRN, unique), name, age, sex, notes, optional
  `dataset_serial` linking to a CAUEEG patient.
- **Upload** — the stored EDF: filename, path, size, **SHA-256**, sample rate,
  duration. Files are content-addressed under `storage/uploads/<yyyy>/<mm>/`, so
  re-uploading the same recording reuses the stored copy.
- **Prediction** — one scoring run. Class probabilities and the four gate weights
  are **columns** (so they can be filtered and averaged in SQL); biomarkers,
  per-crop detail, recording metadata and ground truth are JSON alongside.

`storage/` (SQLite database + uploaded recordings) is gitignored.

### Verify it

```bash
python backend/scripts/api_smoke_test.py    # 23 checks, throwaway DB and storage
```

---

## Configuration

Every setting has a default and can be overridden by a `QSFE_`-prefixed
environment variable or `backend/.env` (see `.env.example`). Paths resolve
relative to the repository root — nothing is hardcoded to `D:\Major`.

| Variable | Default | Notes |
|---|---|---|
| `QSFE_CHECKPOINT_SUBPATH` | `outputs/qsfe_npz_best.pth` | Active model |
| `QSFE_DATASET_SUBDIR` | `caueeg-dataset` | Optional; catalog degrades gracefully |
| `QSFE_FEATURE_SUBDIR` | `outputs/features_multicrop` | Cached `.npz` crops |
| `QSFE_DEVICE` | `auto` | `auto` / `cpu` / `cuda` |
| `QSFE_DEFAULT_N_CROPS` | `5` | Crops averaged per recording |
| `QSFE_MAX_UPLOAD_MB` | `300` | Upload cap |
| `QSFE_CORS_ORIGINS` | localhost 3000/5173 | JSON list, for the future frontend |
| `QSFE_DATABASE_URL` | `sqlite:///backend/storage/qsfe.db` | Any SQLAlchemy URL |
| `QSFE_STORAGE_SUBDIR` | `backend/storage` | Database + uploaded recordings |
| `QSFE_KEEP_UPLOADS` | `true` | Set false to discard EDF files after scoring |

---

## Checkpoint compatibility

`src/models/qsfe_net.py` hardcodes each stream's input dimension and has been
edited between experiments (S1 has been both 19 and 95). The server therefore
**ignores those hardcoded dims** and rebuilds every encoder from the shapes
stored in the checkpoint, then reports whether the result matches the current
extractor:

- `qsfe_npz_best.pth` — S1=95, matches the current extractor. **Usable.** Test
  accuracy through this server: **53.4 %** (centre crop, 118 test patients).
- `qsfe_best.pth`, `qsfe_run7_58.82.pth` — S1=19, S2=171, S4=8: an older feature
  layout the current extractor no longer produces. They load, but `/predict` and
  `/predict/record` reject them with a 422 explaining the mismatch;
  `/predict/features` still works if you supply matching vectors.
- `outputs/ablation/*.pth` — different module names (`encoders.s1.*`), reported
  with an `error` in `/model/checkpoints` rather than silently failing.

`GET /model/checkpoints` shows this for every checkpoint, so the frontend can
offer only the usable ones.

---

## Layout

```
backend/
├── app/
│   ├── main.py           FastAPI app, CORS, lifespan, exception handlers
│   ├── config.py         Settings — every path relative to the repo root
│   ├── constants.py      Channels, bands, class names, stream metadata
│   ├── research.py       Loads src/ modules by file path (never mutates them)
│   ├── preprocessing.py  EDF reading, resampling, deterministic cropping
│   ├── features.py       Thin wrapper over the research extractors
│   ├── biomarkers.py     Feature vectors -> named, plottable quantities
│   ├── model.py          Checkpoint introspection + thread-safe registry
│   ├── inference.py      Orchestration and multi-crop aggregation
│   ├── catalog.py        Read-only CAUEEG annotations + cached .npz
│   ├── schemas.py        Pydantic request/response models
│   └── routers/          system.py, predict.py, dataset.py
├── api/                  APPLICATION LAYER
│   ├── db.py             SQLAlchemy engine, session, schema creation
│   ├── models.py         Patient, Upload, Prediction
│   ├── schemas.py        Pydantic contracts for /api
│   ├── crud.py           All SQL lives here; routers stay thin
│   ├── storage.py        Content-addressed EDF storage (SHA-256)
│   ├── service.py        "predict, then persist" — the seam between layers
│   ├── reporting.py      JSON / HTML / PDF reports
│   └── routers/          patients.py, analyses.py, history.py, reports.py
├── scripts/
│   ├── smoke_test.py     ML server, end-to-end (10 checks)
│   └── api_smoke_test.py Application layer, end-to-end (23 checks)
├── storage/              SQLite DB + uploaded recordings (gitignored)
├── requirements.txt
└── .env.example
```

---

## Notes / limitations

- Feature extraction is the bottleneck: coherence over 171 channel pairs costs
  roughly **0.6–0.8 s per crop** on CPU, so a 5-crop upload takes a few seconds.
  The model forward pass itself is ~2 ms. Requests run in a threadpool so the
  server stays responsive.
- Uploads with a sample rate other than 200 Hz are resampled to 200 Hz
  (`QSFE_RESAMPLE_UPLOADS=false` to disable); the response reports
  `recording.resampled_from`.
- The first 19 channels are used, assuming the CAUEEG montage order
  (`Fp1 F3 C3 P3 O1 Fp2 F4 C4 P4 O2 F7 T3 T5 F8 T4 T6 Fz Cz Pz`, then EKG and
  Photic). Recordings in a different channel order will produce meaningless
  asymmetry and coherence features — channel-name-based remapping is not
  implemented yet.
- The model is a research artefact at ~53–59 % test accuracy on a 3-class
  problem. It is **not** a diagnostic tool, and any UI built on it should say so.
