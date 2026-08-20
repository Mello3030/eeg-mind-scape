"""Report export: JSON, printable HTML, and PDF."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, JSONResponse, Response
from sqlalchemy.orm import Session

from .. import crud, reporting
from ..db import get_db
from ..models import Prediction

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _get_or_404(db: Session, prediction_id: str) -> Prediction:
    prediction = crud.get_prediction(db, prediction_id)
    if prediction is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No analysis '{prediction_id}'.")
    return prediction


@router.get("/{prediction_id}")
def get_report(
    prediction_id: str,
    format: str = Query("json", pattern="^(json|html|pdf)$"),
    download: bool = Query(False, description="Send as an attachment."),
    db: Session = Depends(get_db),
) -> Response:
    """One analysis rendered as a report."""
    prediction = _get_or_404(db, prediction_id)
    report = reporting.build_report(prediction)
    stem = f"qsfe-report-{prediction_id[:8]}"

    if format == "json":
        return JSONResponse(report)

    if format == "html":
        html = reporting.render_html(report)
        headers = (
            {"Content-Disposition": f'attachment; filename="{stem}.html"'} if download else None
        )
        return HTMLResponse(html, headers=headers)

    pdf = reporting.render_pdf(report)
    disposition = "attachment" if download else "inline"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{stem}.pdf"'},
    )


@router.get("/{prediction_id}/summary")
def get_report_summary(prediction_id: str, db: Session = Depends(get_db)) -> dict:
    """The report without the bulky per-channel biomarker detail."""
    report = reporting.build_report(_get_or_404(db, prediction_id))
    report.pop("biomarker_detail", None)
    return report


@router.get("")
def compare_reports(
    ids: str = Query(..., description="Comma-separated analysis ids (2-8)."),
    db: Session = Depends(get_db),
) -> dict:
    """Column-wise comparison payload for several analyses."""
    wanted = [i.strip() for i in ids.split(",") if i.strip()]
    if not 2 <= len(wanted) <= 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide between 2 and 8 ids.")

    rows = crud.get_predictions_by_ids(db, wanted)
    missing = set(wanted) - {row.id for row in rows}
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown analyses: {sorted(missing)}")

    reports = [reporting.build_report(row) for row in rows]
    for report in reports:
        report.pop("biomarker_detail", None)
    return {"reports": reports, "matrix": reporting.compare_matrix(reports)}
