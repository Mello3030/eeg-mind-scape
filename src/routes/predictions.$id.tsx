import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import {
  ClassBadge,
  Disclaimer,
  EmptyState,
  Panel,
  ProbabilityBars,
  Skeleton,
  SourceBadge,
  TruthBadge,
  fmtDate,
} from "@/components/ui-kit";
import { tooltipStyle } from "@/components/views/DashboardView";
import { STREAMS, TOTAL_FEATURES, classColor, pct } from "@/lib/qsfe";
import { getAnalysis, modelPerformance } from "@/services/api";

export const Route = createFileRoute("/predictions/$id")({
  head: () => ({
    meta: [
      { title: "Analysis Result — QSFE-Net Prediction Report" },
      {
        name: "description",
        content:
          "QSFE-Net analysis report: class probabilities, confidence and stream-wise gate weights for a single EEG recording.",
      },
      { property: "og:title", content: "Analysis Result — QSFE-Net Prediction Report" },
      { property: "og:description", content: "Interpretable four-stream EEG prediction report." },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const { id } = Route.useParams();
  const {
    data: analysis,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => getAnalysis(id),
    retry: false,
  });
  const { data: perf } = useQuery({
    queryKey: ["modelPerformance", "test"],
    queryFn: () => modelPerformance("test"),
    staleTime: 30 * 60_000,
    retry: false,
  });
  // The detail response embeds the patient and upload, so no extra round trips.
  const data = { analysis: analysis ?? null };

  if (isPending) {
    return (
      <AppShell title="Analysis" subtitle="Loading report…">
        <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
          <Panel title="Loading">
            <Skeleton className="h-56 w-full" />
          </Panel>
          <Panel title="Loading">
            <Skeleton className="h-56 w-full" />
          </Panel>
        </div>
      </AppShell>
    );
  }

  if (isError || !data.analysis) {
    return (
      <AppShell title="Analysis not found">
        <EmptyState
          title="This analysis does not exist"
          body="It may have been removed from the workspace."
          action={{ to: "/predictions", label: "Back to predictions" }}
        />
      </AppShell>
    );
  }

  const a = data.analysis;
  const gateRows = STREAMS.map((s) => ({
    id: s.id,
    name: s.name,
    features: s.features,
    weight: a.gateWeights[s.id],
  }));
  const gateSum = gateRows.reduce((t, r) => t + r.weight, 0);
  const bio = a.biomarkers;

  return (
    <AppShell
      breadcrumbLabel={a.patient?.code ?? a.id.slice(0, 8)}
      title={`Analysis ${a.id}`}
      subtitle={`${a.patient?.code ?? "unknown patient"} · ${a.upload?.filename ?? a.sourceRef ?? "recording"} · ${a.checkpoint ?? "checkpoint"}`}
      actions={
        <Link
          to="/predictions"
          className="flex items-center gap-1 rounded-xs border border-border px-2.5 py-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" /> All predictions
        </Link>
      }
    >
      <div className="grid gap-3 xl:grid-cols-[1fr_1.25fr]">
        <Panel title="Model prediction" hint="Model output only — not a confirmed diagnosis">
          {a.prediction ? (
            <>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="label-xs">Predicted class</div>
                  <div
                    className="mt-1 text-4xl font-semibold leading-none"
                    style={{ color: classColor(a.prediction) }}
                  >
                    {a.prediction}
                  </div>
                </div>
                <div className="text-right">
                  <div className="label-xs">Confidence</div>
                  <div className="num mt-1 text-3xl font-semibold leading-none">
                    {pct(a.confidence)}
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <ProbabilityBars
                  normal={a.probabilities.Normal}
                  mci={a.probabilities.MCI}
                  dementia={a.probabilities.Dementia}
                />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-[11px]">
                <Meta k="Source" v={<SourceBadge kind={a.sourceKind} />} />
                <Meta k="Vs ground truth" v={<TruthBadge truth={a.groundTruth} />} />
                <Meta k="Checkpoint" v={<span className="num">{a.checkpoint ?? "—"}</span>} />
                <Meta k="Created" v={<span className="num">{fmtDate(a.createdAt)}</span>} />
                <Meta
                  k="Crops averaged"
                  v={
                    <span className="num">
                      {a.nCrops} × 10 s{a.device ? ` · ${a.device}` : ""}
                    </span>
                  }
                />
                <Meta
                  k="Recording"
                  v={
                    <span className="num">
                      {a.recording?.sample_rate
                        ? `${a.upload?.n_channels ?? 19} ch · ${a.recording.sample_rate} Hz · ${Math.round(a.recording.duration_seconds ?? 0)} s`
                        : "cached features"}
                    </span>
                  }
                />
                <Meta
                  k="Feature vector"
                  v={<span className="num">{TOTAL_FEATURES} features</span>}
                />
              </dl>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Awaiting inference result…</p>
          )}
        </Panel>

        <Panel
          title="Stream-wise interpretability"
          hint="Sigmoid gate activations from the fusion network"
          right={
            <span className="num text-[11px] text-muted-foreground">
              Σ gates = {gateSum.toFixed(3)}
            </span>
          }
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {gateRows.map((r) => (
              <div key={r.id} className="rounded-xs border border-border px-3 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="num text-[11px] font-semibold text-primary">{r.id}</span>
                  <span className="num text-sm font-semibold">{r.weight.toFixed(3)}</span>
                </div>
                <div className="mt-0.5 text-xs font-medium">{r.name}</div>
                <div className="num text-[10px] text-muted-foreground">
                  {r.features} features → 32-d embedding
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-xs bg-secondary">
                  <div className="h-full bg-primary" style={{ width: `${r.weight * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gateRows} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="id" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip formatter={(v: number) => v.toFixed(3)} contentStyle={tooltipStyle} />
                <Bar
                  isAnimationActive={false}
                  dataKey="weight"
                  name="gate weight"
                  radius={[2, 2, 0, 0]}
                >
                  {gateRows.map((r) => (
                    <Cell key={r.id} fill="var(--primary)" fillOpacity={0.4 + r.weight * 0.6} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-left text-xs">
              <thead className="label-xs border-b-[1.5px] border-border-strong">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Stream</th>
                  <th className="py-1.5 pr-2 font-medium">Biomarker</th>
                  <th className="py-1.5 pr-2 font-medium">Features</th>
                  <th className="py-1.5 pr-2 font-medium">Gate weight</th>
                  <th className="py-1.5 font-medium">Relative share</th>
                </tr>
              </thead>
              <tbody>
                {gateRows.map((r) => (
                  <tr key={r.id} className="border-b border-border/70 last:border-0">
                    <td className="num py-1.5 pr-2 font-medium">{r.id}</td>
                    <td className="py-1.5 pr-2">{r.name}</td>
                    <td className="num py-1.5 pr-2">{r.features}</td>
                    <td className="num py-1.5 pr-2">{r.weight.toFixed(3)}</td>
                    <td className="num py-1.5">{pct(r.weight / gateSum, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex gap-2 rounded-xs border border-mci/40 bg-mci/10 px-3 py-2 text-[11px] leading-relaxed">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Gate weights quantify how much each feature stream contributed to this forward pass.
            They are not causal medical explanations and do not indicate that a biomarker is
            abnormal.
          </p>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel
          title="Decoded biomarkers"
          hint="The four feature streams expressed as named, plottable quantities"
        >
          {bio ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard
                  title="S1 Frequency slowing"
                  rows={[
                    ["Mean theta/alpha ratio", num(bio.summary["mean_theta_alpha_ratio"])],
                    ["Max theta/alpha", num(bio.summary["max_theta_alpha_ratio"])],
                    ["Worst channel", String(bio.summary["max_theta_alpha_channel"] ?? "\u2014")],
                  ]}
                />
                <SummaryCard
                  title="S2 Coherence"
                  rows={[
                    ["Mean alpha coherence", num(bio.summary["mean_alpha_coherence"])],
                    ...Object.entries(bio.coherence.mean_by_band)
                      .slice(0, 2)
                      .map(([band, v]) => [`Mean ${band}`, v.toFixed(3)] as [string, string]),
                  ]}
                />
                <SummaryCard
                  title="S3 Spectral entropy"
                  rows={[
                    ["Mean H", num(bio.summary["mean_spectral_entropy"])],
                    ["Min H", Math.min(...bio.complexity.spectral_entropy).toFixed(3)],
                    ["Max H", Math.max(...bio.complexity.spectral_entropy).toFixed(3)],
                  ]}
                />
                <SummaryCard
                  title="S4 Asymmetry"
                  rows={[
                    ["Mean |A|", num(bio.summary["mean_absolute_asymmetry"])],
                    ["Most asymmetric", bio.asymmetry.most_asymmetric.pair ?? "\u2014"],
                    [
                      "\u2026in band",
                      `${bio.asymmetry.most_asymmetric.band ?? "\u2014"} ${
                        bio.asymmetry.most_asymmetric.value?.toFixed(3) ?? ""
                      }`,
                    ],
                  ]}
                />
              </div>

              <div className="mt-4">
                <div className="label-xs">Theta/alpha ratio per channel</div>
                <div className="mt-1.5 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={bio.frequency_slowing.channels.map((ch, i) => ({
                        channel: ch,
                        ratio: bio.frequency_slowing.theta_alpha_ratio[i] ?? 0,
                      }))}
                      margin={{ top: 4, right: 8, left: -22, bottom: 0 }}
                    >
                      <CartesianGrid stroke="var(--grid)" vertical={false} />
                      <XAxis
                        dataKey="channel"
                        stroke="var(--muted-foreground)"
                        fontSize={9}
                        interval={0}
                      />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip
                        formatter={(v: number) => v.toFixed(3)}
                        contentStyle={tooltipStyle}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="ratio"
                        fill="var(--chart-1)"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="label-xs">Strongest alpha coherence pairs</div>
                  <div className="overflow-x-auto">
                    <table className="mt-1.5 w-full text-[11px]">
                      <tbody>
                        {bio.coherence.top_alpha_pairs.slice(0, 5).map((cp) => (
                          <tr key={cp.pair}>
                            <td className="num py-0.5 text-muted-foreground">{cp.pair}</td>
                            <td className="num py-0.5 text-right">{cp.coherence.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <div className="label-xs">Weakest alpha coherence pairs</div>
                  <div className="overflow-x-auto">
                    <table className="mt-1.5 w-full text-[11px]">
                      <tbody>
                        {bio.coherence.lowest_alpha_pairs.slice(0, 5).map((cp) => (
                          <tr key={cp.pair}>
                            <td className="num py-0.5 text-muted-foreground">{cp.pair}</td>
                            <td className="num py-0.5 text-right">{cp.coherence.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No biomarkers were stored with this analysis.
            </p>
          )}
          <div className="mt-3">
            <Link to="/analysis" className="text-[11px] font-medium text-primary">
              Open full feature analysis \u2192
            </Link>
          </div>
        </Panel>

        <Panel title="Provenance & limitations">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <Meta k="Analysis ID" v={<span className="num">{a.id}</span>} />
            <Meta k="Upload ID" v={<span className="num">{a.uploadId ?? "—"}</span>} />
            <Meta k="Patient" v={<span className="num">{a.patient?.code ?? "—"}</span>} />
            <Meta k="Predicted class" v={<ClassBadge label={a.prediction} />} />
            <Meta k="Checkpoint" v={<span className="num">{a.checkpoint ?? "—"}</span>} />
            <Meta
              k="Test accuracy (model)"
              v={<span className="num">{perf ? pct(perf.accuracy) : "…"}</span>}
            />
          </dl>
          <div className="mt-3 space-y-2">
            {a.groundTruth && (
              <Disclaimer>
                This recording comes from the CAUEEG {a.groundTruth.split} split, where the true
                label is {a.groundTruth.className}. The model{" "}
                {a.groundTruth.correct ? "matched it" : "did not match it"} — shown because the
                label is known, not because the model was told.
              </Disclaimer>
            )}
            <Disclaimer>
              QSFE-Net reaches {perf ? pct(perf.accuracy) : "roughly 53%"} three-class test accuracy
              on CAUEEG. This is well above chance (33%) but far from clinical reliability: every
              output is a screening-research signal, never a diagnosis.
            </Disclaimer>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

/** Biomarker summary values are typed loosely because one entry is a nested
 * band -> fraction object; only the scalars are rendered here. */
const num = (v: unknown, digits = 3) => (typeof v === "number" ? v.toFixed(digits) : "—");

function Meta({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="label-xs">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  );
}

function SummaryCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-xs border border-border px-3 py-2">
      <div className="text-[11px] font-semibold">{title}</div>
      <div className="overflow-x-auto">
        <table className="mt-1.5 w-full text-[11px]">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="py-0.5 text-muted-foreground">{k}</td>
                <td className="num py-0.5 text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
