import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, EmptyState, Panel } from "@/components/ui-kit";
import { tooltipStyle } from "@/components/views/DashboardView";
import { CHANNELS_19, STREAMS, classColor, pct } from "@/lib/qsfe";
import { getWaveform, listAnalyses, useDb } from "@/services/mockApi";

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
      { property: "og:description", content: "Explore the 830 features behind each QSFE-Net prediction." },
    ],
  }),
  component: AnalysisPage,
});

const TABS = STREAMS.map((s) => s.id);

function AnalysisPage() {
  const analyses = useDb(() => listAnalyses().filter((a) => a.status === "COMPLETED"));
  const [tab, setTab] = useState<(typeof TABS)[number]>("S1");
  const [channel, setChannel] = useState("Fp1");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0);
  const waveform = getWaveform();
  const windowSeconds = 30 / zoom;

  const stream = STREAMS.find((s) => s.id === tab)!;
  const statsByClass = ["Normal", "MCI", "Dementia"].map((cls) => {
    const rows = analyses.filter((a) => a.prediction === cls);
    const pick = (a: (typeof analyses)[number]) =>
      tab === "S1"
        ? a.featureSummary.s1.thetaAlphaRatio
        : tab === "S2"
          ? a.featureSummary.s2.meanCoherence
          : tab === "S3"
            ? a.featureSummary.s3.meanEntropy
            : a.featureSummary.s4.meanAsymmetry;
    const values = rows.map(pick);
    const mean = values.length ? values.reduce((x, y) => x + y, 0) / values.length : 0;
    const sd = values.length
      ? Math.sqrt(values.reduce((t, v) => t + (v - mean) ** 2, 0) / values.length)
      : 0;
    return { cls, n: values.length, mean, sd, min: Math.min(...values, 0), max: Math.max(...values, 0) };
  });

  return (
    <AppShell
      title="EEG Analysis"
      subtitle="19-channel viewer and four-stream feature exploration"
    >
      <Panel
        title="EEG viewer"
        hint={`Channel ${channel} · window ${windowSeconds.toFixed(1)} s · offset ${offset.toFixed(1)} s`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="rounded border border-input bg-card px-2 py-1 text-[11px]"
            >
              {CHANNELS_19.map((c) => (
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
                max={Math.max(0, 300 - windowSeconds)}
                step={1}
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value))}
                className="w-28"
              />
              <span className="num text-[11px]">{offset.toFixed(0)} s</span>
            </div>
          </div>
        }
      >
        {waveform ? null : (
          <EmptyState
            title="No waveform data available"
            body="Raw EEG traces are streamed from the ML service (GET /api/eeg/:id/waveform). Nothing is plotted here until real EDF samples are available — synthetic clinical EEG is deliberately never fabricated."
            action={{ to: "/upload", label: "Upload an EDF recording" }}
          />
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Axis label="Channels" value={`${CHANNELS_19.length} (10-20 montage)`} />
          <Axis label="Time axis" value={`${offset.toFixed(0)}–${(offset + windowSeconds).toFixed(0)} s`} />
          <Axis label="Amplitude axis" value="µV, ±100 µV default scale" />
          <Axis label="Selected range" value={`${windowSeconds.toFixed(1)} s at 200 Hz = ${Math.round(windowSeconds * 200)} samples`} />
        </div>
      </Panel>

      <div className="mt-3 flex flex-wrap gap-1">
        {STREAMS.map((s) => (
          <button
            key={s.id}
            onClick={() => setTab(s.id)}
            className={`rounded border px-3 py-1.5 text-xs ${
              tab === s.id ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {s.id} · {s.name}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_1fr]">
        <Panel title={`${stream.id} — ${stream.name}`} hint={`${stream.features} features of the 830-dimensional vector`}>
          <p className="text-xs leading-relaxed text-muted-foreground">{stream.description}</p>
          <div className="mt-3 rounded border border-border bg-secondary/50 px-3 py-2">
            <div className="label-xs">Formula</div>
            <div className="num mt-1 text-sm">{stream.formula}</div>
          </div>
          <table className="mt-3 w-full text-left text-xs">
            <thead className="label-xs border-b border-border">
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
              {statsByClass.map((r) => (
                <tr key={r.cls} className="border-b border-border/70 last:border-0">
                  <td className="py-1.5 pr-2">{r.cls}</td>
                  <td className="num py-1.5 pr-2">{r.n}</td>
                  <td className="num py-1.5 pr-2">{r.mean.toFixed(3)}</td>
                  <td className="num py-1.5 pr-2">{r.sd.toFixed(3)}</td>
                  <td className="num py-1.5 pr-2">{r.min.toFixed(3)}</td>
                  <td className="num py-1.5">{r.max.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Disclaimer>
            Statistics are computed over the analyses stored in this workspace (demo data in MOCK_INFERENCE mode),
            grouped by the class the model predicted — not by a verified clinical label.
          </Disclaimer>
        </Panel>

        <Panel title="Group means by predicted class" hint="Summary statistic of the selected stream">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statsByClass} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="cls" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip formatter={(v: number) => v.toFixed(3)} contentStyle={tooltipStyle} />
                <Bar isAnimationActive={false} dataKey="mean" name="mean" radius={[2, 2, 0, 0]}>
                  {statsByClass.map((r) => (
                    <Cell key={r.cls} fill={classColor(r.cls as "Normal")} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded border border-border px-3 py-2">
              <div className="label-xs">Feature share</div>
              <div className="num mt-1 text-base">{pct(stream.features / 830, 1)}</div>
              <div className="text-muted-foreground">{stream.features} / 830 features</div>
            </div>
            <div className="rounded border border-border px-3 py-2">
              <div className="label-xs">Encoder</div>
              <div className="num mt-1 text-base">{stream.features} → 64 → 32</div>
              <div className="text-muted-foreground">ReLU MLP, 32-d embedding</div>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function Axis({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-3 py-2">
      <div className="label-xs">{label}</div>
      <div className="num mt-0.5 text-[11px]">{value}</div>
    </div>
  );
}