import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { ClassBadge, Kpi, Panel, StatusBadge, fmtDate } from "@/components/ui-kit";
import { CLASSES, GATE_WEIGHTS, MODEL, STREAMS, classColor, pct } from "@/lib/qsfe";
import { dashboardStats, listAnalyses, listPatients, useDb } from "@/services/mockApi";

const axis = { stroke: "var(--muted-foreground)", fontSize: 11 } as const;

export function DashboardView() {
  const data = useDb(() => ({
    stats: dashboardStats(),
    analyses: listAnalyses().slice(0, 8),
    patients: listPatients().length,
    trend: buildTrend(),
  }));

  const gateData = STREAMS.map((s) => ({
    stream: s.id,
    Normal: GATE_WEIGHTS.Normal[s.id],
    MCI: GATE_WEIGHTS.MCI[s.id],
    Dementia: GATE_WEIGHTS.Dementia[s.id],
  }));

  return (
    <AppShell
      title="Research Dashboard"
      subtitle={`QSFE-Net ${MODEL.version} · CAUEEG · ${MODEL.dataset.channels} channels @ ${MODEL.dataset.samplingRate} Hz`}
      actions={
        <Link
          to="/upload"
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          New analysis
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Total analyses" value={data.stats.total} sub={`${data.patients} patients`} />
        <Kpi label="Normal" value={data.stats.normal} tone="Normal" sub="model prediction" />
        <Kpi label="MCI" value={data.stats.mci} tone="MCI" sub="model prediction" />
        <Kpi label="Dementia" value={data.stats.dementia} tone="Dementia" sub="model prediction" />
        <Kpi label="Test accuracy" value={pct(MODEL.testAccuracy)} sub="held-out test split" />
        <Kpi label="Macro F1" value={MODEL.macroF1.toFixed(4)} sub="3-class average" />
        <Kpi label="Parameters" value={MODEL.parameterCount.toLocaleString()} sub="trainable" />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <Panel title="Prediction distribution" hint="Completed analyses in this workspace">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stats.distribution} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="name" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" name="analyses" radius={[2, 2, 0, 0]}>
                  {data.stats.distribution.map((d) => (
                    <Cell key={d.name} fill={classColor(d.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Model performance" hint="Run 8 evaluation metrics">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { metric: "Test acc", value: MODEL.testAccuracy },
                  { metric: "Val acc", value: MODEL.validationAccuracy },
                  { metric: "Macro F1", value: MODEL.macroF1 },
                ]}
                margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="metric" {...axis} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} {...axis} />
                <Tooltip formatter={(v: number) => pct(v)} contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="var(--primary)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Class distribution" hint="Share of predicted classes">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.stats.distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={75}
                  strokeWidth={1}
                >
                  {data.stats.distribution.map((d) => (
                    <Cell key={d.name} fill={classColor(d.name)} />
                  ))}
                </Pie>
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel
          title="Stream gate weights"
          hint="Mean sigmoid gate activation per class (Run 8) — stream contribution, not causal explanation"
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
                  <Bar key={c} dataKey={c} fill={classColor(c)} radius={[2, 2, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Analyses over time" hint="Completed analyses per week in this workspace">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="week" {...axis} />
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="label-xs border-b border-border">
              <tr>
                <th className="py-2 pr-3 font-medium">Analysis</th>
                <th className="py-2 pr-3 font-medium">Prediction</th>
                <th className="py-2 pr-3 font-medium">Confidence</th>
                <th className="py-2 pr-3 font-medium">Model</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.analyses.map((a) => (
                <tr key={a.id} className="border-b border-border/70 last:border-0 hover:bg-secondary/50">
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
                  <td className="num py-2 pr-3">{a.prediction ? pct(a.confidence) : "—"}</td>
                  <td className="num py-2 pr-3 text-muted-foreground">{a.modelVersion}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={a.status} />
                  </td>
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

export const tooltipStyle = {
  fontSize: 11,
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
} as const;

function buildTrend() {
  const analyses = listAnalyses();
  const buckets = new Map<string, number>();
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    buckets.set(`W-${i}`, 0);
  }
  analyses.forEach((a) => {
    const days = Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 86_400_000);
    const key = `W-${Math.min(7, Math.floor(days / 7))}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  });
  return [...buckets.entries()].map(([week, count]) => ({ week, count })).reverse();
}
