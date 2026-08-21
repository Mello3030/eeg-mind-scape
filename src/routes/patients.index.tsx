import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ClassBadge, EmptyState, Kpi, Panel, fmtDate } from "@/components/ui-kit";
import { pct } from "@/lib/qsfe";
import { listPatients } from "@/services/api";

export const Route = createFileRoute("/patients/")({
  head: () => ({
    meta: [
      { title: "Patients — QSFE-Net Cohort Registry" },
      {
        name: "description",
        content:
          "De-identified patient registry with EEG recordings, analysis counts and latest QSFE-Net predictions.",
      },
      { property: "og:title", content: "Patients — QSFE-Net Cohort Registry" },
      { property: "og:description", content: "Browse the de-identified EEG screening cohort." },
    ],
  }),
  component: PatientsPage,
});

function PatientsPage() {
  const [q, setQ] = useState("");
  const { data: rows = [] } = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const needle = q.toLowerCase();
  const filtered = rows.filter((r) =>
    [r.code, r.name, r.datasetSerial].some((v) => (v ?? "").toLowerCase().includes(needle)),
  );
  const totals = {
    uploads: rows.reduce((n, r) => n + r.uploads, 0),
    analyses: rows.reduce((n, r) => n + r.analyses, 0),
    unanalysed: rows.filter((r) => !r.analyses).length,
  };

  return (
    <AppShell
      title="Patients"
      subtitle={`${rows.length} de-identified records in this workspace`}
      actions={
        <Link
          to="/upload"
          className="rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          New analysis
        </Link>
      }
    >
      {/* Cohort summary derived from the same rows the table renders — no extra
          request, and it gives the page a Level-2 band above the registry. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Patients" value={rows.length} sub="de-identified" />
        <Kpi label="Recordings" value={totals.uploads} sub="source EDF files" />
        <Kpi label="Analyses" value={totals.analyses} sub="scored runs" />
        <Kpi
          label="Awaiting analysis"
          value={totals.unanalysed}
          sub={totals.unanalysed ? "no prediction yet" : "all scored"}
        />
      </div>

      <Panel
        className="mt-3"
        title="Cohort registry"
        right={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            aria-label="Search patients by ID, name or dataset serial"
            placeholder="Search ID, name, serial…"
            className="w-44 rounded-control border border-input bg-card px-2 py-1 text-xs"
          />
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="No patients found"
            body="Adjust the search or upload a new EEG recording."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-xs border-b-[1.5px] border-border-strong">
                <tr>
                  <th className="py-2 pr-3 font-medium">Patient ID</th>
                  <th className="py-2 pr-3 font-medium">Age</th>
                  <th className="py-2 pr-3 font-medium">Sex</th>
                  <th className="py-2 pr-3 font-medium">Recordings</th>
                  <th className="py-2 pr-3 font-medium">Analyses</th>
                  <th className="py-2 pr-3 font-medium">Latest prediction</th>
                  <th className="py-2 pr-3 font-medium">Confidence</th>
                  <th className="py-2 pr-3 font-medium">Last analysed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface"
                  >
                    <td className="num py-2 pr-3">
                      <Link
                        to="/patients/$id"
                        params={{ id: p.id }}
                        className="text-primary hover:underline"
                      >
                        {p.code ?? p.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="num py-2 pr-3">{p.age ?? "—"}</td>
                    <td className="num py-2 pr-3">{p.sex ?? "—"}</td>
                    <td className="num py-2 pr-3">{p.uploads}</td>
                    <td className="num py-2 pr-3">{p.analyses}</td>
                    <td className="py-2 pr-3">
                      <ClassBadge label={p.latest?.prediction ?? null} />
                    </td>
                    <td className="num py-2 pr-3">
                      {p.latest ? pct(p.latest.confidence, 1) : "—"}
                    </td>
                    <td className="num py-2 pr-3 text-muted-foreground">
                      {p.latest ? fmtDate(p.latest.createdAt) : "—"}
                    </td>
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
