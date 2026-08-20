import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, Kpi, Panel } from "@/components/ui-kit";
import { tooltipStyle } from "@/components/views/DashboardView";
import {
  CLASSES,
  MODEL,
  PIPELINE,
  STREAMS,
  TOTAL_FEATURES,
  classColor,
  type ClassLabel,
} from "@/lib/qsfe";
import { listAnalyses, modelInfo } from "@/services/api";

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
      {
        property: "og:description",
        content: "Interactive diagram of the QSFE-Net four-stream gated fusion model.",
      },
    ],
  }),
  component: ModelPage,
});

function ModelPage() {
  const [active, setActive] = useState<string | null>("S2");
  const [gateClass, setGateClass] = useState<ClassLabel>("MCI");
  const { data: model } = useQuery({ queryKey: ["modelInfo"], queryFn: modelInfo, retry: false });
  const { data: analyses = [] } = useQuery({ queryKey: ["analyses"], queryFn: listAnalyses });

  // Gate activations averaged over the analyses this workspace has actually
  // run, grouped by the class the model predicted.
  const gateData = STREAMS.map((stream) => {
    const entry: Record<string, string | number> = { stream: stream.id };
    for (const cls of CLASSES) {
      const values = analyses
        .filter((a) => a.prediction === cls)
        .map((a) => a.gateWeights[stream.id]);
      entry[cls] = values.length ? values.reduce((x, y) => x + y, 0) / values.length : 0;
    }
    return entry;
  });
  const selected = STREAMS.find((s) => s.id === active);
  /** Measured mean gate for one stream/class, or null when nothing was scored. */
  const gateOf = (streamId: string, cls: ClassLabel): number | null => {
    const row = gateData.find((g) => g["stream"] === streamId);
    const value = row?.[cls];
    return typeof value === "number" && analyses.some((a) => a.prediction === cls) ? value : null;
  };
  const fmtGate = (v: number | null) => (v === null ? "—" : v.toFixed(3));

  return (
    <AppShell
      title="Model Architecture"
      subtitle={`${MODEL.name} · ${model?.checkpoint ?? "loading"} · quad-stream gated feature encoder`}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Trainable parameters"
          value={model ? model.nParameters.toLocaleString() : "…"}
          sub={model ? `${model.device} · ${model.checkpoint}` : "loading"}
        />
        <Kpi label="Input features" value={TOTAL_FEATURES} sub="95 + 684 + 19 + 32" />
        <Kpi label="Fusion dimension" value={128} sub="4 × 32-d embeddings" />
        <Kpi label="Output classes" value={3} sub="Normal / MCI / Dementia" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.25fr_1fr]">
        <Panel title="Forward pass" hint="Click a stream block to inspect it">
          <div className="space-y-2">
            <Block label="EDF EEG recording" sub="19 channels @ 200 Hz, CAUEEG" />
            <Arrow />
            <Block
              label="Preprocessing"
              sub={
                model
                  ? `resample to ${model.sampleRate} Hz → ${model.defaultNCrops} × ${model.cropLength / model.sampleRate} s crops → z-normalise`
                  : "resample → deterministic crops → z-normalise"
              }
            />
            <Arrow />
            <Block label="Feature extraction" sub={`${TOTAL_FEATURES} features`} />
            <Arrow />
            <div className="grid gap-2 sm:grid-cols-4">
              {STREAMS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`rounded-xs border px-3 py-2.5 text-left transition-colors ${
                    active === s.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/60"
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
            <Block label="Classifier" sub="128 → 64 → 3 (ReLU, Dropout(0.6))" />
            <Arrow />
            <div className="grid grid-cols-3 gap-2">
              {CLASSES.map((c) => (
                <div
                  key={c}
                  className="rounded-xs border px-3 py-2 text-center text-xs font-medium"
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
            <Panel
              title={`${selected.id} — ${selected.name}`}
              hint={`${selected.features} input features`}
            >
              <p className="text-xs leading-relaxed text-muted-foreground">
                {selected.description}
              </p>
              <div className="mt-3 rounded-xs border border-border bg-secondary/50 px-3 py-2">
                <div className="label-xs">Formula</div>
                <div className="num mt-1 text-sm">{selected.formula}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-xs">
                  <tbody>
                    <Row k="Encoder" v={`${selected.features} → 64 → 32`} />
                    {/* Mirrors StreamEncoder in ML/src/models/qsfe_net.py — the encoder
                        uses Dropout(0.4); the classifier head's 0.6 is separate. */}
                    <Row k="Activation" v="ReLU + BatchNorm + Dropout(0.4)" />
                    <Row k="Embedding" v="32-dimensional" />
                    <Row k="Gate (Normal)" v={fmtGate(gateOf(selected.id, "Normal"))} />
                    <Row k="Gate (MCI)" v={fmtGate(gateOf(selected.id, "MCI"))} />
                    <Row k="Gate (Dementia)" v={fmtGate(gateOf(selected.id, "Dementia"))} />
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel
            title="Gate analysis"
            hint={`Mean gate activation over ${analyses.length} analyses in this workspace`}
            right={
              <select
                value={gateClass}
                onChange={(e) => setGateClass(e.target.value as ClassLabel)}
                className="rounded-control border border-input bg-card px-2 py-1 text-[11px]"
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
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-left text-xs">
                <thead className="label-xs border-b-[1.5px] border-border-strong">
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
                      <td className="num py-1.5 pr-2">{fmtGate(gateOf(s.id, "Normal"))}</td>
                      <td className="num py-1.5 pr-2">{fmtGate(gateOf(s.id, "MCI"))}</td>
                      <td className="num py-1.5">{fmtGate(gateOf(s.id, "Dementia"))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Disclaimer>
              Coherence (S2) is typically gated near-open for every class while entropy (S3) and
              asymmetry (S4) stay far lower — the network learned to rely mostly on connectivity and
              slowing, which is also why the S1+S2 ablation beats the full model. Gate weights
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
    <div className="rounded-xs border border-border bg-secondary/40 px-3 py-2">
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
