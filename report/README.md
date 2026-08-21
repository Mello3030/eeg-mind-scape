# Phase II Report — single-file LaTeX

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
`01-login` … `13-about` in `figures/`. Note the backend CORS allow-list covers
ports 8080–8082, 3000 and 5173 only; if Vite falls through to 8083 the client
will fail CORS.

## Still to fill in

1. **Identity block** at the top of `report.tex`, lines marked `% EDIT` —
   names, guide, department, college, year. Delete `\StudentC` from the
   title-page table if the team is two.
2. **Check the references.** All 46 are real works or official docs, but
   volume/page numbers were written without web access — verify on Scholar.
3. **Timeline months** were inferred from git history and file timestamps.
   Correct the gantt chart and Table 13 to your actual schedule.

## Numbers

Everything quantitative is measured from this repo, not transcribed:

- Line/endpoint/route counts — from the source tree.
- Latency (Table 8) — read from the `timing_ms` column of `qsfe.db`.
- Confusion matrix, per-class metrics, gate activations (Tables 9, 10) —
  recomputed independently from the checkpoint and cached test split; they
  match what the platform serves to four decimal places.

Observation D logs three defects found during verification. **Obs. 1** (ablation
labelled test accuracy when it is validation) and **Obs. 2** (crop count
reported as 5 when only 1 cached crop exists) have been fixed in the codebase
and the fixes are visible in Figure 13. **Obs. 3** (orphaned upload file when
scoring fails after storage) is still open, scheduled as T-17.
