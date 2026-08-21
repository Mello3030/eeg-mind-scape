/**
 * Turns one prediction into a readable, per-stream account of *why* the model
 * landed on the class it did.
 *
 * The page already showed four graphs and four gate weights. Neither answers the
 * question a reader actually has — "why is this one MCI?" — because a gate says
 * how hard the model leaned on a stream, not what the stream saw. The missing
 * half is a baseline: this recording's theta/alpha ratio means nothing until you
 * know what Normal, MCI and Dementia patients look like in the data the model
 * learned from. `/model/reference` supplies that (see `ML/backend/app/reference.py`),
 * and everything below is arithmetic on top of it.
 *
 * Two honesty constraints shape the whole module:
 *
 * 1. **The reading is post-hoc, not a second opinion.** These markers are
 *    summaries of the very features the network consumed, so agreement is not
 *    independent corroboration. Disagreement is still informative — the model
 *    fuses 830 features non-linearly and can land somewhere no single marker
 *    points — and is reported rather than smoothed away.
 * 2. **Nothing is a threshold.** A marker is described by where it sits in a
 *    measured distribution, never by a clinical cut-off, and the whole readout
 *    is worth only as much as a ~53%-accurate three-class model.
 */

import type {
  Analysis,
  AnalysisDetail,
  BiomarkerReference,
  ClassLabel,
  ReferenceMarker,
  StreamKey,
} from "@/services/api";
import { CLASSES, STREAMS } from "@/lib/qsfe";

/** How a single biomarker sits against the reference distributions. */
export interface MarkerEvidence {
  key: string;
  label: string;
  description: string;
  value: number;
  /** Distance from the Normal-class mean, in Normal-class SDs. Signed. */
  z: number;
  /** The class whose mean this value sits closest to, in that class's own SDs. */
  nearest: ClassLabel;
  /** |value - mean| / sd for every class; the basis for `nearest`. */
  distance: Record<ClassLabel, number>;
  /** Class means, carried through so the UI can plot the value in context. */
  classMean: Record<ClassLabel, number>;
  /** +1 if this marker rises from Normal to Dementia in the reference data. */
  direction: number;
  /** "markedly elevated", "typical", … — derived from `z` and `direction`. */
  descriptor: string;
  /** True when the marker moved the way impairment moves it in the reference. */
  towardImpairment: boolean;
  /** True when the predicted class's reference mean lies between the other two
   *  classes' means for this marker. "Nearest MCI" then carries much less
   *  information than "nearest Normal" would: an intermediate group wins by
   *  default for any value that is merely middling. */
  predictedIsIntermediate: boolean;
  /** |Cohen's d| between the Normal and Dementia reference groups. */
  separation: number;
  /** "negligible" | "weak" | "moderate" | "strong" — how much this marker can
   *  discriminate at all, before looking at this recording. */
  separationLabel: string;
  /** True when the value sits further than OUT_OF_RANGE_SD from every class
   *  mean. `nearest` is then the least-bad of three bad fits and must not be
   *  counted as evidence for anything. */
  outOfRange: boolean;
  /** False for a marker that is out of range or barely discriminates; such a
   *  marker is displayed but excluded from the agreement tally. */
  counts: boolean;
}

export interface StreamEvidence {
  stream: StreamKey;
  name: string;
  /** Sigmoid gate the model applied to this stream for this recording. */
  gate: number;
  /** This gate as a share of all four, i.e. relative reliance. */
  gateShare: number;
  markers: MarkerEvidence[];
  /** Whether the stream's markers point at the predicted class. */
  verdict: "supports" | "mixed" | "counters" | "unmeasured";
  /** One sentence naming what this stream saw and what it means. */
  reason: string;
}

