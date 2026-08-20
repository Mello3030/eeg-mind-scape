import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, Kpi, Panel, Skeleton } from "@/components/ui-kit";
import { tooltipStyle } from "@/components/views/DashboardView";
import { MODEL, classColor, pct } from "@/lib/qsfe";
import { modelAblation, modelPerformance } from "@/services/api";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance & Ablation — QSFE-Net Results" },
      {
        name: "description",
        content:
          "QSFE-Net evaluation measured against the local CAUEEG test split: confusion matrix, per-class metrics, ablation study and CEEDNet baseline comparison.",
      },
      { property: "og:title", content: "Performance & Ablation — QSFE-Net Results" },
      {
        property: "og:description",
        content: "Measured confusion matrix, ablation study and baselines.",
      },
    ],
  }),
  component: PerformancePage,
});

function PerformancePage() {
  const {
    data: perf,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["modelPerformance", "test"],
    queryFn: () => modelPerformance("test"),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const { data: ablation } = useQuery({
    queryKey: ["modelAblation"],
    queryFn: modelAblation,
    staleTime: 30 * 60_000,
    retry: false,
  });

  const matrix = perf?.confusionMatrix ?? [];
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  const maxCell = Math.max(1, ...matrix.flat());

  // The measured accuracy belongs in the baseline chart alongside the published
  // numbers, rather than being carried as another hardcoded constant.
  const baselines = [
    ...(perf
      ? [
          {
            model: "QSFE-Net (ours)",
            params_label: perf.nParameters.toLocaleString(),
            test_accuracy: perf.accuracy,
            ours: true,
          },
        ]
      : []),
    ...(ablation?.baselines ?? []),
  ];

  return (
    <AppShell
      title="Performance"
      subtitle={
        perf
          ? `${perf.checkpoint} · ${perf.split} split · ${perf.nEvaluated} patients · measured in ${perf.elapsedSeconds}s`
          : `${MODEL.name} · CAUEEG three-class evaluation`
      }
    >
      {error && (
        <Panel title="Evaluation unavailable">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {error instanceof Error ? error.message : "Could not evaluate the model."} The metrics
            on this page are computed on demand from the local dataset, so they need both a loaded
            checkpoint and the cached feature files under <span className="num">outputs/</span>.
          </p>
        </Panel>
      )}

      {isLoading && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="panel px-3.5 py-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2.5 h-6 w-20" />
              </div>
            ))}
          </div>
          <Panel
            className="mt-3"
            title="Measuring"
            hint="Scoring the test split with the active checkpoint — a few seconds the first time, then cached until the checkpoint changes."
          >
            <Skeleton className="h-52 w-full" />
          </Panel>
        </>
      )}

      {perf && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi
              label="Test accuracy"
              value={pct(perf.accuracy)}
              sub={`${perf.nEvaluated} patients`}
            />
            <Kpi label="Macro F1" value={perf.macroF1.toFixed(4)} sub="unweighted class mean" />
            <Kpi
              label="Parameters"
              value={perf.nParameters.toLocaleString()}
              sub={`trainable · ${perf.device}`}
            />
            <Kpi label="Crops averaged" value={perf.split === "test" ? 5 : 5} sub="per recording" />
            <Kpi label="Chance level" value="33.3%" sub="three balanced classes" />
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1.2fr]">
            <Panel
              title="Confusion matrix"
              hint={`Rows = true class, columns = predicted class (n = ${total})`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-center text-xs">
                  <thead>
                    <tr>
                      <th className="label-xs py-1.5 text-left">true \ pred</th>
                      {perf.labels.map((l) => (
                        <th key={l} className="label-xs py-1.5">
                          {l}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row, i) => (
                      <tr key={perf.labels[i]}>
                        <td className="label-xs py-1.5 text-left">{perf.labels[i]}</td>
                        {row.map((cell, j) => (
                          <td key={perf.labels[j]} className="p-0.5">
                            <div
                              className="num rounded-xs py-3 text-sm font-medium"
                              style={{
                                backgroundColor: `color-mix(in oklch, var(--primary) ${(cell / maxCell) * 70}%, var(--card))`,
                                color:
                                  cell / maxCell > 0.6
                                    ? "var(--primary-foreground)"
                                    : "var(--foreground)",
                                border:
                                  i === j ? "1px solid var(--primary)" : "1px solid var(--border)",
                              }}
                            >
                              {cell}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Disclaimer>
                Computed by scoring every {perf.split}-split patient that has cached feature crops
                with the active checkpoint — not a transcribed table.
              </Disclaimer>
            </Panel>

            <Panel
              title="Per-class metrics"
              hint={`Precision, recall and F1 per class; macro F1 = ${perf.macroF1.toFixed(4)}`}
            >
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={perf.perClass}
                    margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
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
              <div className="overflow-x-auto">
                <table className="mt-2 w-full text-left text-xs">
                  <thead className="label-xs border-b-[1.5px] border-border-strong">
                    <tr>
                      <th className="py-1.5 pr-2 font-medium">Class</th>
                      <th className="py-1.5 pr-2 font-medium">Precision</th>
                      <th className="py-1.5 pr-2 font-medium">Recall</th>
                      <th className="py-1.5 pr-2 font-medium">F1</th>
                      <th className="py-1.5 font-medium">Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.perClass.map((m) => (
                      <tr key={m.label} className="border-b border-border/70 last:border-0">
                        <td className="py-1.5 pr-2" style={{ color: classColor(m.label) }}>
                          {m.label}
                        </td>
                        <td className="num py-1.5 pr-2">{m.precision.toFixed(3)}</td>
                        <td className="num py-1.5 pr-2">{m.recall.toFixed(3)}</td>
                        <td className="num py-1.5 pr-2">{m.f1.toFixed(3)}</td>
                        <td className="num py-1.5">{m.support}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-medium">
                      <td className="py-1.5 pr-2">Macro avg</td>
                      <td className="num py-1.5 pr-2">
                        {mean(perf.perClass.map((m) => m.precision)).toFixed(3)}
                      </td>
                      <td className="num py-1.5 pr-2">
                        {mean(perf.perClass.map((m) => m.recall)).toFixed(3)}
                      </td>
                      <td className="num py-1.5 pr-2">{perf.macroF1.toFixed(4)}</td>
                      <td className="num py-1.5">{total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </>
      )}

      {ablation?.available && (
        <Panel
          className="mt-3"
          title="Ablation study"
          hint="Stream subsets trained under identical settings"
        >
          <div className="grid gap-3 xl:grid-cols-[1.1fr_1fr]">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ablation.rows} margin={{ top: 4, right: 8, left: -18, bottom: 30 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis
                    dataKey="config"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis domain={[0.35, 0.65]} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip formatter={(v: number) => pct(v)} contentStyle={tooltipStyle} />
                  <Bar
                    isAnimationActive={false}
                    dataKey="test_accuracy"
                    name="test accuracy"
                    radius={[2, 2, 0, 0]}
                  >
                    {ablation.rows.map((r) => (
                      <Cell
                        key={r.key}
                        fill={
                          r.best
                            ? "var(--chart-2)"
                            : r.key === "D_full_QSFE"
                              ? "var(--chart-4)"
                              : "var(--primary)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="label-xs border-b-[1.5px] border-border-strong">
                    <tr>
                      <th className="py-1.5 pr-2 font-medium">Configuration</th>
                      <th className="py-1.5 pr-2 font-medium">Streams</th>
                      <th className="py-1.5 font-medium">Test acc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ablation.rows.map((r) => (
                      <tr
                        key={r.key}
                        className={`border-b border-border/70 last:border-0 ${r.best ? "bg-normal/10" : ""}`}
                      >
                        <td className="py-1.5 pr-2">{r.config}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{r.streams}</td>
                        <td className="num py-1.5">{pct(r.test_accuracy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ablation.finding && (
                <div className="mt-3 rounded-xs border border-normal/40 bg-normal/10 px-3 py-2 text-[11px] leading-relaxed">
                  <div className="label-xs">Key research finding</div>
                  <p className="mt-1">{ablation.finding}</p>
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      {baselines.length > 1 && (
        <Panel
          className="mt-3"
          title="Baseline comparison"
          hint="Reported CAUEEG three-class results"
        >
          <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="label-xs border-b-[1.5px] border-border-strong">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Model</th>
                    <th className="py-1.5 pr-2 font-medium">Parameters</th>
                    <th className="py-1.5 font-medium">Test accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {baselines.map((b) => (
                    <tr
                      key={b.model}
                      className={`border-b border-border/70 last:border-0 ${b.ours ? "bg-primary/5" : ""}`}
                    >
                      <td className="py-1.5 pr-2 font-medium">{b.model}</td>
                      <td className="num py-1.5 pr-2">{b.params_label}</td>
                      <td className="num py-1.5">{pct(b.test_accuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={baselines} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis dataKey="model" stroke="var(--muted-foreground)" fontSize={10} />
                    <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip formatter={(v: number) => pct(v)} contentStyle={tooltipStyle} />
                    <Bar
                      isAnimationActive={false}
                      dataKey="test_accuracy"
                      name="test accuracy"
                      radius={[2, 2, 0, 0]}
                    >
                      {baselines.map((b) => (
                        <Cell
                          key={b.model}
                          fill={b.ours ? "var(--primary)" : "var(--muted-foreground)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Disclaimer>
                QSFE-Net is substantially less accurate than the CEEDNet baselines. This is reported
                openly: the contribution is a {perf ? perf.nParameters.toLocaleString() : "~79k"}
                -parameter model — orders of magnitude smaller than either baseline — with explicit,
                inspectable stream-level interpretability suited to low-resource deployment, not
                state-of-the-art accuracy.
                {ablation?.baselines_note ? ` ${ablation.baselines_note}` : ""}
              </Disclaimer>
            </div>
          </div>
        </Panel>
      )}
    </AppShell>
  );
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
