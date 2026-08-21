import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { GraduationCap, Linkedin } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { modelInfo, modelPerformance } from "@/services/api";
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
        content:
          "Scientific background, dataset, biomarkers and limitations of the QSFE-Net research prototype.",
      },
    ],
  }),
  component: AboutPage,
});

/**
 * Project credits. Names are as they appear on each linked profile; roles are as
 * stated by the team. No biography text is invented here — add a `bio` line to a
 * member if you want one shown.
 */
const TEAM: ReadonlyArray<{
  name: string;
  role: string;
  href: string;
  lead?: boolean;
  /** Optional short bio. Nothing renders when absent — do not invent one. */
  bio?: string;
}> = [
  {
    name: "Sanchit Raut",
    role: "Team lead",
    href: "https://www.linkedin.com/in/sanchit-raut-b96b9a2b3/",
    lead: true,
  },
  {
    name: "Vedant Kannurkar",
    role: "Team member",
    href: "https://www.linkedin.com/in/vedant-kannurkar/",
  },
  {
    name: "Siddarth Potdar",
    role: "Team member",
    href: "https://www.linkedin.com/in/siddarth-potdar-671888229/",
  },
];

const GUIDE = {
  name: "Sujata Kulkarni",
  role: "Project guide",
  href: "https://www.researchgate.net/profile/Sujata-Kulkarni-2",
} as const;

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function AboutPage() {
  const { user } = useAuth();
  const { data: model } = useQuery({ queryKey: ["modelInfo"], queryFn: modelInfo, retry: false });
  const { data: perf } = useQuery({
    queryKey: ["modelPerformance", "test"],
    queryFn: () => modelPerformance("test"),
    staleTime: 30 * 60_000,
    retry: false,
  });

  return (
    <AppShell
      publicPage
      title="About"
      subtitle="Deep Learning-Based Cross-Dataset EEG Analysis for Early Dementia Detection"
      actions={
        !user ? (
          <Link
            to="/login"
            className="rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        ) : undefined
      }
    >
      {/* Editorial lead: the single most important statement on the page gets a
          full-width band and display type before the reference panels begin. */}
      <section className="panel-strong panel-in mb-3 overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.6fr_1fr]">
          <div className="p-6 lg:p-8">
            <div className="label-xs">Quadrant-Stream Fusion EEG Network</div>
            <h2 className="display-1 mt-3 max-w-2xl">
              A 79,431-parameter model that shows its working.
            </h2>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              Four clinically grounded feature streams are encoded separately and fused with learned
              per-patient gates, so every prediction carries the stream weights that produced it —
              not just a label.
            </p>
          </div>
          <dl className="num grid grid-cols-3 border-t border-border lg:grid-cols-1 lg:border-t-0 lg:border-l">
            {[
              ["Parameters", model ? model.nParameters.toLocaleString() : "—"],
              ["Test accuracy", perf ? pct(perf.accuracy) : "—"],
              ["Chance level", "33.3%"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="border-border p-4 not-last:border-r lg:not-last:border-r-0 lg:not-last:border-b lg:p-5"
              >
                <dt className="label-xs">{k}</dt>
                <dd className="stat mt-1.5 text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel emphasis title="Research prototype — not for clinical diagnosis">
          <p className="text-xs leading-relaxed">
            QSFE-Net is a final-year research project. Every output of this platform is a{" "}
            <strong>model prediction</strong>: a statistical estimate produced from a short EEG
            segment. It is not a diagnosis, is not validated for clinical use, and must never inform
            patient care. Dementia and MCI diagnosis requires clinical assessment,
            neuropsychological testing and imaging performed by qualified clinicians.
          </p>
          <Disclaimer>
            {perf
              ? `At ${pct(perf.accuracy)} three-class test accuracy (measured on ${perf.nEvaluated} held-out patients) the model is above the 33.3% chance level but far below clinical reliability.`
              : "Three-class accuracy is far below clinical reliability; see the Performance page for the measured figures."}
          </Disclaimer>
        </Panel>

        <Panel title="Electroencephalography (EEG)">
          <p className="text-xs leading-relaxed">
            EEG records the summed post-synaptic potentials of cortical neuron populations from
            scalp electrodes at millisecond resolution. It is inexpensive, non-invasive and widely
            available, which makes it attractive for large-scale screening compared with MRI or PET.
            Neurodegeneration alters the rhythmic and connectivity structure of the EEG long before
            overt clinical symptoms, which is what a screening model attempts to detect.
          </p>
        </Panel>

        <Panel title="Dementia and MCI screening">
          <p className="text-xs leading-relaxed">
            Mild cognitive impairment (MCI) is an intermediate stage between healthy ageing and
            dementia; a proportion of MCI cases progress to dementia. Detecting the transition early
            widens the window for intervention, lifestyle management and trial recruitment. The
            three-class problem — Normal vs MCI vs Dementia — is much harder than binary Normal vs
            Dementia, because MCI EEG signatures overlap heavily with both neighbours.
          </p>
        </Panel>

        <Panel title="CAUEEG dataset">
          <ul className="space-y-1 text-xs leading-relaxed">
            <li>Resting-state clinical EEG corpus with dementia-related diagnostic labels.</li>
            <li>19 channels in the standard international 10-20 montage.</li>
            <li>Sampling rate 200 Hz.</li>
            <li>Three classes used here: Normal, MCI, Dementia.</li>
            <li>
              Preprocessing: at most 300 s per recording, 0.5–30 Hz band-pass, 30 s analysis crop.
            </li>
          </ul>
        </Panel>

        <Panel
          title="The four biomarker streams"
          hint={`${TOTAL_FEATURES} handcrafted features in total`}
        >
          <div className="space-y-2">
            {STREAMS.map((s) => (
              <div key={s.id} className="rounded-xs border border-border px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium">
                    <span className="num text-primary">{s.id}</span> {s.name}
                  </span>
                  <span className="num text-[11px] text-muted-foreground">
                    {s.features} features
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {s.description}
                </p>
                <div className="num mt-1 text-[11px]">{s.formula}</div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="QSFE-Net and gated fusion">
            <p className="text-xs leading-relaxed">
              Each biomarker stream is encoded independently (
              {STREAMS.map((s) => s.features).join(" / ")} → 64 → 32), producing four 32-dimensional
              embeddings that are concatenated into a 128-dimensional representation. A small gate
              network emits one sigmoid weight per stream; those weights scale the embeddings before
              a 128 → 64 → 3 classifier head. The full model has{" "}
              <span className="num">{model ? model.nParameters.toLocaleString() : "…"}</span>{" "}
              trainable parameters.
            </p>
          </Panel>
          <Panel title="Interpretability">
            <p className="text-xs leading-relaxed">
              Because fusion is explicit, every prediction carries four readable numbers describing
              how much each biomarker family contributed to that forward pass. This is architectural
              interpretability, not causal explanation: a high coherence gate does not mean a
              patient's connectivity is abnormal.
            </p>
          </Panel>
          <Panel title="Lightweight deployment">
            <p className="text-xs leading-relaxed">
              At under 80k parameters the model runs on CPU in milliseconds and fits in
              memory-constrained clinical or field hardware — roughly 320× smaller than CEEDNet
              Single. Accuracy is lower than large baselines; the trade-off is deliberate and
              reported transparently on the Performance page.
            </p>
          </Panel>
        </div>
      </div>

      {/* Credits. External profiles open in a new tab and carry rel="noreferrer"
          so the linked site cannot reach back through window.opener. */}
      <section className="panel-strong mt-3 overflow-hidden">
        <header className="border-b border-border-strong px-5 py-4">
          <div className="label-xs">Credits</div>
          <h2 className="display-2 mt-1.5 text-foreground">Created by</h2>
          <p className="mt-1.5 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            Final-year research project. QSFE-Net, the feature pipeline, the API and this platform
            were built by the team below.
          </p>
        </header>

        <ul className="grid sm:grid-cols-3">
          {TEAM.map((member) => (
            <li
              key={member.name}
              className={`border-border p-5 not-last:border-b sm:not-last:border-r sm:not-last:border-b-0 ${
                member.lead ? "bg-primary/[0.04]" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  aria-hidden
                  className={`num flex size-10 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                    member.lead
                      ? "bg-primary text-primary-foreground"
                      : "border border-border-strong bg-secondary text-foreground"
                  }`}
                >
                  {initials(member.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-foreground">
                    {member.name}
                  </div>
                  {member.lead ? (
                    <span className="mt-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-primary-foreground uppercase">
                      {member.role}
                    </span>
                  ) : (
                    <div className="mt-0.5 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      {member.role}
                    </div>
                  )}
                </div>
              </div>

              {member.bio && (
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {member.bio}
                </p>
              )}

              <a
                href={member.href}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:bg-secondary hover:text-foreground"
              >
                <Linkedin className="size-3.5 shrink-0" />
                LinkedIn
              </a>
            </li>
          ))}
        </ul>

        <div className="border-t border-border bg-surface px-5 py-4">
          <div className="label-xs">Under the guidance of</div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                aria-hidden
                className="num flex size-10 shrink-0 items-center justify-center rounded-full border border-border-strong bg-card text-[12px] font-semibold text-foreground"
              >
                {initials(GUIDE.name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-foreground">
                  {GUIDE.name}
                </div>
                <div className="mt-0.5 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  {GUIDE.role}
                </div>
              </div>
            </div>
            <a
              href={GUIDE.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:bg-card hover:text-foreground"
            >
              <GraduationCap className="size-3.5 shrink-0" />
              ResearchGate
            </a>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