export interface Rationale {
  predicted: ClassLabel;
  confidence: number;
  /** Gap between the top two class probabilities — how decisive the call was. */
  margin: number;
  runnerUp: ClassLabel;
  streams: StreamEvidence[];
  /** Markers whose nearest class matches the prediction, out of those measured. */
  agreeing: number;
  measured: number;
  /** Gate-weighted share of marker evidence pointing at the predicted class. */
  weightedSupport: number;
  /** Markers on which the predicted class is the middle of the three groups. */
  intermediateMarkers: number;
  conclusion: string;
  caveat: string;
  reference: { split: string; nPatients: number };
}

const NUMBER_OF_MARKERS_SHOWN = 3;

/** Beyond this many SDs from every class mean, "nearest class" is meaningless —
 *  the value is simply off the map the reference drew. */
const OUT_OF_RANGE_SD = 3;

/** Below this |Cohen's d| the two end groups overlap so heavily that which mean
 *  a value lands near carries essentially no information. */
const MIN_USEFUL_SEPARATION = 0.2;

function separationLabel(d: number): string {
  if (d < MIN_USEFUL_SEPARATION) return "negligible";
  if (d < 0.5) return "weak";
  if (d < 0.8) return "moderate";
  return "strong";
}

/** Descriptor bands, in SDs of the reference Normal group. */
function describe(z: number, direction: number): string {
  const magnitude = Math.abs(z);
  if (magnitude < 0.5) return "within the normal range";
  const strength = magnitude < 1 ? "slightly" : magnitude < 2 ? "clearly" : "markedly";
  // `direction` says which way impairment moves this marker, so the same word
  // means the same thing to a reader across all four streams.
  const word = z > 0 ? "elevated" : "reduced";
  const suffix = (z > 0 ? 1 : -1) === direction ? "" : " (the healthy direction)";
  return `${strength} ${word}${suffix}`;
}

function nearestClass(
  value: number,
  marker: ReferenceMarker,
): { nearest: ClassLabel; distance: Record<ClassLabel, number> } {
  const distance = {} as Record<ClassLabel, number>;
  let nearest: ClassLabel = CLASSES[0]!;
  let best = Infinity;
  for (const cls of CLASSES) {
    const stats = marker.by_class[cls];
    if (!stats) {
      distance[cls] = Infinity;
      continue;
    }
    // Guard a degenerate SD so one flat marker cannot dominate by dividing by ~0.
    const sd = stats.sd > 1e-9 ? stats.sd : 1;
    const d = Math.abs(value - stats.mean) / sd;
    distance[cls] = d;
    if (d < best) {
      best = d;
      nearest = cls;
    }
  }
  return { nearest, distance };
}

