"""Report generation: structured JSON, printable HTML, and PDF.

A report is a snapshot of one analysis — what the model predicted, how confident
it was, which clinical streams drove the decision, and the biomarker values
behind them.
"""

from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from jinja2 import Template

from ..app.constants import CLASS_NAMES, STREAM_INFO, STREAM_KEYS
from .models import Prediction

DISCLAIMER = (
    "Research output only. QSFE-Net is an experimental model and this report is "
    "not a diagnosis. It must not be used for clinical decision-making."
)

LABEL_COLORS = {"Normal": "#2196F3", "MCI": "#FF9800", "Dementia": "#F44336"}


def build_report(prediction: Prediction) -> dict[str, Any]:
    """Assemble the report payload shared by every output format."""
    patient = prediction.patient
    biomarkers = prediction.biomarkers or {}
    summary = biomarkers.get("summary") or {}
    gates = prediction.gates
    total = sum(gates.values()) or 1.0

    return {
        "report_id": prediction.id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": DISCLAIMER,
        "patient": {
            "id": patient.id if patient else None,
            "code": patient.code if patient else None,
            "name": patient.name if patient else None,
            "age": patient.age if patient else None,
            "sex": patient.sex if patient else None,
            "dataset_serial": patient.dataset_serial if patient else None,
        },
        "analysis": {
            "analysed_at": prediction.created_at.isoformat(),
            "source_kind": prediction.source_kind,
            "source_ref": prediction.source_ref,
            "n_crops": prediction.n_crops,
            "recording": prediction.recording,
            "notes": prediction.notes,
        },
        "prediction": {
            "label": prediction.predicted_label,
            "confidence": prediction.confidence,
            "probabilities": prediction.probabilities,
        },
        "gates": {
            "weights": gates,
            "relative_contribution": {k: v / total for k, v in gates.items()},
            "dominant_stream": prediction.dominant_stream,
            "streams": [
                {
                    "key": key,
                    "name": STREAM_INFO[key]["name"],
                    "clinical_meaning": STREAM_INFO[key]["clinical_meaning"],
                    "weight": gates[key],
                    "relative_contribution": gates[key] / total,
                }
                for key in STREAM_KEYS
            ],
        },
        "biomarkers": summary,
        "biomarker_detail": biomarkers,
        "ground_truth": prediction.ground_truth,
        "model": {
            "architecture": "QSFE-Net",
            "checkpoint": prediction.checkpoint,
            "device": prediction.device,
            "version": prediction.model_version,
        },
    }


