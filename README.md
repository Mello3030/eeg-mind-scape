# QSFE-Net — EEG Dementia Screening Research Platform

**Deep Learning-Based Cross-Dataset EEG Analysis for Early Dementia Detection**

> Research prototype — **not for clinical diagnosis**. Every output is a *model
> prediction*, never a confirmed diagnosis.

## Architecture

Two tiers. The React frontend talks directly to one FastAPI backend, which owns
inference, storage, and accounts.

```
src/                    React 19, Vite, TanStack Router + Query, Tailwind, Recharts
  └── services/api.ts   the only module that knows the wire format
        │  HTTP (VITE_API_URL, default http://localhost:8000)
        ▼
ML/backend/             FastAPI
  ├── app/              inference: EDF → features → QSFE-Net → gates + biomarkers
  └── api/              accounts, patients, uploads, history, reports (SQLAlchemy)
        │
        ├── ML/src/         research code, loaded by file path — never mutated
        ├── ML/outputs/     checkpoints (.pth) + ablation results
        └── ML/caueeg-dataset/  annotations, EDF signals, cached feature crops
```

There is no mock mode. If no checkpoint loads, scoring returns 503 rather than a
placeholder, and the UI says so.

| Route | Purpose |
| --- | --- |
| `/login`, `/register` | JWT auth (researcher / administrator roles); signup needs the invite code |
| `/dashboard` (and `/`) | KPIs, distribution, measured gate weights, recent analyses |
| `/patients`, `/patients/:id` | Cohort registry, source recordings, probability & gate history |
| `/upload` | Drag-and-drop EDF upload; scoring is synchronous |
| `/predictions`, `/predictions/:id` | History and the full interpretability report |
| `/analysis` | EEG viewer (all 19 channels) + predicted-vs-actual + per-stream decoded biomarkers |
| `/model` | Architecture diagram + measured gate analysis |
| `/performance` | Confusion matrix, per-class metrics, ablation, baselines |
| `/about`, `/settings` | Background, limitations, checkpoint switching, environment |

## Running it

Two processes.

```bash
# 1. API  (needs torch, scipy, pyEDFlib — see ML/backend/requirements.txt)
cd ML
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env     # optional; every value has a default
python backend/scripts/seed.py --cohort 9   # demo accounts + real scored cohort
python backend/run.py --reload              # http://127.0.0.1:8000  (/docs for OpenAPI)

# 2. Frontend
npm install
cp .env.example .env
npm run dev                                 # http://localhost:8080
```

Demo accounts from the seed: `researcher@qsfe.lab` and `admin@qsfe.lab`,
password `research123`. `--cohort N` scores N real CAUEEG test patients so the
dashboard opens with genuine predictions and known ground truth.

### Database

SQLite by default (`ML/backend/storage/qsfe.db`) — no external service needed.

For Postgres/Neon, set `QSFE_DATABASE_URL` in `ML/backend/.env`. Note this is a
**SQLAlchemy** URL, not a Prisma one: libpq rejects unknown keywords, so drop
Prisma's `pgbouncer=true` and `schema=` parameters and set the schema with
`QSFE_DB_SCHEMA` instead:

```
QSFE_DATABASE_URL=postgresql+psycopg2://USER:PASS@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require
QSFE_DB_SCHEMA=qsfe
```

`QSFE_DB_SCHEMA` confines every table to one Postgres schema, so this project
cannot collide with unrelated tables in a shared database. The schema is created
on startup if missing.

### Auth

Passwords are hashed with Argon2id; sessions are stateless HS256 JWTs. **Set
`QSFE_JWT_SECRET`** before exposing the server — without it the app falls back to
a public development secret and logs a warning at startup.

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Registration is gated by a shared invite code so a reachable instance does not
collect accounts from strangers. It defaults to `passcode`; change it with
`QSFE_REGISTRATION_CODE` in `ML/backend/.env`, or set it empty to open signups.
The check runs in `POST /api/auth/register` — the form field is a convenience,
and posting to the endpoint directly without the code returns 403. It is one
secret shared by everyone, with no per-invite tracking or revocation, so it
slows drive-by signups rather than controlling access.

## Where the numbers come from

Nothing in the UI is transcribed. Every figure is either measured on demand or
parsed from the file the training run wrote:

| Shown | Source |
| --- | --- |
| Parameter count, stream dims, device | `/model/info` — read from the loaded checkpoint |
| Test accuracy, macro F1, confusion matrix, per-class metrics | `/model/performance` — scores the CAUEEG test split with the active checkpoint |
| Ablation table and finding (validation accuracy) | `/model/ablation` — parses `outputs/ablation/ablation_results.txt` |
| Gate activations per class | Averaged over the analyses in the workspace |
| Biomarkers | Decoded from the feature vectors of each prediction |
| Reference distributions behind the `/analysis` explanation | `/model/reference` — every training-split patient decoded through the same biomarker decoder |
| Waveforms | Read from the source EDF, decimated for display |

Measured performance is cached per checkpoint and recomputed when you switch
checkpoints from **Settings → Checkpoints**.

### Model summary (`qsfe_npz_best.pth`)

Measured through this server on the 118-patient CAUEEG test split. The test
split has one cached feature crop per patient, so each figure is a 1-crop
result — `n_crops` is an upper bound, and `/model/performance` reports the
number actually averaged:

| Metric | Value |
| --- | --- |
| Test accuracy | 53.39% |
| Macro F1 | 0.5226 |
| Trainable parameters | 79,431 |

Feature streams (830 features): **S1** frequency slowing 95, **S2** coherence
684, **S3** spectral entropy 19, **S4** hemispheric asymmetry 32. Each encoder
maps `n → 64 → 32`; the four 32-d embeddings concatenate to 128, are scaled by
four sigmoid gates, then classified `128 → 64 → 3`.

Gate weights describe **stream contribution**, not causal medical explanations.

### Why a recording was classified the way it was

`/analysis` explains each prediction stream by stream. A gate weight alone cannot
do that — it says how hard the model leaned on a stream, not what the stream saw —
so each decoded biomarker is placed against the distribution of Normal, MCI and
Dementia patients in the **training split** (950 patients, `/model/reference`).

Precompute it once; the sweep takes a few minutes and the result is checkpoint-independent:

```bash
python backend/scripts/build_reference.py     # writes outputs/reference/biomarker_reference.json
```

Measured on the training split, with |Cohen's d| between the Normal and Dementia groups:

| Marker | Stream | Normal | MCI | Dementia | Separation |
| --- | --- | --- | --- | --- | --- |
| Relative theta power | S1 | 0.108 | 0.141 | 0.180 | 0.96 |
| Mean theta/alpha ratio | S1 | 0.943 | 1.311 | 1.980 | 0.85 |
| Mean alpha coherence | S2 | 0.303 | 0.282 | 0.268 | 0.70 |
| Relative alpha power | S1 | 0.236 | 0.201 | 0.167 | 0.64 |
| Mean absolute asymmetry | S4 | 0.142 | 0.150 | 0.150 | 0.17 |
| Mean spectral entropy | S3 | 3.936 | 3.896 | 3.859 | 0.16 |

**This is the ablation result seen from the feature side.** The S1 and S2 markers
separate the end classes (d = 0.64–0.96); the S3 and S4 markers barely move
(d ≈ 0.16), which is why S1 + S2 beats the full four-stream model on validation
and why those two streams draw low gate activations. Marker *direction* is
measured here too — the sign of the Dementia-minus-Normal difference — rather than
transcribed from the literature, and it reproduces the expected picture: slowing
up, alpha power down, coherence down, entropy down.

Three rules keep the explanation honest:

- A marker further than 3 SD from **every** class mean is reported as off-range
  and given no vote — "nearest class" is meaningless out there.
- A marker with negligible separation (d < 0.2) is displayed but excluded from the
  agreement tally.
- MCI's reference mean lies *between* the other two classes on every marker, so a
  merely middling value lands nearest MCI by default. The UI says so whenever the
  predicted class is the intermediate one.

The readout summarises the same features the network consumed, so agreement is not
an independent second opinion — only disagreement is genuinely informative.

### Ablation (from `ablation_results.txt`)

These are **validation** accuracies, not test. `src/train/ablation.py` builds only
a train and a validation loader and returns `best_val_acc`; the test split is
never touched. They are not comparable to the 53.39% test accuracy above.

| Configuration | Validation accuracy |
| --- | --- |
| S1 only | 46.22% |
| **S1 + S2** | **58.82%** |
| S1 + S2 + S3 | 49.58% |
| Full (S1–S4), gated | 55.46% |
| Full, no gating | 55.46% |

**S1 + S2 outperforms the full four-stream model on validation.** At this dataset
scale the entropy and asymmetry streams add more noise than signal — consistent
with their low learned gate activations. Note 58.82% is exactly 70/119, the
validation split size.

### Baselines (published, not measured here)

