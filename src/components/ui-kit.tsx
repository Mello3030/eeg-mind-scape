import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { classColor, pct, type ClassLabel } from "@/lib/qsfe";
import type { Analysis } from "@/services/api";

/** Progress of an in-flight upload. Scoring is synchronous server-side, so this
 * describes a request in this browser tab — it is not a stored record state. */
export type JobStatus = "UPLOAD" | "PROCESSING" | "COMPLETED" | "FAILED";

export function Panel({
  title,
  hint,
  right,
  className = "",
  emphasis = false,
  children,
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  className?: string;
  /** Structural rule instead of a hairline — for a page's primary section. */
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`${emphasis ? "panel-strong" : "panel"} panel-in ${className}`}>
      {(title || right) && (
        <header
          className={`flex items-start justify-between gap-3 px-4 py-2.5 ${
            emphasis ? "border-b-[1.5px] border-border-strong" : "border-b border-border"
          }`}
        >
          <div className="min-w-0">
            {title && <h2 className="eyebrow truncate">{title}</h2>}
            {hint && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string | undefined;
  tone?: ClassLabel | "primary" | undefined;
}) {
  const color =
    tone && tone !== "primary"
      ? classColor(tone)
      : tone === "primary"
        ? "var(--primary)"
        : undefined;
  return (
    <div className="panel panel-in relative overflow-hidden px-3.5 py-3 transition-colors hover:border-border-strong">
      {/* A colour spine reads at a glance across a row of tiles in a way a small
          dot does not, and keeps the tile itself rectangular. */}
      {color && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="label-xs block truncate">{label}</span>
      <div className="stat mt-2 text-foreground">{value}</div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Restrained loading placeholder — keeps a panel's shape while data arrives. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xs bg-surface-sunken ${className}`} />;
}

/** Failure state: what broke, and what the reader can do about it. */
export function ErrorState({
  title = "Could not load",
  body,
  onRetry,
}: {
  title?: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border px-6 py-10 text-center">
      <h3 className="eyebrow text-foreground">{title}</h3>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{body}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-control border border-border-strong px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, string> = {
    UPLOAD: "border-border bg-secondary text-muted-foreground",
    PROCESSING: "border-primary/30 bg-primary/10 text-primary",
    COMPLETED: "border-normal/40 bg-normal/10 text-foreground",
    FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={`num rounded-xs border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${map[status]}`}
    >
      {status}
    </span>
  );
}

/** Where a stored analysis came from: an uploaded recording, or a patient
 * scored out of the local CAUEEG dataset. */
export function SourceBadge({ kind }: { kind: string }) {
  const dataset = kind.startsWith("dataset");
  return (
    <span
      className={`num rounded-xs border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${
        dataset
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-secondary text-muted-foreground"
      }`}
      title={kind}
    >
      {dataset ? "dataset" : "upload"}
    </span>
  );
}

/** Shown only for dataset recordings, where the true label is known. Uploads
 * have no ground truth and render nothing. */
export function TruthBadge({ truth }: { truth: Analysis["groundTruth"] }) {
  if (!truth) return <span className="num text-[11px] text-muted-foreground">—</span>;
  return (
    <span
      className={`num rounded-xs border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${
        truth.correct
          ? "border-normal/40 bg-normal/10 text-foreground"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      }`}
      title={`True label: ${truth.className} (${truth.split} split)`}
    >
      {truth.correct ? "match" : `truth ${truth.className}`}
    </span>
  );
}

export function ClassBadge({ label }: { label: ClassLabel | null }) {
  if (!label) return <span className="num text-[11px] text-muted-foreground">—</span>;
  return (
    <span
      className="num rounded-xs border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ borderColor: classColor(label), color: classColor(label) }}
    >
      {label}
    </span>
  );
}

export function ProbabilityBars({
  normal,
  mci,
  dementia,
  compact = false,
}: {
  normal: number;
  mci: number;
  dementia: number;
  compact?: boolean;
}) {
  const rows: Array<[ClassLabel, number]> = [
    ["Normal", normal],
    ["MCI", mci],
    ["Dementia", dementia],
  ];
  return (
    <div className={compact ? "space-y-1.5" : "space-y-3"}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <div className="mb-1 flex items-baseline justify-between">
            <span className={compact ? "text-[11px]" : "text-xs font-medium"}>{label}</span>
            <span className="num text-[11px] text-muted-foreground">{pct(value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-secondary">
            <div
              className="h-full rounded-sm transition-all"
              style={{ width: `${value * 100}%`, backgroundColor: classColor(label) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xs border border-border bg-secondary/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border px-6 py-14 text-center">
      <h3 className="display-2 text-foreground">{title}</h3>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{body}</p>
      {action && (
        <Link
          to={action.to}
          className="mt-3 rounded-control bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