# --- HTML -------------------------------------------------------------------
HTML_TEMPLATE = Template(
    """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QSFE-Net Report {{ r.report_id[:8] }}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "Segoe UI", system-ui, sans-serif; margin: 0; padding: 40px;
         color: #1a1a1a; background: #fff; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em;
       color: #666; margin: 32px 0 12px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
  .meta { color: #666; font-size: 13px; }
  .verdict { display: flex; align-items: baseline; gap: 12px; margin: 16px 0 8px; }
  .label { font-size: 30px; font-weight: 700; color: {{ color }}; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #eee; }
  th { color: #666; font-weight: 600; font-size: 12px; text-transform: uppercase; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .bar { height: 8px; border-radius: 4px; background: #eee; overflow: hidden; min-width: 120px; }
  .bar > span { display: block; height: 100%; }
  .note { font-size: 12px; color: #888; margin-top: 6px; }
  footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e5e5e5;
           font-size: 12px; color: #999; }
</style>
</head>
<body>
  <h1>QSFE-Net EEG Analysis Report</h1>
  <div class="meta">
    Report {{ r.report_id[:12] }} &middot; generated {{ r.generated_at[:19].replace("T", " ") }} UTC
  </div>

  <h2>Patient</h2>
  <table>
    <tr><th>Identifier</th><td>{{ r.patient.code or r.patient.id or "—" }}</td>
        <th>Name</th><td>{{ r.patient.name or "—" }}</td></tr>
    <tr><th>Age</th><td>{{ r.patient.age if r.patient.age is not none else "—" }}</td>
        <th>Sex</th><td>{{ r.patient.sex or "—" }}</td></tr>
    <tr><th>Dataset serial</th><td>{{ r.patient.dataset_serial or "—" }}</td>
        <th>Analysed</th><td>{{ r.analysis.analysed_at[:19].replace("T", " ") }}</td></tr>
  </table>

  <h2>Prediction</h2>
  <div class="verdict">
    <span class="label">{{ r.prediction.label }}</span>
    <span class="meta">{{ "%.1f"|format(r.prediction.confidence * 100) }}% confidence
      &middot; averaged over {{ r.analysis.n_crops }} crop(s)</span>
  </div>
  <table>
    <tr><th>Class</th><th>Probability</th><th style="width:45%"></th></tr>
    {% for name, prob in r.prediction.probabilities.items() %}
    <tr>
      <td>{{ name }}</td>
      <td class="num">{{ "%.3f"|format(prob) }}</td>
      <td><div class="bar"><span style="width: {{ (prob * 100)|round(1) }}%;
           background: {{ colors[name] }}"></span></div></td>
    </tr>
    {% endfor %}
  </table>

  <h2>Which evidence drove this</h2>
  <table>
    <tr><th>Stream</th><th>Gate</th><th>Share</th><th style="width:35%"></th></tr>
    {% for s in r.gates.streams %}
    <tr>
      <td><strong>{{ s.name }}</strong><div class="note">{{ s.clinical_meaning }}</div></td>
      <td class="num">{{ "%.3f"|format(s.weight) }}</td>
      <td class="num">{{ "%.1f"|format(s.relative_contribution * 100) }}%</td>
      <td><div class="bar"><span style="width: {{ (s.relative_contribution * 100)|round(1) }}%;
           background: #4b6cb7"></span></div></td>
    </tr>
    {% endfor %}
  </table>

  {% if r.biomarkers %}
  <h2>Biomarkers</h2>
  <table>
    {% for key, value in biomarker_rows %}
    <tr><th>{{ key }}</th><td class="num">{{ value }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}

  {% if r.ground_truth %}
  <h2>Dataset ground truth</h2>
  <table>
    <tr><th>Recorded class</th><td>{{ r.ground_truth.class_name }}</td>
        <th>Split</th><td>{{ r.ground_truth.split }}</td>
        <th>Match</th><td>{{ "yes" if r.ground_truth.correct else "no" }}</td></tr>
  </table>
  {% endif %}

  <h2>Model</h2>
  <table>
    <tr><th>Architecture</th><td>{{ r.model.architecture }}</td>
        <th>Checkpoint</th><td>{{ r.model.checkpoint or "—" }}</td>
        <th>Device</th><td>{{ r.model.device or "—" }}</td></tr>
  </table>

  <footer>{{ r.disclaimer }}</footer>
</body>
</html>""",
    autoescape=True,
)

_BIOMARKER_LABELS = {
    "mean_theta_alpha_ratio": "Mean theta/alpha ratio",
    "max_theta_alpha_ratio": "Peak theta/alpha ratio",
    "max_theta_alpha_channel": "Peak channel",
    "mean_spectral_entropy": "Mean spectral entropy",
    "mean_alpha_coherence": "Mean alpha coherence",
    "mean_absolute_asymmetry": "Mean |asymmetry|",
}


def _biomarker_rows(summary: dict[str, Any]) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for key, label in _BIOMARKER_LABELS.items():
        if key not in summary:
            continue
        value = summary[key]
        rows.append((label, f"{value:.3f}" if isinstance(value, (int, float)) else str(value)))
    for band, value in (summary.get("relative_band_power") or {}).items():
        rows.append((f"Relative {band} power", f"{value:.3f}"))
    return rows


def render_html(report: dict[str, Any]) -> str:
    return HTML_TEMPLATE.render(
        r=report,
        colors=LABEL_COLORS,
        color=LABEL_COLORS.get(report["prediction"]["label"], "#333"),
        biomarker_rows=_biomarker_rows(report.get("biomarkers") or {}),
    )


