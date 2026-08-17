import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { ClassBadge, Disclaimer, EmptyState, Panel, ProbabilityBars, StatusBadge, fmtDate } from "@/components/ui-kit";
import { tooltipStyle } from "@/components/views/DashboardView";
import { MODEL, STREAMS, classColor, pct } from "@/lib/qsfe";
import { getAnalysis, getPatient, getRecording, useDb } from "@/services/mockApi";

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
  const data = useDb(() => {
    const analysis = getAnalysis(id);
    return {
      analysis,
      patient: analysis ? getPatient(analysis.patientId) : null,
      recording: analysis ? getRecording(analysis.eegRecordingId) : null,
    };
  });

  if (!data.analysis) {
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

  return (
    <AppShell
      title={`Analysis ${a.id}`}
      subtitle={`${data.patient?.externalPatientId ?? "unknown patient"} · ${data.recording?.filename ?? "recording"} · ${a.modelVersion}`}
      actions={
        <Link
          to="/predictions"
          className="flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" /> All predictions
        </Link>
      }
    >
      {a.status === "PROCESSING" && (
        <div className="mb-3 flex items-center gap-2 rounded border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          <Loader2 className="size-3.5 animate-spin" /> Inference in progress — the ML service is extracting 830
          features and running QSFE-Net.
        </div>
      )}

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
                  <div className="num mt-1 text-3xl font-semibold leading-none">{pct(a.confidence)}</div>
                </div>
              </div>
              <div className="mt-5">
                <ProbabilityBars
                  normal={a.normalProbability}
                  mci={a.mciProbability}
                  dementia={a.dementiaProbability}
                />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-[11px]">
                <Meta k="Status" v={<StatusBadge status={a.status} />} />
                <Meta k="Model version" v={<span className="num">{a.modelVersion}</span>} />
                <Meta k="Created" v={<span className="num">{fmtDate(a.createdAt)}</span>} />
                <Meta
                  k="Completed"
                  v={<span className="num">{a.completedAt ? fmtDate(a.completedAt) : "—"}</span>}
                />
                <Meta
                  k="Recording"
                  v={
                    <span className="num">
                      {data.recording?.channels ?? 19} ch · {data.recording?.samplingRate ?? 200} Hz ·{" "}
                      {data.recording?.duration ?? 300} s
                    </span>
                  }
                />
                <Meta k="Feature vector" v={<span className="num">830 features</span>} />
              </dl>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Awaiting inference result…</p>
          )}
        </Panel>

        <Panel
          title="Stream-wise interpretability"
          hint="Sigmoid gate activations from the fusion network"
          right={<span className="num text-[11px] text-muted-foreground">Σ gates = {gateSum.toFixed(3)}</span>}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {gateRows.map((r) => (
              <div key={r.id} className="rounded border border-border px-3 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="num text-[11px] font-semibold text-primary">{r.id}</span>
                  <span className="num text-sm font-semibold">{r.weight.toFixed(3)}</span>
                </div>
                <div className="mt-0.5 text-xs font-medium">{r.name}</div>
                <div className="num text-[10px] text-muted-foreground">{r.features} features → 32-d embedding</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-secondary">
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
                <Bar dataKey="weight" name="gate weight" radius={[2, 2, 0, 0]}>
                  {gateRows.map((r) => (
                    <Cell key={r.id} fill="var(--primary)" fillOpacity={0.4 + r.weight * 0.6} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <table className="mt-3 w-full text-left text-xs">
            <thead className="label-xs border-b border-border">
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

          <p className="mt-3 flex gap-2 rounded border border-mci/40 bg-mci/10 px-3 py-2 text-[11px] leading-relaxed">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Gate weights quantify how much each feature stream contributed to this forward pass. They are not
            causal medical explanations and do not indicate that a biomarker is abnormal.
          </p>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel title="Feature summary" hint="Aggregated statistics of the extracted feature vector">
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryCard
              title="S1 Frequency slowing"
              rows={[
                ["Theta/alpha ratio", a.featureSummary.s1.thetaAlphaRatio.toFixed(3)],
                ["Alpha peak (Hz)", a.featureSummary.s1.alphaPeakHz.toFixed(2)],
                ["Relative theta power", a.featureSummary.s1.thetaPower.toFixed(3)],
              ]}
            />
            <SummaryCard
              title="S2 Coherence"
              rows={[
                ["Mean coherence", a.featureSummary.s2.meanCoherence.toFixed(3)],
                ["Fronto-posterior", a.featureSummary.s2.frontalPosterior.toFixed(3)],
                ["Interhemispheric", a.featureSummary.s2.interhemispheric.toFixed(3)],
              ]}
            />
            <SummaryCard
              title="S3 Spectral entropy"
              rows={[
                ["Mean H", a.featureSummary.s3.meanEntropy.toFixed(3)],
                ["Min H", a.featureSummary.s3.minEntropy.toFixed(3)],
                ["Max H", a.featureSummary.s3.maxEntropy.toFixed(3)],
              ]}
            />
            <SummaryCard
              title="S4 Asymmetry"
              rows={[
                ["Mean A", a.featureSummary.s4.meanAsymmetry.toFixed(3)],
                ["Frontal A", a.featureSummary.s4.frontalAsymmetry.toFixed(3)],
                ["Temporal A", a.featureSummary.s4.temporalAsymmetry.toFixed(3)],
              ]}
            />
          </div>
          <div className="mt-3">
            <Link to="/analysis" className="text-[11px] font-medium text-primary">
              Open full feature analysis →
            </Link>
          </div>
        </Panel>

        <Panel title="Provenance & limitations">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <Meta k="Analysis ID" v={<span className="num">{a.id}</span>} />
            <Meta k="Recording ID" v={<span className="num">{a.eegRecordingId}</span>} />
            <Meta k="Patient" v={<span className="num">{data.patient?.externalPatientId ?? "—"}</span>} />
            <Meta k="Predicted class" v={<ClassBadge label={a.prediction} />} />
            <Meta k="Test accuracy (model)" v={<span className="num">{pct(MODEL.testAccuracy)}</span>} />
            <Meta k="Macro F1 (model)" v={<span className="num">{MODEL.macroF1.toFixed(4)}</span>} />
          </dl>
          <div className="mt-3 space-y-2">
            {a.mock && (
              <Disclaimer>
                Demo data — generated in MOCK_INFERENCE mode. Not produced by the trained PyTorch checkpoint.
              </Disclaimer>
            )}
            <Disclaimer>
              QSFE-Net reaches {pct(MODEL.testAccuracy)} three-class test accuracy on CAUEEG. This is well above
              chance (33%) but far from clinical reliability: every output is a screening-research signal, never a
              diagnosis.
            </Disclaimer>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

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
    <div className="rounded border border-border px-3 py-2">
      <div className="text-[11px] font-semibold">{title}</div>
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
  );
}