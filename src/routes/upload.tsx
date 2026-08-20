import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, Panel, StatusBadge, type JobStatus } from "@/components/ui-kit";
import { Field } from "@/routes/login";
import { PIPELINE } from "@/lib/qsfe";
import { apiHealth, uploadAndAnalyse, type Sex } from "@/services/api";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "New EEG Analysis — QSFE-Net Upload" },
      {
        name: "description",
        content:
          "Upload a 19-channel EDF EEG recording and run the QSFE-Net four-stream gated fusion model.",
      },
      { property: "og:title", content: "New EEG Analysis — QSFE-Net Upload" },
      {
        property: "og:description",
        content: "Drag and drop an EDF file to run QSFE-Net inference.",
      },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientId, setPatientId] = useState("");
  const [age, setAge] = useState("70");
  const [sex, setSex] = useState<Sex>("F");
  const [notes, setNotes] = useState("");

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: apiHealth,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (input: {
      code: string;
      age: number;
      sex: Sex;
      notes: string;
      file: File;
    }) => {
      // The API scores the recording inside the same request, so this promise
      // does not resolve until inference has finished. Feature extraction
      // dominates: coherence over 171 channel pairs costs ~0.7 s per crop.
      setStatus("UPLOAD");
      const progressTimer = window.setInterval(() => {
        setProgress((prev) => Math.min(92, prev + 4));
      }, 250);
      const toProcessing = window.setTimeout(() => setStatus("PROCESSING"), 600);
      try {
        return await uploadAndAnalyse(input);
      } finally {
        window.clearInterval(progressTimer);
        window.clearTimeout(toProcessing);
        setProgress(100);
      }
    },
    onSuccess: ({ analysis }) => {
      setAnalysisId(analysis.id);
      setStatus("COMPLETED");
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    onError: (err: unknown) => {
      setStatus("FAILED");
      setError(err instanceof Error ? err.message : "Upload failed.");
    },
  });

  const validate = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".edf"))
      return "Only European Data Format (.edf) files are accepted.";
    if (f.size > 300 * 1024 * 1024) return "File exceeds the 300 MB upload limit.";
    return null;
  };

  const pick = (f: File | null) => {
    if (!f) return;
    const err = validate(f);
    setError(err);
    setFile(err ? null : f);
    setStatus(null);
    setProgress(0);
    setAnalysisId(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError("Select an EDF recording first.");
    if (!patientId.trim()) return setError("Patient ID is required.");
    setError(null);
    setProgress(0);
    mutation.mutate({ code: patientId.trim(), age: Number(age) || 0, sex, notes, file });
  };

  return (
    <AppShell
      title="New Analysis"
      subtitle="EDF upload → preprocessing → feature extraction → QSFE-Net inference"
    >
      <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <form onSubmit={submit} className="space-y-3">
          <Panel
            title="EEG recording"
            hint="EDF with at least 19 channels; resampled to 200 Hz if needed"
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2.5 border-2 border-dashed px-6 py-14 text-center transition-colors ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <FileUp
                className={`size-6 transition-colors ${
                  dragging ? "text-primary" : "text-muted-foreground"
                }`}
              />
              <p className="display-2">Drop an .edf recording</p>
              <p className="text-[11px] text-muted-foreground">or click to browse · max 300 MB</p>
              <input
                ref={inputRef}
                type="file"
                accept=".edf"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <div className="mt-3 rounded-xs border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="num truncate text-xs">{file.name}</div>
                    <div className="num text-[11px] text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB · validated EDF
                    </div>
                  </div>
                  {status && <StatusBadge status={status} />}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-xs bg-secondary">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            {error && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                <XCircle className="size-3.5" /> {error}
              </p>
            )}
          </Panel>

          <Panel
            title="Patient metadata"
            hint="Stored against the Patient record (de-identified external ID)"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Patient ID"
                value={patientId}
                onChange={setPatientId}
                placeholder="CAU-0142"
              />
              <Field label="Age" value={age} onChange={setAge} type="number" />
              <label className="block">
                <span className="label-xs">Sex</span>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as Sex)}
                  className="mt-1.5 w-full rounded-control border border-input bg-card px-3 py-2 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="F">F</option>
                  <option value="M">M</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </div>
            <label className="mt-3 block">
              <span className="label-xs">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-control border border-input bg-card px-3 py-2 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                placeholder="Referral context, session conditions, medication…"
              />
            </label>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="mt-3 rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {mutation.isPending ? "Uploading…" : "Upload & run analysis"}
            </button>
          </Panel>
        </form>

        <div className="space-y-3">
          <Panel title="Analysis status">
            <ol className="space-y-2 text-xs">
              {(["UPLOAD", "PROCESSING", "COMPLETED"] as JobStatus[]).map((s) => {
                const order = ["UPLOAD", "PROCESSING", "COMPLETED"];
                const reached = status ? order.indexOf(status) >= order.indexOf(s) : false;
                return (
                  <li key={s} className="flex items-center gap-2">
                    {status === "PROCESSING" && s === "PROCESSING" ? (
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                    ) : reached ? (
                      <CheckCircle2 className="size-3.5 text-normal" />
                    ) : (
                      <span className="size-3.5 rounded-full border border-border" />
                    )}
                    <span className={reached ? "font-medium" : "text-muted-foreground"}>{s}</span>
                  </li>
                );
              })}
            </ol>
            {status === "COMPLETED" && analysisId && (
              <button
                onClick={() => navigate({ to: "/predictions/$id", params: { id: analysisId } })}
                className="mt-3 w-full rounded-control border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
              >
                View results
              </button>
            )}
          </Panel>

          <Panel title="Inference pipeline" hint="Executed by the QSFE-Net API">
            <ol className="space-y-1.5">
              {PIPELINE.map((step, i) => (
                <li key={step} className="flex items-start gap-2 text-xs">
                  <span className="num mt-0.5 w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Panel>

          {health && !health.modelLoaded && (
            <Disclaimer>
              No checkpoint is loaded ({health.modelError ?? "unknown reason"}), so uploads cannot
              be scored. Check <span className="num">QSFE_CHECKPOINT_SUBPATH</span> and restart the
              API.
            </Disclaimer>
          )}
          {health?.modelLoaded && (
            <Disclaimer>
              Scoring runs <span className="num">{health.checkpoint}</span> on{" "}
              <span className="num">{health.device}</span>. Feature extraction is the slow step —
              expect a few seconds per recording, not milliseconds.
            </Disclaimer>
          )}
        </div>
      </div>
    </AppShell>
  );
}
