# QSFE-Net — EEG Dementia Screening Research Platform

**Deep Learning-Based Cross-Dataset EEG Analysis for Early Dementia Detection**

> Research prototype — **not for clinical diagnosis**. Every output is a *model
> prediction*, never a confirmed diagnosis.

## What this repository contains

This is the **frontend application** (React 19 + Vite + TanStack Router,
Tailwind CSS, shadcn/ui, Recharts, Lucide, TanStack Query). It implements the
complete research-dashboard product surface and runs standalone against a local
mock API layer, so the whole workflow is usable before the Node/Python services
are attached.

| Route | Purpose |
| --- | --- |
| `/login`, `/register` | Demo auth (researcher / administrator roles) |
| `/dashboard` (and `/`) | KPI cards, distribution, gate weights, recent analyses |
| `/patients`, `/patients/:id` | Cohort registry, recordings, probability & gate history |
| `/upload` | Drag-and-drop EDF upload, validation, UPLOAD → PROCESSING → COMPLETED |
| `/predictions`, `/predictions/:id` | History and the full interpretability report |
| `/analysis` | 19-channel EEG viewer + four feature-stream tabs |
| `/model` | Interactive architecture diagram + gate analysis |
| `/performance` | Curves, confusion matrix, per-class metrics, ablation, baselines |
| `/about`, `/settings` | Scientific background, limitations, environment config |

## Model summary (Run 8, CAUEEG)

| Metric | Value |
| --- | --- |
| Test accuracy | 53.39% |
| Validation accuracy | 53.78% |
| Macro F1 | 0.5226 |
| Trainable parameters | 79,431 |

Feature streams (830 features total): **S1** frequency slowing 95, **S2**
inter-electrode coherence 684, **S3** spectral entropy 19, **S4** hemispheric
asymmetry 32. Each encoder maps `n → 64 → 32`; the four 32-d embeddings are
concatenated to 128, scaled by four sigmoid gates, then classified `128 → 64 → 3`.

Gate weights describe **stream contribution**, not causal medical explanations.

### Baselines (reported openly)

| Model | Parameters | Test accuracy |
| --- | --- | --- |
| QSFE-Net | 79,431 | 53.39% |
| CEEDNet Single | 25.7M | 77.32% |
| CEEDNet Ensemble | 253.8M | 79.16% |

Ablation finding: **S1 + S2 (55.51%) outperforms the full four-stream model
(53.39%)** — at this dataset scale S3 and S4 add noise, consistent with their low
learned gate activations.

## Running the frontend

```bash
bun install     # or npm install
bun run dev     # http://localhost:8080
```

Demo data (patients, recordings, analyses, gate weights) is seeded in the browser
on first load and can be reseeded from **Settings → Reseed workspace**.

## Data flow / intended architecture

```
React (this repo)
   → Express API  → PostgreSQL / Prisma
                  → Python FastAPI → QSFE-Net (PyTorch)
```

`src/services/mockApi.ts` is the single seam: its function signatures mirror the
API below, so replacing it with an Axios client pointed at `VITE_API_URL` swaps
mock data for the live backend with no page changes.

### API surface (Express)

```
POST /api/auth/register        POST /api/auth/login        GET /api/auth/me
GET  /api/patients             POST /api/patients
GET  /api/patients/:id         PUT  /api/patients/:id
POST /api/eeg/upload           GET  /api/eeg/:id
POST /api/analyses             GET  /api/analyses
GET  /api/analyses/:id         GET  /api/analyses/:id/status
GET  /api/dashboard/stats
GET  /api/model                GET  /api/model/performance
GET  /api/model/gates          GET  /api/model/ablation
```

### ML service (FastAPI)

```
GET  /health
POST /predict   →  { prediction, probabilities: { normal, mci, dementia },
                     confidence, gateWeights: { S1, S2, S3, S4 }, modelVersion }
```

Pipeline: EDF → MNE load → trim to 300 s → 0.5–30 Hz band-pass → 30 s crop →
S1/S2/S3/S4 extraction → QSFE-Net → probabilities + gate weights.

### Data model (Prisma / PostgreSQL)

`User`, `Patient`, `EEGRecording`, `Analysis`, `GateWeight`, `FeatureSummary`,
`ModelVersion` — mirrored by the TypeScript interfaces in
`src/services/mockApi.ts`.

## MOCK_INFERENCE

With `MOCK_INFERENCE=true` no PyTorch checkpoint is required. Results are
generated demo values and are labelled as demo data everywhere they appear. Real
model predictions are never fabricated silently.

## Environment

See `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `ML_SERVICE_URL`,
`VITE_API_URL`, `MOCK_INFERENCE`).

---

<details>
<summary>Lovable project info</summary>

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
</details>
