import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ClassBadge, EmptyState, Panel, fmtDate } from "@/components/ui-kit";
import { analysesForPatient, listPatients, listRecordings, useDb } from "@/services/mockApi";

export const Route = createFileRoute("/patients/")({
  head: () => ({
    meta: [
      { title: "Patients — QSFE-Net Cohort Registry" },
      {
        name: "description",
        content: "De-identified patient registry with EEG recordings, analysis counts and latest QSFE-Net predictions.",
      },
      { property: "og:title", content: "Patients — QSFE-Net Cohort Registry" },
      { property: "og:description", content: "Browse the de-identified EEG screening cohort." },
    ],
  }),
  component: PatientsPage,
});

function PatientsPage() {
  const [q, setQ] = useState("");
  const rows = useDb(() =>
    listPatients().map((p) => {
      const analyses = analysesForPatient(p.id);
      return {
        ...p,
        analyses: analyses.length,
        recordings: listRecordings(p.id).length,
        latest: analyses[0] ?? null,
      };
    }),
  );
  const filtered = rows.filter((r) => r.externalPatientId.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell
      title="Patients"
      subtitle={`${rows.length} de-identified records in this workspace`}
      actions={
        <Link to="/upload" className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          New analysis
        </Link>
      }
    >
      <Panel
        title="Cohort registry"
        right={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search patient ID…"
            className="w-44 rounded border border-input bg-card px-2 py-1 text-xs"
          />
        }
      >
        {filtered.length === 0 ? (
          <EmptyState title="No patients found" body="Adjust the search or upload a new EEG recording." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-xs border-b border-border">
                <tr>
                  <th className="py-2 pr-3 font-medium">Patient ID</th>
                  <th className="py-2 pr-3 font-medium">Age</th>
                  <th className="py-2 pr-3 font-medium">Sex</th>
                  <th className="py-2 pr-3 font-medium">Recordings</th>
                  <th className="py-2 pr-3 font-medium">Analyses</th>
                  <th className="py-2 pr-3 font-medium">Latest prediction</th>
                  <th className="py-2 pr-3 font-medium">Last analysed</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/70 last:border-0 hover:bg-secondary/50">
                    <td className="num py-2 pr-3">
                      <Link to="/patients/$id" params={{ id: p.id }} className="text-primary hover:underline">
                        {p.externalPatientId}
                      </Link>
                    </td>
                    <td className="num py-2 pr-3">{p.age}</td>
                    <td className="num py-2 pr-3">{p.sex}</td>
                    <td className="num py-2 pr-3">{p.recordings}</td>
                    <td className="num py-2 pr-3">{p.analyses}</td>
                    <td className="py-2 pr-3">
                      <ClassBadge label={p.latest?.prediction ?? null} />
                    </td>
                    <td className="num py-2 pr-3 text-muted-foreground">
                      {p.latest ? fmtDate(p.latest.createdAt) : "—"}
                    </td>
                    <td className="num py-2 pr-3 text-muted-foreground">{p.latest?.status ?? "NO DATA"}</td>
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