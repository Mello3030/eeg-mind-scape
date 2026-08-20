# Phase II Report — single-file LaTeX

`report.tex` — everything in one file. Scope is the **web platform**; the
QSFE-Net model is Phase I and appears only as an inference service.

## Build

Not compiled here (no LaTeX toolchain on this machine). Use Overleaf, or:

```bash
pdflatex report && pdflatex report    # second pass for refs + ToC
```

Needs `tikz` and `pgfgantt` — both in TeX Live full and on Overleaf.

## Fill in before submitting

1. **Identity block** at the top of `report.tex`, lines marked `% EDIT` —
   names, guide, department, college, year. Delete `\StudentC` from the
   title-page table if the team is two.
2. **Screenshots** into `figures/`. Six slots; the doc compiles without them
   and prints a labelled placeholder box:
   `01-login.png`, `02-dashboard.png`, `03-upload.png`,
   `04-result-gates.png`, `05-eeg-viewer.png`, `06-performance.png`.
   Start `python backend/run.py --reload` in `ML/` and `npm run dev` in the
   repo root (dev server falls back to 8081 if 8080 is taken).
3. **Check the references.** All 45 are real works or official docs, but
   volume/page numbers were written without web access — verify on Scholar.
4. **Timeline months** were inferred from git history and file timestamps.
   Correct them in the gantt chart and the next-semester table.

## Contents

9 sections matching the required outline, 8 figures (architecture, use case,
class, sequence, block, tech stack, gantt), 13 tables, 45 references.

Everything quantitative is measured from this repo: line and endpoint counts
from the source tree; the latency table from the `timing_ms` column of
`ML/backend/storage/qsfe.db`; the confusion matrix, per-class metrics and gate
activations recomputed independently from the checkpoint and cached test split
(they match what the platform serves). Observation D logs three defects found
during that pass, with fixes scheduled as T-15 to T-17.
