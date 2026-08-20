import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, EmptyState, Panel } from "@/components/ui-kit";
import { tooltipStyle } from "@/components/views/DashboardView";
import { CLASSES, STREAMS, TOTAL_FEATURES, classColor, pct } from "@/lib/qsfe";
import { getAnalysis, getWaveform, listAnalyses } from "@/services/api";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "EEG Analysis — Viewer & Feature Streams" },
      {
        name: "description",
        content:
          "Interactive 19-channel EEG viewer plus per-stream feature statistics: frequency slowing, coherence, spectral entropy and hemispheric asymmetry.",
      },
      { property: "og:title", content: "EEG Analysis — Viewer & Feature Streams" },
      {
        property: "og:description",
        content: "Explore the 830 features behind each QSFE-Net prediction.",
      },
    ],
  }),
  component: AnalysisPage,
});

const TABS = STREAMS.map((s) => s.id);

function AnalysisPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("S1");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [channel, setChannel] = useState("Fp1");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0);

  const { data: analyses = [] } = useQuery({ queryKey: ["analyses"], queryFn: listAnalyses });
  const activeId = selectedId ?? analyses[0]?.id ?? null;

  const { data: detail } = useQuery({
    queryKey: ["analysis", activeId],
    queryFn: () => getAnalysis(activeId!),
    enabled: !!activeId,
  });

  const windowSeconds = 30 / zoom;
  const { data: waveform, isLoading: waveLoading } = useQuery({
    queryKey: ["waveform", activeId, channel, offset, windowSeconds],
    queryFn: () =>
      getWaveform(activeId!, {
        start: offset,
        duration: windowSeconds,
        channels: [channel],
        maxPoints: 2000,
      }),
    enabled: !!activeId,
    retry: false,
  });

  const stream = STREAMS.find((s) => s.id === tab)!;
  const bio = detail?.biomarkers ?? null;

  // Gate activation for the selected stream, grouped by the class the model
  // predicted. Computed from the analyses already loaded, so it needs no
  // extra requests and reflects this workspace only.
  const gateByClass = CLASSES.map((cls) => {
    const values = analyses.filter((a) => a.prediction === cls).map((a) => a.gateWeights[tab]);
    const mean = values.length ? values.reduce((x, y) => x + y, 0) / values.length : 0;
    const sd = values.length
      ? Math.sqrt(values.reduce((t, v) => t + (v - mean) ** 2, 0) / values.length)
      : 0;
    return {
      cls,
      n: values.length,
      mean,
      sd,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    };
  });

  const chartData =
    waveform?.data[0]?.map((value, i) => ({
      t: waveform.startSeconds + i / waveform.effectiveSampleRate,
      value,
    })) ?? [];
  const maxOffset = Math.max(0, (waveform?.totalDurationSeconds ?? 300) - windowSeconds);
  const channelOptions = waveform?.channels.length
    ? waveform.channels
    : [
        "Fp1",
        "F3",
        "C3",
        "P3",
        "O1",
        "Fp2",
        "F4",
        "C4",
        "P4",
        "O2",
        "F7",
        "T3",
        "T5",
        "F8",
        "T4",
        "T6",
        "Fz",
        "Cz",
        "Pz",
      ];

  return (
    <AppShell
      title="EEG Analysis"
      subtitle="19-channel viewer and four-stream feature exploration"
      actions={
        analyses.length > 0 ? (
          <select
            value={activeId ?? ""}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setOffset(0);
            }}
            className="rounded-control border border-input bg-card px-2 py-1 text-[11px]"
          >
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.sourceRef ?? a.id).slice(0, 28)} · {a.prediction}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      <Panel
        title="EEG viewer"
        hint={
          waveform
            ? `${channel} · ${waveform.durationSeconds.toFixed(1)} s from ${waveform.startSeconds.toFixed(1)} s · ${waveform.sampleRate} Hz source, drawn at ${waveform.effectiveSampleRate.toFixed(0)} Hz`
            : `Channel ${channel} · window ${windowSeconds.toFixed(1)} s`
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="rounded-control border border-input bg-card px-2 py-1 text-[11px]"
            >
              {channelOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <span className="label-xs">zoom</span>
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-24"
              />
              <span className="num text-[11px]">{zoom.toFixed(1)}×</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="label-xs">pan</span>
              <input
                type="range"
                min={0}
                max={maxOffset}
                step={1}
                value={Math.min(offset, maxOffset)}
                onChange={(e) => setOffset(Number(e.target.value))}
                className="w-28"
              />
              <span className="num text-[11px]">{offset.toFixed(0)} s</span>
            </div>
          </div>
        }
      >
        {!activeId ? (
          <EmptyState
            title="No analyses yet"
            body="Upload an EDF recording to run QSFE-Net and view its waveform here."
            action={{ to: "/upload", label: "Upload an EDF recording" }}
          />
        ) : waveLoading ? (
          <p className="text-xs text-muted-foreground">Reading the EDF window…</p>
        ) : !waveform ? (
          <EmptyState
            title="No viewable recording"
            body="This analysis was scored from cached feature vectors, which contain no raw signal. Pick an analysis created from an uploaded EDF, or one whose dataset EDF is present locally."
            action={{ to: "/upload", label: "Upload an EDF recording" }}
          />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v: number) => `${v.toFixed(1)}s`}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v: number) => v.toFixed(0)}
                />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(2)} µV`, channel]}
                  labelFormatter={(v: number) => `${Number(v).toFixed(3)} s`}
                  contentStyle={tooltipStyle}
                />
                {/* The windows the model actually scored for this prediction. */}
                {waveform.scoredWindows.map((w) => (
                  <ReferenceArea
                    key={w.start_seconds}
                    x1={w.start_seconds}
                    x2={w.start_seconds + w.duration_seconds}
                    fill="var(--primary)"
                    fillOpacity={0.08}
                  />
                ))}
                <Line
                  isAnimationActive={false}
                  type="linear"
                  dataKey="value"
                  stroke="var(--chart-1)"
                  strokeWidth={1}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Axis label="Channels" value={`${channelOptions.length} (CAUEEG order)`} />
          <Axis
            label="Time axis"
            value={
              waveform
                ? `${waveform.startSeconds.toFixed(0)}–${(waveform.startSeconds + waveform.durationSeconds).toFixed(0)} s of ${waveform.totalDurationSeconds.toFixed(0)} s`
                : "—"
            }
          />
          <Axis label="Amplitude axis" value="µV, autoscaled to the window" />
          <Axis
            label="Scored windows"
            value={
              waveform?.scoredWindows.length
                ? `${waveform.scoredWindows.length} × 10 s (shaded)`
                : "—"
            }
          />
        </div>
        {waveform && (
          <Disclaimer>
            Samples are read straight from the source EDF and decimated for display. This is the raw
            signal, not the z-normalised tensor the model consumed.
          </Disclaimer>
        )}
      </Panel>

      <div className="mt-3 flex flex-wrap gap-1">
        {STREAMS.map((s) => (
          <button
            key={s.id}
            onClick={() => setTab(s.id)}
            className={`rounded-xs border px-3 py-1.5 text-xs ${
              tab === s.id
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {s.id} · {s.name}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_1fr]">
        <Panel
          title={`${stream.id} — ${stream.name}`}
          hint={`${stream.features} features of the ${TOTAL_FEATURES}-dimensional vector`}
        >
          <p className="text-xs leading-relaxed text-muted-foreground">{stream.description}</p>
          <div className="mt-3 rounded-xs border border-border bg-secondary/50 px-3 py-2">
            <div className="label-xs">Formula</div>
            <div className="num mt-1 text-sm">{stream.formula}</div>
          </div>

          <div className="mt-3">
            <div className="label-xs">
              Decoded values for {detail?.sourceRef ?? "the selected analysis"}
            </div>
            {bio ? (
              <StreamDetail tab={tab} bio={bio} />
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Select an analysis to see its decoded biomarkers.
              </p>
            )}
          </div>
        </Panel>

        <Panel
          title={`${stream.id} gate activation by predicted class`}
          hint="How strongly this stream was gated across the workspace"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gateByClass} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="cls" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip formatter={(v: number) => v.toFixed(3)} contentStyle={tooltipStyle} />
                <Bar
                  isAnimationActive={false}
                  dataKey="mean"
                  name="mean gate"
                  radius={[2, 2, 0, 0]}
                >
                  {gateByClass.map((r) => (
                    <Cell key={r.cls} fill={classColor(r.cls)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-left text-xs">
              <thead className="label-xs border-b-[1.5px] border-border-strong">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Predicted class</th>
                  <th className="py-1.5 pr-2 font-medium">n</th>
                  <th className="py-1.5 pr-2 font-medium">Mean</th>
                  <th className="py-1.5 pr-2 font-medium">SD</th>
                  <th className="py-1.5 pr-2 font-medium">Min</th>
                  <th className="py-1.5 font-medium">Max</th>
                </tr>
              </thead>
              <tbody>
                {gateByClass.map((r) => (
                  <tr key={r.cls} className="border-b border-border/70 last:border-0">
                    <td className="py-1.5 pr-2">{r.cls}</td>
                    <td className="num py-1.5 pr-2">{r.n}</td>
                    <td className="num py-1.5 pr-2">{r.mean.toFixed(3)}</td>
                    <td className="num py-1.5 pr-2">{r.sd.toFixed(3)}</td>
                    <td className="num py-1.5 pr-2">{r.min?.toFixed(3) ?? "—"}</td>
                    <td className="num py-1.5">{r.max?.toFixed(3) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xs border border-border px-3 py-2">
              <div className="label-xs">Feature share</div>
              <div className="num mt-1 text-base">{pct(stream.features / TOTAL_FEATURES, 1)}</div>
              <div className="text-muted-foreground">
                {stream.features} / {TOTAL_FEATURES} features
              </div>
            </div>
            <div className="rounded-xs border border-border px-3 py-2">
              <div className="label-xs">Encoder</div>
              <div className="num mt-1 text-base">{stream.features} → 64 → 32</div>
              <div className="text-muted-foreground">ReLU MLP, 32-d embedding</div>
            </div>
          </div>
          <Disclaimer>
            Grouped by the class the model predicted, not by a verified clinical label. Gate weights
            describe stream contribution, not causal medical explanations.
          </Disclaimer>
        </Panel>
      </div>
    </AppShell>
  );
}

/** Per-stream view of the decoded biomarkers for one analysis. Each stream has
 * a different natural shape, so each gets its own small table/chart. */
function StreamDetail({
  tab,
  bio,
}: {
  tab: "S1" | "S2" | "S3" | "S4";
  bio: NonNullable<Awaited<ReturnType<typeof getAnalysis>>["biomarkers"]>;
}) {
  if (tab === "S1") {
    const rows = bio.frequency_slowing.channels.map((ch, i) => ({
      channel: ch,
      value: bio.frequency_slowing.theta_alpha_ratio[i] ?? 0,
    }));
    return <ChannelChart rows={rows} label="theta/alpha ratio" color="var(--chart-1)" />;
  }

  if (tab === "S3") {
    const rows = bio.complexity.channels.map((ch, i) => ({
      channel: ch,
      value: bio.complexity.spectral_entropy[i] ?? 0,
    }));
    return <ChannelChart rows={rows} label="spectral entropy" color="var(--chart-3)" />;
  }

  if (tab === "S2") {
    return (
      <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
        <PairTable title="Strongest alpha pairs" pairs={bio.coherence.top_alpha_pairs} />
        <PairTable title="Weakest alpha pairs" pairs={bio.coherence.lowest_alpha_pairs} />
        <div className="sm:col-span-2">
          <div className="label-xs">Mean coherence by band</div>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full text-[11px]">
              <tbody>
                {Object.entries(bio.coherence.mean_by_band).map(([band, v]) => (
                  <tr key={band}>
                    <td className="py-0.5 text-muted-foreground">{band}</td>
                    <td className="num py-0.5 text-right">{v.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const rows = bio.asymmetry.pairs.map((pair, i) => ({
    channel: pair,
    value: bio.asymmetry.by_band["alpha"]?.[i] ?? 0,
  }));
  return <ChannelChart rows={rows} label="alpha asymmetry" color="var(--chart-4)" />;
}

function ChannelChart({
  rows,
  label,
  color,
}: {
  rows: Array<{ channel: string; value: number }>;
  label: string;
  color: string;
}) {
  return (
    <div className="mt-1.5 h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="channel" stroke="var(--muted-foreground)" fontSize={9} interval={0} />
          <YAxis stroke="var(--muted-foreground)" fontSize={11} />
          <Tooltip formatter={(v: number) => [v.toFixed(3), label]} contentStyle={tooltipStyle} />
          <Bar isAnimationActive={false} dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PairTable({
  title,
  pairs,
}: {
  title: string;
  pairs: Array<{ pair: string; coherence: number }>;
}) {
  return (
    <div>
      <div className="label-xs">{title}</div>
      <div className="overflow-x-auto">
        <table className="mt-1 w-full text-[11px]">
          <tbody>
            {pairs.slice(0, 6).map((p) => (
              <tr key={p.pair}>
                <td className="num py-0.5 text-muted-foreground">{p.pair}</td>
                <td className="num py-0.5 text-right">{p.coherence.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Axis({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xs border border-border px-3 py-2">
      <div className="label-xs">{label}</div>
      <div className="num mt-0.5 text-[11px]">{value}</div>
    </div>
  );
}
