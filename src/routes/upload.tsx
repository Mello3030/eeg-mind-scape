import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, Panel, StatusBadge } from "@/components/ui-kit";
import { Field } from "@/routes/login";
import { PIPELINE } from "@/lib/qsfe";
import { MOCK_INFERENCE, uploadAndAnalyse, type RecordingStatus, type Sex } from "@/services/mockApi";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "New EEG Analysis — QSFE-Net Upload" },
      {
        name: "description",
        content: "Upload a 19-channel EDF EEG recording and run the QSFE-Net four-stream gated fusion model.",
      },
      { property: "og:title", content: "New EEG Analysis — QSFE-Net Upload" },
      { property: "og:description", content: "Drag and drop an EDF file to run QSFE-Net inference." },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientId, setPatientId] = useState("");
  const [age, setAge] = useState("70");
  const [sex, setSex] = useState<Sex>("F");
  const [notes, setNotes] = useState("");

  const validate = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".edf")) return "Only European Data Format (.edf) files are accepted.";
    if (f.size > 200 * 1024 * 1024) return "File exceeds the 200 MB upload limit.";
    return null;
  };

  const pick = (f: File | null) => {
    if (!f) return;
    const err = validate(f);
    setError(err);
    setFile(err ? null : f);
    setStatus(err ? null : "UPLOAD");
    setProgress(0);
    setAnalysisId(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError("Select an EDF recording first.");
    if (!patientId.trim()) return setError("Patient ID is required.");
    setError(null);
    setProgress(0);
    const timer = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          window.clearInterval(timer);
          return 100;
        }
        return p + 10;
      });
    }, 90);
    window.setTimeout(() => {
      uploadAndAnalyse({
        externalPatientId: patientId.trim(),
        age: Number(age) || 0,
        sex,
        notes,
        filename: file.name,
        onStatus: (s, id) => {
          setStatus(s);
          setAnalysisId(id);
        },
      });
    }, 950);
  };

  return (
    <AppShell title="New Analysis" subtitle="EDF upload → preprocessing → feature extraction → QSFE-Net inference">
      <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <form onSubmit={submit} className="space-y-3">
          <Panel title="EEG recording" hint="19-channel EDF, 200 Hz, maximum 300 s used">
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
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed px-6 py-10 text-center transition-colors ${
                dragging ? "border-primary bg-primary/5" : "border-border bg-secondary/40"
              }`}
            >
              <FileUp className="size-5 text-muted-foreground" />
              <p className="text-xs font-medium">Drag & drop an .edf file, or click to browse</p>
              <p className="text-[11px] text-muted-foreground">Max 200 MB · EDF only</p>
              <input
                ref={inputRef}
                type="file"
                accept=".edf"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <div className="mt-3 rounded border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="num truncate text-xs">{file.name}</div>
                    <div className="num text-[11px] text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB · validated EDF
                    </div>
                  </div>
                  {status && <StatusBadge status={status} />}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-secondary">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {error && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                <XCircle className="size-3.5" /> {error}
              </p>
            )}
          </Panel>

          <Panel title="Patient metadata" hint="Stored against the Patient record (de-identified external ID)">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Patient ID" value={patientId} onChange={setPatientId} placeholder="CAU-0142" />
              <Field label="Age" value={age} onChange={setAge} type="number" />
              <label className="block">
                <span className="label-xs">Sex</span>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as Sex)}
                  className="mt-1 w-full rounded border border-input bg-card px-2.5 py-1.5 text-xs"
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
                className="mt-1 w-full rounded border border-input bg-card px-2.5 py-1.5 text-xs"
                placeholder="Referral context, session conditions, medication…"
              />
            </label>
            <button
              type="submit"
              className="mt-3 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Upload & run analysis
            </button>
          </Panel>
        </form>

        <div className="space-y-3">
          <Panel title="Analysis status">
            <ol className="space-y-2 text-xs">
              {(["UPLOAD", "PROCESSING", "COMPLETED"] as RecordingStatus[]).map((s) => {
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
                className="mt-3 w-full rounded border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
              >
                View results
              </button>
            )}
          </Panel>

          <Panel title="Inference pipeline" hint="Executed by the FastAPI ML service">
            <ol className="space-y-1.5">
              {PIPELINE.map((step, i) => (
                <li key={step} className="flex items-start gap-2 text-xs">
                  <span className="num mt-0.5 w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Panel>

          {MOCK_INFERENCE && (
            <Disclaimer>
              MOCK_INFERENCE is enabled: results are clearly-labelled demo values used to exercise the full
              workflow before the PyTorch checkpoint (<span className="num">.pth</span>) is attached. They are
              not real model output and must not be interpreted clinically.
            </Disclaimer>
          )}
        </div>
      </div>
    </AppShell>
  );
}