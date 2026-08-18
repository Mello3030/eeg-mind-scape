import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, Kpi, Panel } from "@/components/ui-kit";
import { tooltipStyle } from "@/components/views/DashboardView";
import {
  ABLATION,
  ABLATION_FINDING,
  BASELINES,
  CLASS_METRICS,
  CONFUSION_MATRIX,
  MODEL,
  TRAINING_CURVE,
  classColor,
  pct,
  type ClassLabel,
} from "@/lib/qsfe";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance & Ablation — QSFE-Net Results" },
      {
        name: "description",
        content:
          "QSFE-Net Run 8 results: 53.39% test accuracy, 0.5226 macro F1, confusion matrix, per-class metrics, ablation study and CEEDNet baseline comparison.",
      },
      { property: "og:title", content: "Performance & Ablation — QSFE-Net Results" },
      { property: "og:description", content: "Training curves, confusion matrix, ablation study and baselines." },
    ],
  }),
  component: PerformancePage,
});

function PerformancePage() {
  const total = CONFUSION_MATRIX.matrix.flat().reduce((a, b) => a + b, 0);
  const maxCell = Math.max(...CONFUSION_MATRIX.matrix.flat());

  return (
    <AppShell title="Performance" subtitle={`${MODEL.name} ${MODEL.version} · CAUEEG three-class evaluation`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Test accuracy" value={pct(MODEL.testAccuracy)} sub="held-out test split" />
        <Kpi label="Validation accuracy" value={pct(MODEL.validationAccuracy)} sub="best epoch" />
        <Kpi label="Macro F1" value={MODEL.macroF1.toFixed(4)} sub="unweighted class mean" />
        <Kpi label="Parameters" value={MODEL.parameterCount.toLocaleString()} sub="trainable" />
        <Kpi label="Chance level" value="33.3%" sub="three balanced classes" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel title="Accuracy curves" hint="Training vs validation accuracy per epoch">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={TRAINING_CURVE} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="epoch" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis domain={[0.3, 0.7]} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip formatter={(v: number) => pct(v, 2)} contentStyle={tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line isAnimationActive={false} type="monotone" dataKey="trainAcc" name="train acc" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="valAcc" name="val acc" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Loss curves" hint="Cross-entropy loss; validation loss bottoms out near epoch 45">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={TRAINING_CURVE} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="epoch" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis domain={[0.85, 1.12]} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip formatter={(v: number) => v.toFixed(3)} contentStyle={tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line isAnimationActive={false} type="monotone" dataKey="trainLoss" name="train loss" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="valLoss" name="val loss" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1.2fr]">
        <Panel title="Confusion matrix" hint={`Rows = true class, columns = predicted class (n = ${total})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-center text-xs">
              <thead>
                <tr>
                  <th className="label-xs py-1.5 text-left">true \ pred</th>
                  {CONFUSION_MATRIX.labels.map((l) => (
                    <th key={l} className="label-xs py-1.5">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CONFUSION_MATRIX.matrix.map((row, i) => (
                  <tr key={i}>
                    <td className="label-xs py-1.5 text-left">{CONFUSION_MATRIX.labels[i]}</td>
                    {row.map((cell, j) => (
                      <td key={j} className="p-0.5">
                        <div
                          className="num rounded py-3 text-sm font-medium"
                          style={{
                            backgroundColor: `color-mix(in oklch, var(--primary) ${(cell / maxCell) * 70}%, var(--card))`,
                            color: cell / maxCell > 0.6 ? "var(--primary-foreground)" : "var(--foreground)",
                            border: i === j ? "1px solid var(--primary)" : "1px solid var(--border)",
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
            Most confusion occurs between MCI and its neighbouring classes — the expected failure mode for a
            three-class screening model at this dataset scale.
          </Disclaimer>
        </Panel>

        <Panel title="Per-class metrics" hint="Precision, recall and F1 per class; macro F1 = 0.5226">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={CLASS_METRICS} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip formatter={(v: number) => v.toFixed(3)} contentStyle={tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar isAnimationActive={false} dataKey="precision" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
                <Bar isAnimationActive={false} dataKey="recall" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
                <Bar isAnimationActive={false} dataKey="f1" fill="var(--chart-3)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="label-xs border-b border-border">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Class</th>
                <th className="py-1.5 pr-2 font-medium">Precision</th>
                <th className="py-1.5 pr-2 font-medium">Recall</th>
                <th className="py-1.5 pr-2 font-medium">F1</th>
                <th className="py-1.5 font-medium">Support</th>
              </tr>
            </thead>
            <tbody>
              {CLASS_METRICS.map((m) => (
                <tr key={m.label} className="border-b border-border/70 last:border-0">
                  <td className="py-1.5 pr-2" style={{ color: classColor(m.label as ClassLabel) }}>
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
                <td className="num py-1.5 pr-2">0.505</td>
                <td className="num py-1.5 pr-2">0.506</td>
                <td className="num py-1.5 pr-2">{MODEL.macroF1.toFixed(4)}</td>
                <td className="num py-1.5">{total}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel className="mt-3" title="Ablation study" hint="Stream subsets trained under identical settings">
        <div className="grid gap-3 xl:grid-cols-[1.1fr_1fr]">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ABLATION} margin={{ top: 4, right: 8, left: -18, bottom: 30 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="config" stroke="var(--muted-foreground)" fontSize={10} angle={-25} textAnchor="end" interval={0} />
                <YAxis domain={[0.35, 0.6]} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip formatter={(v: number) => pct(v)} contentStyle={tooltipStyle} />
                <Bar isAnimationActive={false} dataKey="testAccuracy" name="test accuracy" radius={[2, 2, 0, 0]}>
                  {ABLATION.map((r) => (
                    <Cell
                      key={r.config}
                      fill={r.config === "S1 + S2" ? "var(--chart-2)" : r.config.startsWith("Full") ? "var(--chart-4)" : "var(--primary)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <table className="w-full text-left text-xs">
              <thead className="label-xs border-b border-border">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Configuration</th>
                  <th className="py-1.5 pr-2 font-medium">Params</th>
                  <th className="py-1.5 pr-2 font-medium">Test acc</th>
                  <th className="py-1.5 font-medium">Macro F1</th>
                </tr>
              </thead>
              <tbody>
                {ABLATION.map((r) => (
                  <tr
                    key={r.config}
                    className={`border-b border-border/70 last:border-0 ${r.config === "S1 + S2" ? "bg-normal/10" : ""}`}
                  >
                    <td className="py-1.5 pr-2">{r.config}</td>
                    <td className="num py-1.5 pr-2">{r.params.toLocaleString()}</td>
                    <td className="num py-1.5 pr-2">{pct(r.testAccuracy)}</td>
                    <td className="num py-1.5">{r.macroF1.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 rounded border border-normal/40 bg-normal/10 px-3 py-2 text-[11px] leading-relaxed">
              <div className="label-xs">Key research finding</div>
              <p className="mt-1">{ABLATION_FINDING}</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="mt-3" title="Baseline comparison" hint="Reported CAUEEG three-class results">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
          <table className="w-full text-left text-xs">
            <thead className="label-xs border-b border-border">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Model</th>
                <th className="py-1.5 pr-2 font-medium">Parameters</th>
                <th className="py-1.5 font-medium">Test accuracy</th>
              </tr>
            </thead>
            <tbody>
              {BASELINES.map((b) => (
                <tr key={b.model} className={`border-b border-border/70 last:border-0 ${b.ours ? "bg-primary/5" : ""}`}>
                  <td className="py-1.5 pr-2 font-medium">{b.model}</td>
                  <td className="num py-1.5 pr-2">{b.paramsLabel}</td>
                  <td className="num py-1.5">{pct(b.testAccuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-2">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={BASELINES} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="model" stroke="var(--muted-foreground)" fontSize={10} />
                  <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip formatter={(v: number) => pct(v)} contentStyle={tooltipStyle} />
                  <Bar isAnimationActive={false} dataKey="testAccuracy" name="test accuracy" radius={[2, 2, 0, 0]}>
                    {BASELINES.map((b) => (
                      <Cell key={b.model} fill={b.ours ? "var(--primary)" : "var(--muted-foreground)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Disclaimer>
              QSFE-Net is substantially less accurate than the CEEDNet baselines (53.39% vs 77.32% / 79.16%). This
              is reported openly: the contribution of QSFE-Net is a 79,431-parameter model — roughly 320× smaller
              than CEEDNet Single and 3,200× smaller than the ensemble — with explicit, inspectable stream-level
              interpretability suited to low-resource deployment, not state-of-the-art accuracy.
            </Disclaimer>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}