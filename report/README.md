# Phase III Report — single-file LaTeX

Front matter (pages i–iv): title page, Certificate, Declaration, Acknowledgement.
Every numbered section starts on a fresh page (`\sectionbreak` hook).
All identity fields are macros at the top of `report.tex`.


`report.tex` → `report.pdf` (28 pages, compiled and inspected). Scope is the
**web platform**; the QSFE-Net model is Phase I and appears only as an
inference service behind a fixed contract.

## Build

Compiles clean — zero overfull/underfull boxes.

```bash
tectonic report.tex          # what was used here
pdflatex report && pdflatex report   # or, two passes for refs + ToC
```

Needs `tikz` and `pgfgantt`, both in TeX Live full and on Overleaf.

## Contents

9 sections matching the required outline · 17 figures · 13 tables · 46 references.

| Figure | |
| --- | --- |
| 1–5 | Architecture, use case, class, sequence, module block diagrams (TikZ) |
| 6–15 | The 13 screens, captured live (see below) |
| 16 | Technology stack |
| 17 | Gantt timeline |

Section 6.3 is the page-by-page walkthrough: Table 7 lists every route, its
line count, what it does, and the endpoints behind it; Figures 6–15 show them.

## Screenshots

All 13 are real, captured with Playwright at 1500 px against a live instance
(`qsfe_npz_best.pth` on CUDA, 3 users / 15 patients / 5 uploads / 14 analyses).
Re-capture with the script in the scratchpad, or by hand — filenames are
`01-login` … `13-about` in `figures/`. The CORS caveat that used to sit here is
obsolete: `main.py` now sets `allow_origin_regex` to any `localhost`/`127.0.0.1`
port, so whichever port Vite lands on will work. (8080 is usually taken by
EnterpriseDB, so it typically serves on 8081.)

**`09-analysis.png` is out of date.** `/analysis` has since gained two panels —
"Model prediction vs actual diagnosis" and the four-stream "Why this recording
was classified X" explanation — and its channel picker now lists all 19 channels
instead of only Fp1. Re-capture that figure before submitting; the other twelve
are unaffected.

## Still to check

1. **Screenshot dates read 2026.** The capture machine's clock is set to 2026,
   so the dashboard and history tables show "Aug 20, 2026" against a title page
   that says Academic Year 2024-25. Re-capture with the clock corrected if an
   examiner is likely to notice.
2. **Check the references.** All 46 are real works or official docs, but
   volume/page numbers were written without web access — verify on Scholar.
3. **Timeline months** were inferred from git history and file timestamps.
   Correct the gantt chart and Table 13 to your actual schedule.
4. **Re-capture `09-analysis.png`** and reconcile Observation D in `report.tex`
   with the defect list below — both are stale as of the latest fixes.

## Numbers

Everything quantitative is measured from this repo, not transcribed:

- Line/endpoint/route counts — from the source tree.
- Latency (Table 8) — read from the `timing_ms` column of `qsfe.db`.
- Confusion matrix, per-class metrics, gate activations (Tables 9, 10) —
  recomputed independently from the checkpoint and cached test split; they
  match what the platform serves to four decimal places.
- Biomarker reference distributions (`/model/reference`, new) — all 950
  training-split patients decoded through the serving biomarker decoder.

**Worth adding to the report if there is room.** The reference sweep measures
|Cohen's d| between the Normal and Dementia groups for each marker, and it
reproduces the ablation finding from the feature side rather than the accuracy
side: the S1 markers separate the end classes at d = 0.64–0.96 and S2 at
d = 0.70, while S3 (0.16) and S4 (0.17) barely separate them at all. That is an
independent explanation for why S1 + S2 beats the full four-stream model on
validation, and why S3/S4 draw low gate activations — currently the report only
has the accuracy-side evidence for that claim. Regenerate with
`python backend/scripts/build_reference.py`.

Observation D logs five defects found during verification. **Four are now fixed,
and three further defects were found while fixing them — eight in total.**

> ⚠️ **`report.tex` has not been updated.** Its Observation D section still says
> "five defects found, two fixed". Only this README reflects the current state;
> reconcile Section 6.4 and the Observation D table before submitting.

**Fixed:**

- **Obs. 1** — ablation labelled test accuracy when it is validation (Figure 13).
- **Obs. 2** — crop count reported as 5 when only 1 cached crop exists (Figure 13).
- **Obs. 4** — `PATCH /api/analyses/{id}` raised `NameError` → 500. The handler
  called `_get_or_404(db, prediction_id, user)` without declaring
  `user: User = Depends(current_user)`. Adding the dependency both fixes the
  crash and closes the one analyses route the ownership change left unscoped;
  it now returns 200 and 401 without a session.
- **Obs. 5** — `seed.py --cohort N` raised `TypeError` because
  `analyse_dataset_record` gained a required keyword-only `owner_id`. The seed
  now files the cohort against `researcher@qsfe.lab` and scopes the
  already-analysed check by owner. Re-seeded: 9 patients, 4/9 correct.

**Found while fixing the above** (all fixed):

- **Obs. 6** — `notes` was declared on `PredictionDetail` but not
  `PredictionSummary`. `PATCH /api/analyses/{id}` answers with a summary, so the
  one endpoint whose purpose is editing notes returned a body that structurally
  could not contain them, and `updateAnalysisNotes` mapped that `null` straight
  back into the UI. Moved to `PredictionSummary`; history rows carry notes now.
- **Obs. 7** — same schema bug for `ground_truth`, and more visible: every list
  endpoint dropped it, so the **VS TRUTH column on `/predictions`, the dashboard
  and patient timelines was permanently blank** for dataset recordings. The
  `TruthBadge` component was correct all along and was being handed `null`.
  Moved to `PredictionSummary`.
- **Obs. 8** — `/api/analyses/{id}/waveform` returned `channels` = the channels
  *that request asked for*. The viewer fetches one channel at a time, so the
  picker was built from a one-element list and only ever offered Fp1. The
  response now also carries `available_channels`; all 19 are selectable.

**Open:**

- **Obs. 3** — orphaned upload file when scoring fails after storage (T-17).

Obs. 6–8 share one root cause worth a sentence in the report: fields were added
to `PredictionDetail` when the list and summary paths needed them too, and
nothing failed loudly — the UI just rendered blanks.

## Note on the ownership migration

The platform moved from one shared workspace to per-researcher ownership
(`Patient.owner_id`, `scope_of(user)`). Section 5 and the class diagram describe
the new model, and Observation F covers it.

The migration reset the database. With Obs. 5 fixed, `--cohort` repopulates it:
the workspace now holds 3 accounts and a 9-patient CAUEEG cohort owned by
`researcher@qsfe.lab` (4/9 predicted correctly). Table 6 and all screenshots
predate the migration and are labelled "at capture time"; the counts differ from
the current workspace, but the screens render identically and the run is
reproducible again with:

```bash
python backend/scripts/seed.py --cohort 9
```
