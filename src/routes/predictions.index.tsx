import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ClassBadge, EmptyState, Panel, StatusBadge, fmtDate } from "@/components/ui-kit";
import { CLASSES, pct, type ClassLabel } from "@/lib/qsfe";
import { getPatient, listAnalyses, useDb } from "@/services/mockApi";

export const Route = createFileRoute("/predictions/")({
  head: () => ({
    meta: [
      { title: "Predictions — QSFE-Net Analysis History" },
      {
        name: "description",
        content: "Full history of QSFE-Net EEG model predictions with class probabilities, confidence and status.",
      },
      { property: "og:title", content: "Predictions — QSFE-Net Analysis History" },
      { property: "og:description", content: "Browse every EEG analysis run through QSFE-Net." },
    ],
  }),
  component: PredictionsPage,
});

function PredictionsPage() {
  const [filter, setFilter] = useState<ClassLabel | "All">("All");
  const rows = useDb(() =>
    listAnalyses().map((a) => ({ ...a, patient: getPatient(a.patientId)?.externalPatientId ?? "—" })),
  );
  const filtered = filter === "All" ? rows : rows.filter((r) => r.prediction === filter);

  return (
    <AppShell title="Predictions" subtitle={`${rows.length} analyses · model predictions, not diagnoses`}>
      <Panel
        title="Analysis history"
        right={
          <div className="flex gap-1">
            {(["All", ...CLASSES] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  filter === c
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="No analyses match this filter"
            body="Upload an EDF recording to run a new QSFE-Net analysis."
            action={{ to: "/upload", label: "New analysis" }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-xs border-b border-border">
                <tr>
                  <th className="py-2 pr-3 font-medium">Analysis ID</th>
                  <th className="py-2 pr-3 font-medium">Patient</th>
                  <th className="py-2 pr-3 font-medium">Prediction</th>
                  <th className="py-2 pr-3 font-medium">Normal</th>
                  <th className="py-2 pr-3 font-medium">MCI</th>
                  <th className="py-2 pr-3 font-medium">Dementia</th>
                  <th className="py-2 pr-3 font-medium">Confidence</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-border/70 last:border-0 hover:bg-secondary/50">
                    <td className="num py-2 pr-3">
                      <Link to="/predictions/$id" params={{ id: a.id }} className="text-primary hover:underline">
                        {a.id}
                      </Link>
                    </td>
                    <td className="num py-2 pr-3">{a.patient}</td>
                    <td className="py-2 pr-3">
                      <ClassBadge label={a.prediction} />
                    </td>
                    <td className="num py-2 pr-3">{pct(a.normalProbability, 1)}</td>
                    <td className="num py-2 pr-3">{pct(a.mciProbability, 1)}</td>
                    <td className="num py-2 pr-3">{pct(a.dementiaProbability, 1)}</td>
                    <td className="num py-2 pr-3">{a.prediction ? pct(a.confidence, 1) : "—"}</td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="num py-2 pr-3 text-muted-foreground">{fmtDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}