import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import {
  ClassBadge,
  EmptyState,
  Kpi,
  Panel,
  Skeleton,
  SourceBadge,
  fmtDate,
} from "@/components/ui-kit";
import { tooltipStyle } from "@/components/views/DashboardView";
import { CLASSES, STREAMS, classColor, pct } from "@/lib/qsfe";
import { getPatient, updatePatient } from "@/services/api";

export const Route = createFileRoute("/patients/$id")({
  head: () => ({
    meta: [
      { title: "Patient Record — QSFE-Net EEG History" },
      {
        name: "description",
        content:
          "Patient EEG recordings, QSFE-Net prediction history, probability trajectory and gate-weight history.",
      },
      { property: "og:title", content: "Patient Record — QSFE-Net EEG History" },
      {
        property: "og:description",
        content: "Longitudinal EEG screening history for one patient.",
      },
    ],
  }),
  component: PatientPage,
});

function PatientPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const {
    data: patient,
    isPending,
    isError,
  } = useQuery({ queryKey: ["patient", id], queryFn: () => getPatient(id), retry: false });
  const data = { patient: patient ?? null, analyses: patient?.analyses ?? [] };
  const [notes, setNotes] = useState<string | null>(null);
  const saveNotes = useMutation({
    mutationFn: (value: string) => updatePatient(id, { notes: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", id] });
      setNotes(null);
    },
  });

  if (isPending) {
    return (
      <AppShell title="Patient" subtitle="Loading record…">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel px-3.5 py-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2.5 h-6 w-20" />
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-[1.35fr_1fr]">
          <Panel title="Loading">
            <Skeleton className="h-48 w-full" />
          </Panel>
          <Panel title="Loading">
            <Skeleton className="h-48 w-full" />
          </Panel>
        </div>
      </AppShell>
    );
  }

  if (isError || !data.patient) {
    return (
      <AppShell title="Patient not found">
        <EmptyState
          title="No such patient"
          body="This record is not present in the workspace."
          action={{ to: "/patients", label: "Back to patients" }}
        />
      </AppShell>
    );
  }

  const p = data.patient;
  const history = [...data.analyses].reverse().map((a, i) => ({
    session: `S${i + 1}`,
    Normal: a.probabilities.Normal,
    MCI: a.probabilities.MCI,
    Dementia: a.probabilities.Dementia,
    S1: a.gateWeights.S1,
    S2: a.gateWeights.S2,
    S3: a.gateWeights.S3,
    S4: a.gateWeights.S4,
  }));
  const latest = data.analyses[0];

  // Group the analyses by the recording they came from: an upload id where one
  // exists, otherwise the dataset serial. Re-analysing a recording adds a row
  // to the history, not a new source.
  const uploads = Object.values(
    data.analyses.reduce<
      Record<
        string,
        {
          key: string;
          label: string;
          sourceKind: string;
          count: number;
          latest: (typeof data.analyses)[number];
        }
      >
    >((acc, a) => {
      const key = a.uploadId ?? a.sourceRef ?? a.id;
      const existing = acc[key];
      if (existing) {
        existing.count += 1;
        if (a.createdAt > existing.latest.createdAt) existing.latest = a;
      } else {
        acc[key] = {
          key,
          label: a.sourceRef ?? key,
          sourceKind: a.sourceKind,
          count: 1,
          latest: a,
        };
      }
      return acc;
    }, {}),
  );

  return (
    <AppShell
      title={`Patient ${p.code ?? p.id.slice(0, 8)}`}
      subtitle={`${p.age ?? "?"} y · ${p.sex ?? "?"} · registered ${fmtDate(p.createdAt)}`}
      actions={
        <Link
          to="/patients"
          className="flex items-center gap-1 rounded-xs border border-border px-2.5 py-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" /> All patients
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Recordings" value={uploads.length} />
        <Kpi label="Analyses" value={data.analyses.length} />
        <Kpi
          label="Latest prediction"
          value={latest?.prediction ?? "—"}
          tone={latest?.prediction ?? undefined}
          sub="model prediction"
        />
        <Kpi label="Latest confidence" value={latest ? pct(latest.confidence, 1) : "—"} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Patient information">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <Item k="Patient code" v={p.code ?? "—"} />
            <Item k="Internal ID" v={p.id} />
            <Item k="Age" v={p.age === null ? "—" : String(p.age)} />
            <Item k="Sex" v={p.sex ?? "—"} />
            <Item k="CAUEEG serial" v={p.datasetSerial ?? "—"} />
          </dl>
          <label className="mt-3 block">
            <span className="label-xs">Notes</span>
            <textarea
              value={notes ?? p.notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-control border border-input bg-card px-3 py-2 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </label>
          <button
            onClick={() => saveNotes.mutate(notes ?? p.notes ?? "")}
            disabled={saveNotes.isPending}
            className="mt-2 rounded-xs border border-border px-2.5 py-1 text-[11px] disabled:opacity-60"
          >
            {saveNotes.isPending ? "Saving…" : "Save notes"}
          </button>
        </Panel>

        <Panel title="Probability history" hint="Class probability trajectory across sessions">
          {history.length === 0 ? (
            <EmptyState title="No analyses yet" body="Upload an EDF recording for this patient." />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="session" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip formatter={(v: number) => pct(v, 1)} contentStyle={tooltipStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {CLASSES.map((c) => (
                    <Line
                      isAnimationActive={false}
                      key={c}
                      type="monotone"
                      dataKey={c}
                      stroke={classColor(c)}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel title="Source recordings" hint="Distinct recordings scored for this patient">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-xs border-b-[1.5px] border-border-strong">
                <tr>
                  <th className="py-2 pr-3 font-medium">Recording</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Analyses</th>
                  <th className="py-2 pr-3 font-medium">Latest prediction</th>
                  <th className="py-2 pr-3 font-medium">Last scored</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((r) => (
                  <tr key={r.key} className="border-b border-border/70 last:border-0">
                    <td className="num py-2 pr-3">{r.label}</td>
                    <td className="py-2 pr-3">
                      <SourceBadge kind={r.sourceKind} />
                    </td>
                    <td className="num py-2 pr-3">{r.count}</td>
                    <td className="py-2 pr-3">
                      <ClassBadge label={r.latest.prediction} />
                    </td>
                    <td className="num py-2 pr-3 text-muted-foreground">
                      {fmtDate(r.latest.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Gate-weight history" hint="Stream contribution per session">
          {history.length === 0 ? (
            <EmptyState
              title="No gate weights"
              body="Gate weights appear once an analysis completes."
            />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="session" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip formatter={(v: number) => v.toFixed(3)} contentStyle={tooltipStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {STREAMS.map((s, i) => (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={s.id}
                      stroke={`var(--chart-${i + 1})`}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mt-3" title="Analysis history">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="label-xs border-b-[1.5px] border-border-strong">
              <tr>
                <th className="py-2 pr-3 font-medium">Analysis</th>
                <th className="py-2 pr-3 font-medium">Prediction</th>
                <th className="py-2 pr-3 font-medium">Confidence</th>
                <th className="py-2 pr-3 font-medium">S1</th>
                <th className="py-2 pr-3 font-medium">S2</th>
                <th className="py-2 pr-3 font-medium">S3</th>
                <th className="py-2 pr-3 font-medium">S4</th>
                <th className="py-2 pr-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {data.analyses.map((a) => (
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
                  <td className="py-2 pr-3">
                    <ClassBadge label={a.prediction} />
                  </td>
                  <td className="num py-2 pr-3">{a.prediction ? pct(a.confidence, 1) : "—"}</td>
                  <td className="num py-2 pr-3">{a.gateWeights.S1.toFixed(3)}</td>
                  <td className="num py-2 pr-3">{a.gateWeights.S2.toFixed(3)}</td>
                  <td className="num py-2 pr-3">{a.gateWeights.S3.toFixed(3)}</td>
                  <td className="num py-2 pr-3">{a.gateWeights.S4.toFixed(3)}</td>
                  <td className="num py-2 pr-3 text-muted-foreground">{fmtDate(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label-xs">{k}</dt>
      <dd className="num mt-0.5">{v}</dd>
    </div>
  );
}
