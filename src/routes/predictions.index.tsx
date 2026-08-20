import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  ClassBadge,
  EmptyState,
  Kpi,
  Panel,
  SourceBadge,
  TruthBadge,
  fmtDate,
} from "@/components/ui-kit";
import { CLASSES, pct, type ClassLabel } from "@/lib/qsfe";
import { listAnalyses, listPatients } from "@/services/api";

export const Route = createFileRoute("/predictions/")({
  head: () => ({
    meta: [
      { title: "Predictions — QSFE-Net Analysis History" },
      {
        name: "description",
        content:
          "Full history of QSFE-Net EEG model predictions with class probabilities, confidence and status.",
      },
      { property: "og:title", content: "Predictions — QSFE-Net Analysis History" },
      { property: "og:description", content: "Browse every EEG analysis run through QSFE-Net." },
    ],
  }),
  component: PredictionsPage,
});

function PredictionsPage() {
  const [filter, setFilter] = useState<ClassLabel | "All">("All");
  const { data: analyses = [] } = useQuery({ queryKey: ["analyses"], queryFn: listAnalyses });
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: listPatients });

  // History rows carry only patient_id; resolve the display code from the
  // cohort the patients query already loaded.
  const codeById = new Map(patients.map((p) => [p.id, p.code ?? p.id.slice(0, 8)]));
  const rows = analyses.map((a) => ({
    ...a,
    patient: (a.patientId && codeById.get(a.patientId)) || "—",
  }));
  const filtered = filter === "All" ? rows : rows.filter((r) => r.prediction === filter);

  return (
    <AppShell
      title="Predictions"
      subtitle={`${rows.length} analyses · model predictions, not diagnoses`}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Analyses" value={rows.length} sub="in this workspace" />
        {CLASSES.map((c) => (
          <Kpi
            key={c}
            label={c}
            tone={c}
            value={rows.filter((r) => r.prediction === c).length}
            sub="predicted"
          />
        ))}
      </div>

      <Panel
        className="mt-3"
        title="Analysis history"
        right={
          <div className="flex divide-x divide-border overflow-hidden rounded-xs border border-border">
            {(["All", ...CLASSES] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                aria-pressed={filter === c}
                className={`px-2.5 py-1 text-[11px] tracking-wide uppercase transition-colors ${
                  filter === c
                    ? "bg-foreground font-medium text-background"
                    : "text-muted-foreground hover:bg-surface"
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
              <thead className="label-xs border-b-[1.5px] border-border-strong">
                <tr>
                  <th className="py-2 pr-3 font-medium">Analysis ID</th>
                  <th className="py-2 pr-3 font-medium">Patient</th>
                  <th className="py-2 pr-3 font-medium">Prediction</th>
                  <th className="py-2 pr-3 font-medium">Normal</th>
                  <th className="py-2 pr-3 font-medium">MCI</th>
                  <th className="py-2 pr-3 font-medium">Dementia</th>
                  <th className="py-2 pr-3 font-medium">Confidence</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Vs truth</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface"
                  >
                    <td className="num py-2 pr-3">
                      <Link
                        to="/predictions/$id"
                        params={{ id: a.id }}
                        className="text-primary hover:underline"
                      >
                        {a.id}
                      </Link>
                    </td>
                    <td className="num py-2 pr-3">{a.patient}</td>
                    <td className="py-2 pr-3">
                      <ClassBadge label={a.prediction} />
                    </td>
                    <td className="num py-2 pr-3">{pct(a.probabilities.Normal, 1)}</td>
                    <td className="num py-2 pr-3">{pct(a.probabilities.MCI, 1)}</td>
                    <td className="num py-2 pr-3">{pct(a.probabilities.Dementia, 1)}</td>
                    <td className="num py-2 pr-3">{pct(a.confidence, 1)}</td>
                    <td className="py-2 pr-3">
                      <SourceBadge kind={a.sourceKind} />
                    </td>
                    <td className="py-2 pr-3">
                      <TruthBadge truth={a.groundTruth} />
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