# --- PDF --------------------------------------------------------------------
def render_pdf(report: dict[str, Any]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        title=f"QSFE-Net report {report['report_id'][:8]}",
        author="QSFE-Net ML Server",
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=17, alignment=0, spaceAfter=2)
    meta = ParagraphStyle("meta", parent=styles["Normal"], fontSize=8.5, textColor=colors.grey)
    section = ParagraphStyle(
        "section", parent=styles["Heading2"], fontSize=10.5, spaceBefore=14,
        spaceAfter=6, textColor=colors.HexColor("#444444"),
    )
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=7.5, textColor=colors.grey)

    def table(data: list[list[Any]], widths: list[float], header: bool = True) -> Table:
        tbl = Table(data, colWidths=widths, hAlign="LEFT")
        style = [
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#e6e6e6")),
        ]
        if header:
            style += [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#666666")),
                ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#bbbbbb")),
            ]
        tbl.setStyle(TableStyle(style))
        return tbl

    flow: list[Any] = [
        Paragraph("QSFE-Net EEG Analysis Report", h1),
        Paragraph(
            f"Report {report['report_id'][:12]} &middot; generated "
            f"{report['generated_at'][:19].replace('T', ' ')} UTC",
            meta,
        ),
    ]

    patient = report["patient"]
    flow += [
        Paragraph("Patient", section),
        table(
            [
                ["Identifier", patient.get("code") or patient.get("id") or "—",
                 "Name", patient.get("name") or "—"],
                ["Age", str(patient.get("age") if patient.get("age") is not None else "—"),
                 "Sex", patient.get("sex") or "—"],
                ["Dataset serial", patient.get("dataset_serial") or "—",
                 "Analysed", report["analysis"]["analysed_at"][:19].replace("T", " ")],
            ],
            [32 * mm, 50 * mm, 28 * mm, 60 * mm],
            header=False,
        ),
    ]

    pred = report["prediction"]
    verdict = ParagraphStyle(
        "verdict", parent=styles["Normal"], fontSize=20, leading=24,
        textColor=colors.HexColor(LABEL_COLORS.get(pred["label"], "#333333")),
    )
    prob_rows: list[list[Any]] = [["Class", "Probability", ""]]
    for name, prob in pred["probabilities"].items():
        prob_rows.append([name, f"{prob:.3f}", _bar(prob, LABEL_COLORS.get(name, "#888888"))])

    flow += [
        Paragraph("Prediction", section),
        Paragraph(f"<b>{pred['label']}</b>", verdict),
        Paragraph(
            f"{pred['confidence'] * 100:.1f}% confidence, averaged over "
            f"{report['analysis']['n_crops']} crop(s)",
            meta,
        ),
        Spacer(1, 8),
        table(prob_rows, [40 * mm, 30 * mm, 70 * mm]),
    ]

    gate_rows: list[list[Any]] = [["Stream", "Gate", "Share", ""]]
    for stream in report["gates"]["streams"]:
        gate_rows.append(
            [
                Paragraph(
                    f"<b>{stream['name']}</b><br/><font size=6.5 color='#888888'>"
                    f"{stream['clinical_meaning']}</font>",
                    styles["Normal"],
                ),
                f"{stream['weight']:.3f}",
                f"{stream['relative_contribution'] * 100:.1f}%",
                _bar(stream["relative_contribution"], "#4b6cb7"),
            ]
        )
    flow += [
        Paragraph("Which evidence drove this", section),
        table(gate_rows, [72 * mm, 18 * mm, 18 * mm, 42 * mm]),
    ]

    rows = _biomarker_rows(report.get("biomarkers") or {})
    if rows:
        flow += [
            Paragraph("Biomarkers", section),
            table([["Measure", "Value"]] + [[k, v] for k, v in rows], [90 * mm, 40 * mm]),
        ]

    truth = report.get("ground_truth")
    if truth:
        flow += [
            Paragraph("Dataset ground truth", section),
            table(
                [
                    ["Recorded class", truth.get("class_name") or "—",
                     "Split", truth.get("split") or "—",
                     "Match", "yes" if truth.get("correct") else "no"],
                ],
                [30 * mm, 34 * mm, 16 * mm, 24 * mm, 16 * mm, 20 * mm],
                header=False,
            ),
        ]

    model = report["model"]
    flow += [
        Paragraph("Model", section),
        table(
            [["Architecture", model["architecture"], "Checkpoint", model.get("checkpoint") or "—",
              "Device", model.get("device") or "—"]],
            [26 * mm, 26 * mm, 24 * mm, 44 * mm, 18 * mm, 22 * mm],
            header=False,
        ),
        Spacer(1, 18),
        Paragraph(report["disclaimer"], small),
    ]

    doc.build(flow)
    return buffer.getvalue()


def _bar(fraction: float, color: str):
    """A proportional bar drawn as a two-cell table."""
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Table, TableStyle

    width = 42 * mm
    # Clamp the drawn width, not the fraction — reportlab needs a non-zero
    # column, but a 3 % probability must still look like 3 %.
    filled = min(1.0, max(0.0, float(fraction))) * width
    filled = min(width - 0.6, max(0.6, filled))
    empty = width - filled
    bar = Table([["", ""]], colWidths=[filled, empty], rowHeights=[3.2 * mm])
    bar.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), rl_colors.HexColor(color)),
                ("BACKGROUND", (1, 0), (1, 0), rl_colors.HexColor("#ededed")),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return bar


def compare_matrix(reports: list[dict[str, Any]]) -> dict[str, Any]:
    """Column-wise view of several reports, ready for a comparison chart."""
    return {
        "labels": [r["report_id"][:8] for r in reports],
        "probabilities": {
            name: [r["prediction"]["probabilities"].get(name, 0.0) for r in reports]
            for name in CLASS_NAMES
        },
        "gates": {
            key: [r["gates"]["weights"].get(key, 0.0) for r in reports] for key in STREAM_KEYS
        },
    }
