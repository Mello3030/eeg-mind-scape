import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, Kpi, Panel } from "@/components/ui-kit";
import { tooltipStyle } from "@/components/views/DashboardView";
import { CLASSES, GATE_WEIGHTS, MODEL, PIPELINE, STREAMS, TOTAL_FEATURES, classColor, type ClassLabel } from "@/lib/qsfe";

export const Route = createFileRoute("/model")({
  head: () => ({
    meta: [
      { title: "Model Architecture — QSFE-Net Gated Fusion" },
      {
        name: "description",
        content:
          "QSFE-Net architecture: four stream encoders (95/684/19/32 features), 128-d concatenation, sigmoid gate network and a 128→64→3 classifier with 79,431 parameters.",
      },
      { property: "og:title", content: "Model Architecture — QSFE-Net Gated Fusion" },
      { property: "og:description", content: "Interactive diagram of the QSFE-Net four-stream gated fusion model." },
    ],
  }),
  component: ModelPage,
});

function ModelPage() {
  const [active, setActive] = useState<string | null>("S2");
  const [gateClass, setGateClass] = useState<ClassLabel>("MCI");
  const gateData = STREAMS.map((s) => ({
    stream: s.id,
    Normal: GATE_WEIGHTS.Normal[s.id],
    MCI: GATE_WEIGHTS.MCI[s.id],
    Dementia: GATE_WEIGHTS.Dementia[s.id],
  }));
  const selected = STREAMS.find((s) => s.id === active);

  return (
    <AppShell title="Model Architecture" subtitle={`${MODEL.name} ${MODEL.version} · quad-stream gated feature encoder`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Trainable parameters" value={MODEL.parameterCount.toLocaleString()} sub="79,431" />
        <Kpi label="Input features" value={TOTAL_FEATURES} sub="95 + 684 + 19 + 32" />
        <Kpi label="Fusion dimension" value={128} sub="4 × 32-d embeddings" />
        <Kpi label="Output classes" value={3} sub="Normal / MCI / Dementia" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.25fr_1fr]">
        <Panel title="Forward pass" hint="Click a stream block to inspect it">
          <div className="space-y-2">
            <Block label="EDF EEG recording" sub="19 channels @ 200 Hz, CAUEEG" />
            <Arrow />
            <Block label="Preprocessing" sub="max 300 s → 0.5–30 Hz band-pass → 30 s crop" />
            <Arrow />
            <Block label="Feature extraction" sub={`${TOTAL_FEATURES} features`} />
            <Arrow />
            <div className="grid gap-2 sm:grid-cols-4">
              {STREAMS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`rounded border px-3 py-2.5 text-left transition-colors ${
                    active === s.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/60"
                  }`}
                >
                  <div className="num text-[11px] font-semibold text-primary">{s.id}</div>
                  <div className="mt-0.5 text-[11px] font-medium leading-tight">{s.name}</div>
                  <div className="num mt-1 text-[10px] text-muted-foreground">
                    {s.features} → 64 → 32
                  </div>
                </button>
              ))}
            </div>
            <Arrow />
            <Block label="Concatenate" sub="4 × 32 = 128-dimensional joint embedding" />
            <Arrow />
            <Block label="Sigmoid gate network" sub="128 → 4 gates g₁…g₄ ∈ (0,1)" />
            <Arrow />
            <Block label="Gated fusion" sub="z = [g₁·e₁, g₂·e₂, g₃·e₃, g₄·e₄]" />
            <Arrow />
            <Block label="Classifier" sub="128 → 64 → 3 (ReLU, dropout)" />
            <Arrow />
            <div className="grid grid-cols-3 gap-2">
              {CLASSES.map((c) => (
                <div
                  key={c}
                  className="rounded border px-3 py-2 text-center text-xs font-medium"
                  style={{ borderColor: classColor(c), color: classColor(c) }}
                >
                  {c}
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <div className="space-y-3">
          {selected && (
            <Panel title={`${selected.id} — ${selected.name}`} hint={`${selected.features} input features`}>
              <p className="text-xs leading-relaxed text-muted-foreground">{selected.description}</p>
              <div className="mt-3 rounded border border-border bg-secondary/50 px-3 py-2">
                <div className="label-xs">Formula</div>
                <div className="num mt-1 text-sm">{selected.formula}</div>
              </div>
              <table className="mt-3 w-full text-xs">
                <tbody>
                  <Row k="Encoder" v={`${selected.features} → 64 → 32`} />
                  <Row k="Activation" v="ReLU + BatchNorm + Dropout(0.3)" />
                  <Row k="Embedding" v="32-dimensional" />
                  <Row k="Gate (Normal)" v={GATE_WEIGHTS.Normal[selected.id].toFixed(3)} />
                  <Row k="Gate (MCI)" v={GATE_WEIGHTS.MCI[selected.id].toFixed(3)} />
                  <Row k="Gate (Dementia)" v={GATE_WEIGHTS.Dementia[selected.id].toFixed(3)} />
                </tbody>
              </table>
            </Panel>
          )}

          <Panel
            title="Gate analysis"
            hint="Run 8 mean gate activations"
            right={
              <select
                value={gateClass}
                onChange={(e) => setGateClass(e.target.value as ClassLabel)}
                className="rounded border border-input bg-card px-2 py-1 text-[11px]"
              >
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            }
          >
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gateData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="stream" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip formatter={(v: number) => v.toFixed(3)} contentStyle={tooltipStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {CLASSES.map((c) => (
                    <Bar
                      key={c}
                      dataKey={c}
                      fill={classColor(c)}
                      fillOpacity={c === gateClass ? 1 : 0.25}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="mt-2 w-full text-left text-xs">
              <thead className="label-xs border-b border-border">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Stream</th>
                  <th className="py-1.5 pr-2 font-medium">Normal</th>
                  <th className="py-1.5 pr-2 font-medium">MCI</th>
                  <th className="py-1.5 font-medium">Dementia</th>
                </tr>
              </thead>
              <tbody>
                {STREAMS.map((s) => (
                  <tr key={s.id} className="border-b border-border/70 last:border-0">
                    <td className="num py-1.5 pr-2 font-medium">{s.id}</td>
                    <td className="num py-1.5 pr-2">{GATE_WEIGHTS.Normal[s.id].toFixed(3)}</td>
                    <td className="num py-1.5 pr-2">{GATE_WEIGHTS.MCI[s.id].toFixed(3)}</td>
                    <td className="num py-1.5">{GATE_WEIGHTS.Dementia[s.id].toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Disclaimer>
              Coherence (S2) is gated near-open (≈0.98) for every class while entropy (S3) and asymmetry (S4) stay
              near or below 0.5 — the network learned to rely mostly on connectivity and slowing. Gate weights
              describe stream contribution, not causal medical explanations.
            </Disclaimer>
          </Panel>

          <Panel title="Preprocessing pipeline">
            <ol className="space-y-1.5">
              {PIPELINE.map((step, i) => (
                <li key={step} className="flex gap-2 text-xs">
                  <span className="num w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Block({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="rounded border border-border bg-secondary/40 px-3 py-2">
      <div className="text-xs font-medium">{label}</div>
      <div className="num text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Arrow() {
  return <div className="mx-auto h-3 w-px bg-border" />;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b border-border/70 last:border-0">
      <td className="py-1 pr-2 text-muted-foreground">{k}</td>
      <td className="num py-1 text-right">{v}</td>
    </tr>
  );
}