/** Pull one marker's value out of the decoded biomarker summary. */
function markerValue(bio: NonNullable<AnalysisDetail["biomarkers"]>, key: string): number | null {
  const summary = bio.summary ?? {};
  const direct = summary[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  // The relative-power markers live one level down, in a band -> fraction object.
  const relative = summary["relative_band_power"];
  if (relative && typeof relative === "object") {
    const band = key.replace("relative_", "").replace("_power", "");
    const value = (relative as Record<string, number>)[band];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function verdictOf(markers: MarkerEvidence[], predicted: ClassLabel): StreamEvidence["verdict"] {
  // A marker that is off the reference map, or that barely separates the
  // classes, is shown to the reader but gets no vote. A stream made only of
  // those is "unmeasured" rather than falsely unanimous.
  const usable = markers.filter((m) => m.counts);
  if (!usable.length) return "unmeasured";
  const agree = usable.filter((m) => m.nearest === predicted).length;
  if (agree === usable.length) return "supports";
  if (agree === 0) return "counters";
  return "mixed";
}

/** The sentence that carries the actual explanation for one stream. */
function reasonFor(
  stream: (typeof STREAMS)[number],
  markers: MarkerEvidence[],
  verdict: StreamEvidence["verdict"],
  gate: number,
  predicted: ClassLabel,
): string {
  if (!markers.length) {
    return `No reference distribution is available for ${stream.id}, so this stream's contribution cannot be placed against the training cohort.`;
  }

  const lead = markers[0]!;

  if (verdict === "unmeasured") {
    const offMap = markers.filter((m) => m.outOfRange);
    const weak = markers.filter((m) => !m.outOfRange && !m.counts);
    const parts: string[] = [];
    if (offMap.length) {
      parts.push(
        `${offMap.map((m) => m.label).join(" and ")} sits more than ${OUT_OF_RANGE_SD} SD from ` +
          `every class mean (${offMap[0]!.value.toFixed(3)} against a Normal mean of ` +
          `${offMap[0]!.classMean.Normal.toFixed(3)}), so it is off the map the training cohort ` +
          `drew rather than close to any group`,
      );
    }
    if (weak.length) {
      parts.push(
        `${weak.map((m) => m.label).join(" and ")} separates Normal from Dementia only ` +
          `${weak[0]!.separationLabel}ly (d = ${weak[0]!.separation.toFixed(2)}), so which class ` +
          `mean it lands nearest carries almost no information`,
      );
    }
    return (
      `${stream.id} gives no usable evidence for this recording: ${parts.join("; ")}. ` +
      `The model still applied a gate of ${gate.toFixed(3)} to it, but nothing here should be ` +
      `read as a reason for the ${predicted} call.`
    );
  }
  const reliance =
    gate >= 0.66
      ? "leaned on it heavily"
      : gate >= 0.33
        ? "gave it moderate weight"
        : "down-weighted it";

  const head =
    `${lead.label} is ${lead.value.toFixed(3)}, ${lead.descriptor} against the training ` +
    `cohort (Normal ${lead.classMean.Normal.toFixed(3)}, MCI ${lead.classMean.MCI.toFixed(3)}, ` +
    `Dementia ${lead.classMean.Dementia.toFixed(3)}) — closest to the ${lead.nearest} group. ` +
    `This marker separates Normal from Dementia ${lead.separationLabel}ly (d = ${lead.separation.toFixed(2)}).`;

  const others = markers.slice(1);
  const support = others.length
    ? ` ${others.map((m) => `${m.label} is ${m.descriptor} (nearest ${m.nearest})`).join(", ")}.`
    : "";

  const tail =
    verdict === "supports"
      ? ` This stream points at ${predicted}, and the gate of ${gate.toFixed(3)} shows the model ${reliance}.`
      : verdict === "counters"
        ? ` This stream does not point at ${predicted} — the gate of ${gate.toFixed(3)} shows the model ${reliance}, so the call rests on the other streams.`
        : ` The markers here are split rather than unanimous; the gate of ${gate.toFixed(3)} shows the model ${reliance}.`;

  return head + support + tail;
}

/**
 * Build the full readout. Returns `null` when the prediction carries no decoded
 * biomarkers (features from an older extractor) or the reference is unavailable —
 * the UI shows nothing rather than an explanation resting on absent data.
 */
export function buildRationale(
  detail: AnalysisDetail | Analysis | null | undefined,
  reference: BiomarkerReference | null | undefined,
): Rationale | null {
  if (!detail || !reference?.markers) return null;
  const bio = "biomarkers" in detail ? detail.biomarkers : null;
  if (!bio?.summary) return null;

  const predicted = detail.prediction;
  const gates = detail.gateWeights;
  const gateTotal = STREAMS.reduce((sum, s) => sum + (gates[s.id] ?? 0), 0) || 1;

  const streams: StreamEvidence[] = STREAMS.map((stream) => {
    const markers: MarkerEvidence[] = Object.values(reference.markers)
      .filter((m) => m.stream === stream.id)
      .map((marker) => {
        const value = markerValue(bio, marker.key);
        if (value === null) return null;
        const normal = marker.by_class.Normal;
        if (!normal) return null;

        const sd = normal.sd > 1e-9 ? normal.sd : 1;
        const z = (value - normal.mean) / sd;
        const { nearest, distance } = nearestClass(value, marker);
        const classMean = {} as Record<ClassLabel, number>;
        for (const cls of CLASSES) classMean[cls] = marker.by_class[cls]?.mean ?? NaN;

        const means = CLASSES.map((c) => marker.by_class[c]?.mean).filter(
          (m): m is number => typeof m === "number" && Number.isFinite(m),
        );
        const predictedMean = marker.by_class[predicted]?.mean;
        const predictedIsIntermediate =
          means.length === CLASSES.length &&
          typeof predictedMean === "number" &&
          predictedMean > Math.min(...means) &&
          predictedMean < Math.max(...means);

        const closest = Math.min(...CLASSES.map((c) => distance[c]).filter(Number.isFinite));
        const outOfRange = closest > OUT_OF_RANGE_SD;
        const separation = marker.separation ?? 0;

        return {
          key: marker.key,
          label: marker.label,
          description: marker.description,
          value,
          z,
          nearest,
          distance,
          classMean,
          direction: marker.direction,
          descriptor: describe(z, marker.direction),
          towardImpairment: Math.abs(z) >= 0.5 && (z > 0 ? 1 : -1) === marker.direction,
          predictedIsIntermediate,
          separation,
          separationLabel: separationLabel(separation),
          outOfRange,
          counts: !outOfRange && separation >= MIN_USEFUL_SEPARATION,
        } satisfies MarkerEvidence;
      })
      .filter((m): m is MarkerEvidence => m !== null)
      // Strongest deviation first: that is the one worth naming in the sentence.
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, NUMBER_OF_MARKERS_SHOWN);

    const gate = gates[stream.id] ?? 0;
    const verdict = verdictOf(markers, predicted);
    return {
      stream: stream.id,
      name: stream.name,
      gate,
      gateShare: gate / gateTotal,
      markers,
      verdict,
      reason: reasonFor(stream, markers, verdict, gate, predicted),
    };
  });

  const allMarkers = streams.flatMap((s) => s.markers);
  // Only markers that are on the map and actually discriminate get a vote; the
  // rest stay visible in the tables but must not pad the agreement count.
  const usableMarkers = allMarkers.filter((m) => m.counts);
  const measured = usableMarkers.length;
  const agreeing = usableMarkers.filter((m) => m.nearest === predicted).length;
  const discarded = allMarkers.length - usableMarkers.length;
  const intermediateMarkers = usableMarkers.filter((m) => m.predictedIsIntermediate).length;

  // Weight each stream's agreement by how hard the model gated it, so a stream
  // the model ignored does not get an equal vote in the summary.
  const weightedSupport =
    streams.reduce((sum, s) => {
      const usable = s.markers.filter((m) => m.counts);
      if (!usable.length) return sum;
      const share = usable.filter((m) => m.nearest === predicted).length / usable.length;
      return sum + share * s.gateShare;
    }, 0) /
    (streams.reduce((sum, s) => sum + (s.markers.some((m) => m.counts) ? s.gateShare : 0), 0) || 1);

  const sorted = [...CLASSES].sort(
    (a, b) => (detail.probabilities[b] ?? 0) - (detail.probabilities[a] ?? 0),
  );
  const top = sorted[0]!;
  const runnerUp = sorted[1] ?? top;
  const margin = (detail.probabilities[top] ?? 0) - (detail.probabilities[runnerUp] ?? 0);

  const dominant = [...streams].sort((a, b) => b.gate - a.gate)[0]!;
  const supporting = streams.filter((s) => s.verdict === "supports").map((s) => s.stream);
  const countering = streams.filter((s) => s.verdict === "counters").map((s) => s.stream);

  const conclusion = buildConclusion({
    predicted,
    confidence: detail.confidence,
    margin,
    runnerUp,
    agreeing,
    measured,
    weightedSupport,
    dominant,
    supporting,
    countering,
    intermediateMarkers,
    discarded,
  });

  return {
    predicted,
    confidence: detail.confidence,
    margin,
    runnerUp,
    streams,
    agreeing,
    measured,
    weightedSupport,
    intermediateMarkers,
    conclusion,
    caveat:
      "These markers summarise the same features the network consumed, so agreement is not an " +
      "independent second opinion. Reference values are population statistics from the CAUEEG " +
      "training split, not diagnostic thresholds, and the model's own three-class test accuracy " +
      "is around 53% — treat this as a research readout, never as a diagnosis.",
    reference: { split: reference.split, nPatients: reference.n_patients },
  };
}

function buildConclusion(input: {
  predicted: ClassLabel;
  confidence: number;
  margin: number;
  runnerUp: ClassLabel;
  agreeing: number;
  measured: number;
  weightedSupport: number;
  dominant: StreamEvidence;
  supporting: StreamKey[];
  countering: StreamKey[];
  intermediateMarkers: number;
  discarded: number;
}): string {
  const {
    predicted,
    confidence,
    margin,
    runnerUp,
    agreeing,
    measured,
    weightedSupport,
    dominant,
    supporting,
    countering,
    intermediateMarkers,
    discarded,
  } = input;

  const decisiveness =
    margin >= 0.3
      ? "a clear margin"
      : margin >= 0.1
        ? "a modest margin"
        : "a narrow margin — the second class was close behind";

  const sentences: string[] = [];

  sentences.push(
    `QSFE-Net returned ${predicted} at ${(confidence * 100).toFixed(1)}% confidence, ` +
      `${(margin * 100).toFixed(1)} points ahead of ${runnerUp} — ${decisiveness}.`,
  );

  if (!measured) {
    sentences.push(
      "None of the decoded markers can be placed against the training cohort — every one is " +
        "either off the reference range or too weak a discriminator to carry information, so " +
        "this readout cannot say why the model chose this class.",
    );
    return sentences.join(" ");
  }

  sentences.push(
    `Of the ${measured} decoded marker${measured === 1 ? "" : "s"} placed against the training ` +
      `cohort, ${agreeing} ${agreeing === 1 ? "sits" : "sit"} closest to the ${predicted} group; ` +
      `weighting each stream by the gate the model actually ` +
      `applied puts ${(weightedSupport * 100).toFixed(0)}% of the evidence behind that call.`,
  );

  if (discarded) {
    sentences.push(
      `${discarded} further marker${discarded === 1 ? " was" : "s were"} set aside as ` +
        `uninformative — either sitting outside the range the training cohort covers, or ` +
        `separating Normal from Dementia too weakly for "nearest class" to mean anything.`,
    );
  }

  sentences.push(
    `The heaviest gate was ${dominant.stream} (${dominant.name}) at ${dominant.gate.toFixed(3)}, ` +
      `so that stream drove the decision more than the others.`,
  );

  if (supporting.length && countering.length) {
    sentences.push(
      `${supporting.join(", ")} point at ${predicted} while ${countering.join(", ")} do not, ` +
        `which is the usual picture in this cohort: no single stream is decisive on its own, and ` +
        `the fusion layer is what resolves them.`,
    );
  } else if (countering.length === 0 && supporting.length) {
    sentences.push(
      `No stream contradicts the call — every stream with a reference distribution points the ` +
        `same way, which is the most internally consistent case this readout can show.`,
    );
  } else if (supporting.length === 0) {
    sentences.push(
      `No individual stream points at ${predicted} on its own. The prediction rests on the ` +
        `non-linear combination of all 830 features rather than on any marker visible here — ` +
        `treat this particular result with more caution than usual.`,
    );
  }

  // The reference means for MCI fall between Normal and Dementia on every
  // marker measured so far, so an intermediate class wins "nearest" for any
  // middling value. Saying so is the difference between an explanation and a
  // flattering one.
  if (measured && intermediateMarkers >= measured / 2) {
    sentences.push(
      `Read that agreement with care: on ${intermediateMarkers} of the ${measured} markers the ` +
        `${predicted} group's reference mean lies between the other two classes, so a value that ` +
        `is merely middling lands nearest ${predicted} by default. The marker agreement above is ` +
        `weaker evidence here than the same count would be for an end class.`,
    );
  }

  return sentences.join(" ");
}
