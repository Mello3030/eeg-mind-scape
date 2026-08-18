import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, Panel } from "@/components/ui-kit";
import { MODEL, STREAMS, TOTAL_FEATURES, pct } from "@/lib/qsfe";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About QSFE-Net — EEG Dementia Research Prototype" },
      {
        name: "description",
        content:
          "Background on EEG-based dementia and MCI screening, the CAUEEG dataset, the four QSFE-Net biomarker streams, gated fusion and interpretability.",
      },
      { property: "og:title", content: "About QSFE-Net — EEG Dementia Research Prototype" },
      {
        property: "og:description",
        content: "Scientific background, dataset, biomarkers and limitations of the QSFE-Net research prototype.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <AppShell title="About" subtitle="Deep Learning-Based Cross-Dataset EEG Analysis for Early Dementia Detection">
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Research prototype — not for clinical diagnosis">
          <p className="text-xs leading-relaxed">
            QSFE-Net is a final-year research project. Every output of this platform is a{" "}
            <strong>model prediction</strong>: a statistical estimate produced from a short EEG segment. It is not a
            diagnosis, is not validated for clinical use, and must never inform patient care. Dementia and MCI
            diagnosis requires clinical assessment, neuropsychological testing and imaging performed by qualified
            clinicians.
          </p>
          <Disclaimer>
            At {pct(MODEL.testAccuracy)} three-class test accuracy the model is above the 33.3% chance level but far
            below clinical reliability.
          </Disclaimer>
        </Panel>

        <Panel title="Electroencephalography (EEG)">
          <p className="text-xs leading-relaxed">
            EEG records the summed post-synaptic potentials of cortical neuron populations from scalp electrodes at
            millisecond resolution. It is inexpensive, non-invasive and widely available, which makes it attractive
            for large-scale screening compared with MRI or PET. Neurodegeneration alters the rhythmic and
            connectivity structure of the EEG long before overt clinical symptoms, which is what a screening model
            attempts to detect.
          </p>
        </Panel>

        <Panel title="Dementia and MCI screening">
          <p className="text-xs leading-relaxed">
            Mild cognitive impairment (MCI) is an intermediate stage between healthy ageing and dementia; a
            proportion of MCI cases progress to dementia. Detecting the transition early widens the window for
            intervention, lifestyle management and trial recruitment. The three-class problem — Normal vs MCI vs
            Dementia — is much harder than binary Normal vs Dementia, because MCI EEG signatures overlap heavily
            with both neighbours.
          </p>
        </Panel>

        <Panel title="CAUEEG dataset">
          <ul className="space-y-1 text-xs leading-relaxed">
            <li>Resting-state clinical EEG corpus with dementia-related diagnostic labels.</li>
            <li>19 channels in the standard international 10-20 montage.</li>
            <li>Sampling rate 200 Hz.</li>
            <li>Three classes used here: Normal, MCI, Dementia.</li>
            <li>Preprocessing: at most 300 s per recording, 0.5–30 Hz band-pass, 30 s analysis crop.</li>
          </ul>
        </Panel>

        <Panel title="The four biomarker streams" hint={`${TOTAL_FEATURES} handcrafted features in total`}>
          <div className="space-y-2">
            {STREAMS.map((s) => (
              <div key={s.id} className="rounded border border-border px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium">
                    <span className="num text-primary">{s.id}</span> {s.name}
                  </span>
                  <span className="num text-[11px] text-muted-foreground">{s.features} features</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{s.description}</p>
                <div className="num mt-1 text-[11px]">{s.formula}</div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="QSFE-Net and gated fusion">
            <p className="text-xs leading-relaxed">
              Each biomarker stream is encoded independently ({STREAMS.map((s) => s.features).join(" / ")} →
              64 → 32), producing four 32-dimensional embeddings that are concatenated into a 128-dimensional
              representation. A small gate network emits one sigmoid weight per stream; those weights scale the
              embeddings before a 128 → 64 → 3 classifier head. The full model has{" "}
              <span className="num">{MODEL.parameterCount.toLocaleString()}</span> trainable parameters.
            </p>
          </Panel>
          <Panel title="Interpretability">
            <p className="text-xs leading-relaxed">
              Because fusion is explicit, every prediction carries four readable numbers describing how much each
              biomarker family contributed to that forward pass. This is architectural interpretability, not causal
              explanation: a high coherence gate does not mean a patient's connectivity is abnormal.
            </p>
          </Panel>
          <Panel title="Lightweight deployment">
            <p className="text-xs leading-relaxed">
              At under 80k parameters the model runs on CPU in milliseconds and fits in memory-constrained clinical
              or field hardware — roughly 320× smaller than CEEDNet Single. Accuracy is lower than large baselines;
              the trade-off is deliberate and reported transparently on the Performance page.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}