| Model | Parameters | Test accuracy |
| --- | --- | --- |
| QSFE-Net | 79,431 | 53.39% |
| CEEDNet Single | 25.7M | 77.32% |
| CEEDNet Ensemble | 253.8M | 79.16% |

## API surface

```
POST /api/auth/register     POST /api/auth/login      GET  /api/auth/me

GET/POST /api/patients      GET/PATCH/DELETE /api/patients/{id}

POST /api/analyses                        (multipart: file, patient_id, notes, n_crops)
                                          patient_id is required — a stored analysis
                                          must belong to one; use /predict otherwise
POST /api/analyses/from-record/{serial}   score a CAUEEG patient with known ground truth
POST /api/analyses/{id}/reanalyse
GET  /api/analyses/{id}                   full result incl. biomarkers
GET  /api/analyses/{id}/waveform          decimated EEG for the viewer
GET  /api/analyses/{id}/recording         download the source EDF

GET  /api/history           /api/history/stats   /api/history/compare?ids=...
GET  /api/history/patients/{id}/timeline
GET  /api/reports/{id}?format=json|html|pdf

GET  /health   /model/info   /model/performance   /model/ablation   /model/reference
GET  /model/checkpoints      POST /model/reload
GET  /dataset  /dataset/records  /dataset/schema
POST /predict  /predict/features  /predict/record/{serial}    (stateless)
```

Verify the backend without a browser:

```bash
python backend/scripts/smoke_test.py       # inference layer
python backend/scripts/api_smoke_test.py   # application layer, throwaway DB
```

## Pipeline

```
EDF → pyEDFlib read (first 19 channels) → resample to 200 Hz if needed
    → N evenly spaced 10 s crops → per-channel z-normalisation
    → S1/S2/S3/S4 extraction (830 features) → QSFE-Net
    → probabilities + gates averaged across crops → decoded biomarkers
```

Feature extraction dominates the cost: coherence over 171 channel pairs runs
~0.7 s per crop on CPU, while the forward pass is ~2 ms. A 5-crop upload takes a
few seconds.

Channel order follows the CAUEEG montage
(`Fp1 F3 C3 P3 O1 Fp2 F4 C4 P4 O2 F7 T3 T5 F8 T4 T6 Fz Cz Pz`), and the first 19
channels are used positionally. **Recordings in a different channel order will
produce meaningless asymmetry and coherence features** — name-based remapping is
not implemented.

## Repository layout notes

- **`ML/` is a separate git repository** (`github.com/Sanchit-Raut/Major`) checked
  out inside this one. It is listed in `.gitignore` so the outer repo cannot
  commit a gitlink to a submodule that was never registered. Decide whether to
  register it as a real submodule or absorb it before relying on a fresh clone.
- **`server/` and `ml-service/` are superseded** by `ML/backend` and are no longer
  wired to anything. `server/` was an Express + Prisma app layer duplicating
  `ML/backend/api/`; `ml-service/` was a FastAPI stub whose `MOCK_INFERENCE` mode
  returned values derived from a hash of the filename. Both are kept on disk for
  reference and gitignored; delete them once you are satisfied with the new stack.

## Limitations

- ~53% three-class accuracy: above the 33% chance level, far below clinical
  reliability. This is a research artefact, not a diagnostic tool.
- Predictions are grouped by the class the model predicted, never by a verified
  clinical label — except for dataset recordings, where the CAUEEG ground truth
  is shown alongside and marked as such.
- **Uploads named after a CAUEEG serial are matched to their label.** An upload
  called `00014.edf` is looked up as serial `00014`; the label is attached with
  `inferred_from: "filename"`, and the UI presents it as inferred rather than
  verified, because a filename proves nothing. Where the dataset EDF is on disk
  the file is hashed against it: a match upgrades this to `content_sha256`, and
  a mismatch attaches no label at all, so a renamed file cannot borrow another
  patient's diagnosis. Serials outside the three-class benchmark
  (`parkinson_synd`, `tga`, `ftd`, `nph`) are never labelled.
- **Ground truth exists only for CAUEEG dataset recordings.** `dementia.json`
  ships `class_name`, `class_label`, `age` and `symptom` for the 1187 patients in
  its train/validation/test splits, and that is what every match/miss badge reads.
  `annotation.json` covers all 1379 recordings but carries *no* class label, so it
  cannot be used as a truth source; uploaded EDFs have no label at all and are
  reported as "not scoreable" rather than silently counted as wrong.
- Uploads whose sample rate differs from 200 Hz are resampled; the response
  reports `recording.resampled_from`.
