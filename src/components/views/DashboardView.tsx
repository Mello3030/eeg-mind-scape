import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
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
  SourceBadge,
  TruthBadge,
  fmtDate,
} from "@/components/ui-kit";
import { CLASSES, MODEL, STREAMS, classColor, pct } from "@/lib/qsfe";
import {
  type ClassLabel,
  dashboardStats,
  listAnalyses,
  modelInfo,
  modelPerformance,
} from "@/services/api";

const axis = { stroke: "var(--muted-foreground)", fontSize: 11 } as const;

export function DashboardView() {
  const { data: stats } = useQuery({ queryKey: ["dashboardStats"], queryFn: dashboardStats });
  const { data: analyses } = useQuery({ queryKey: ["analyses"], queryFn: listAnalyses });
  const { data: model } = useQuery({
    queryKey: ["modelInfo"],
    queryFn: modelInfo,
    staleTime: 5 * 60_000,
  });
  const { data: perf, error: perfError } = useQuery({
    queryKey: ["modelPerformance", "test"],
    queryFn: () => modelPerformance("test"),
    staleTime: 30 * 60_000,
    retry: false,
  });

  const rows = analyses ?? [];
  const data = {
    stats: stats ?? {
      total: 0,
      normal: 0,
      mci: 0,
      dementia: 0,
      patients: 0,
      nLabelled: 0,
      accuracyOnLabelled: null as number | null,
      meanConfidence: 0,
      distribution: CLASSES.map((c) => ({ name: c, value: 0 })),
    },
    analyses: rows.slice(0, 8),
    // Workspace-wide figures come from /api/history/stats, which aggregates
    // server-side over every record. Fetching the patient list purely to count
    // it was the single most expensive request on this page.
    patients: stats?.patients ?? 0,
    trend: buildTrend(stats?.dailyCounts),
  };

  // Mean gate activation per predicted class, measured across this workspace's
  // own analyses — these are the gates the model actually produced, not a
  // published summary statistic.
  const gateCounts = Object.fromEntries(
    CLASSES.map((c) => [c, rows.filter((a) => a.prediction === c).length]),
  ) as Record<ClassLabel, number>;

  const gateData = STREAMS.map((stream) => {
    const entry: Record<string, string | number | null> = { stream: stream.id };
    for (const cls of CLASSES) {
      const values = rows.filter((a) => a.prediction === cls).map((a) => a.gateWeights[stream.id]);
      // null leaves a gap in the chart. Zero would render a full-height-zero bar
      // that reads as a measured gate of 0.000 rather than "no analyses yet".
      entry[cls] = values.length ? values.reduce((x, y) => x + y, 0) / values.length : null;
    }
    return entry;
  });
  const gatedAnalyses = rows.length;
  const gateBasis = CLASSES.map((c) => `${c} ${gateCounts[c]}`).join(" · ");

  return (
    <AppShell
      title="Research Dashboard"
      subtitle={`QSFE-Net · ${model?.checkpoint ?? "loading"} · ${MODEL.dataset.name} · ${MODEL.dataset.channels} channels @ ${MODEL.dataset.samplingRate} Hz`}
      actions={
        <Link
          to="/upload"
          className="rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          New analysis
        </Link>
      }
    >
      {/* Two distinct populations, so they get two labelled groups rather than one
          undifferentiated strip: counts measured over this workspace's analyses,
          and facts measured over the held-out CAUEEG test split. */}
      <div className="grid gap-3 xl:grid-cols-[5fr_3fr]">
        <section>
          <h2 className="label-xs mb-1.5">This workspace</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Kpi label="Analyses" value={data.stats.total} sub={`${data.patients} patients`} />
            <Kpi label="Normal" value={data.stats.normal} tone="Normal" sub="predicted" />
            <Kpi label="MCI" value={data.stats.mci} tone="MCI" sub="predicted" />
            <Kpi label="Dementia" value={data.stats.dementia} tone="Dementia" sub="predicted" />
            <Kpi
              label="Mean confidence"
              value={pct(data.stats.meanConfidence, 1)}
              sub="across analyses"
            />
          </div>
        </section>

        <section>
          <h2 className="label-xs mb-1.5">Model · held-out test split</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi
              label="Test accuracy"
              value={perfError ? "—" : perf ? pct(perf.accuracy) : "…"}
              sub={perfError ? "unavailable" : perf ? `${perf.nEvaluated} patients` : "measuring"}
            />
            <Kpi
              label="Macro F1"
              value={perfError ? "—" : perf ? perf.macroF1.toFixed(4) : "…"}
              sub={perfError ? "unavailable" : "3-class average"}
            />
            <Kpi
              label="Parameters"
              value={model ? model.nParameters.toLocaleString() : "…"}
              sub="trainable"
            />
          </div>
        </section>
      </div>

      {/* The old first two panels here re-plotted numbers that are already KPI
          tiles directly above (per-class counts; accuracy and macro F1). Replaced
          with the per-class breakdown, which is where the model's actual weakness
          shows and which no tile carries. */}
      <div className="mt-4 grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <Panel
          title="Per-class performance"
          hint={
            perfError
              ? "unavailable"
              : perf
                ? `${perf.checkpoint} · ${perf.split} split · precision, recall and F1 per class`
                : "measuring against the local test split…"
          }
        >
          {perfError ? (
            <p className="flex h-56 items-center justify-center px-6 text-center text-xs leading-relaxed text-muted-foreground">
              {perfError instanceof Error ? perfError.message : "Evaluation failed."} Needs a loaded
              checkpoint and the cached feature crops under <span className="num">outputs/</span>.
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={perf?.perClass ?? []}
                  margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} {...axis} />
                  <Tooltip formatter={(v: number) => v.toFixed(3)} contentStyle={tooltipStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    isAnimationActive={false}
                    dataKey="precision"
                    fill="var(--chart-1)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="recall"
                    fill="var(--chart-2)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="f1"
                    fill="var(--chart-3)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Agreement with CAUEEG truth"
          hint={
            data.stats.nLabelled
              ? `${data.stats.nLabelled} of ${data.stats.total} analyses have a known CAUEEG label`
              : "no dataset recordings analysed yet"
          }
        >
          {/* Replaces a doughnut that restated the class-distribution bars beside
              it. This is the one number on the dashboard comparing predictions
              against a verified label, so it is worth the panel. */}
          {data.stats.nLabelled ? (
            <div className="flex h-56 flex-col items-center justify-center gap-1">
              <div className="num text-4xl font-medium">
                {pct(data.stats.accuracyOnLabelled ?? 0, 1)}
              </div>
              <div className="label-xs">correct on labelled recordings</div>
              <div className="mt-3 w-full max-w-56">
                <div className="h-2 overflow-hidden rounded-xs bg-secondary">
                  <div
                    className="h-full rounded-control bg-primary transition-all"
                    style={{ width: `${(data.stats.accuracyOnLabelled ?? 0) * 100}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                  <span className="num">
                    {Math.round((data.stats.accuracyOnLabelled ?? 0) * data.stats.nLabelled)}/
                    {data.stats.nLabelled} correct
                  </span>
                  <span>chance 33.3%</span>
                </div>
              </div>
              <p className="mt-3 px-4 text-center text-[11px] leading-relaxed text-muted-foreground">
                Only CAUEEG dataset recordings carry ground truth. Uploads have no verified label
                and are excluded.
              </p>
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center px-6">
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                Score a CAUEEG dataset recording to compare predictions against a known label.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <Panel
          title="Stream gate weights"
          hint={`Mean gate activation per predicted class over ${gatedAnalyses} analyses (${gateBasis}) — stream contribution, not causal explanation`}
        >
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gateData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="stream" {...axis} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} {...axis} />
                <Tooltip formatter={(v: number) => v.toFixed(3)} contentStyle={tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {CLASSES.map((c) => (
                  <Bar
                    isAnimationActive={false}
                    key={c}
                    dataKey={c}
                    fill={classColor(c)}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Analyses over time" hint="Completed analyses per day in this workspace">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="analyses"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-3"
        title="Recent analyses"
        right={
          <Link to="/predictions" className="text-[11px] font-medium text-primary">
            View all
          </Link>
        }
      >
        {!data.analyses.length ? (
          <EmptyState
            title="No analyses yet"
            body="Upload an EDF recording or score a CAUEEG dataset record to see results here."
            action={{ to: "/upload", label: "New analysis" }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-xs border-b-[1.5px] border-border-strong">
                <tr>
                  <th className="py-2 pr-3 font-medium">Analysis</th>
                  <th className="py-2 pr-3 font-medium">Prediction</th>
                  <th className="py-2 pr-3 font-medium">Confidence</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Vs truth</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
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
                        title={a.id}
                      >
                        {a.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <ClassBadge label={a.prediction} />
                    </td>
                    <td className="num py-2 pr-3">{pct(a.confidence)}</td>
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

export const tooltipStyle = {
  fontSize: 11,
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
} as const;

/**
 * Daily analysis counts for the trend chart.
 *
 * `/api/history/stats` aggregates this server-side over every prediction and
 * returns it in ascending date order, so it is neither capped by the 200-row
 * history page nor dependent on the client's clock. Days with no analyses are
 * absent from that payload; they are filled with 0 here so the x-axis stays
 * continuous and a gap does not read as a straight line between two dates.
 */
function buildTrend(daily: Array<{ date: string; count: number }> | undefined) {
  if (!daily?.length) return [];

  const counts = new Map(daily.map((d) => [d.date, d.count]));
  const first = new Date(`${daily[0]!.date}T00:00:00Z`);
  const last = new Date(`${daily[daily.length - 1]!.date}T00:00:00Z`);

  const out: Array<{ day: string; count: number }> = [];
  for (let d = first; d <= last; d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key.slice(5), count: counts.get(key) ?? 0 });
  }
  return out;
}
