import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { classColor, pct, type ClassLabel } from "@/lib/qsfe";
import type { RecordingStatus } from "@/services/mockApi";

export function Panel({
  title,
  hint,
  right,
  className = "",
  children,
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-2.5">
          <div>
            {title && <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>}
            {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
          </div>
          {right}
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
    tone && tone !== "primary" ? classColor(tone) : tone === "primary" ? "var(--primary)" : undefined;
  return (
    <div className="panel px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} />}
        <span className="label-xs">{label}</span>
      </div>
      <div className="num mt-1.5 text-2xl font-semibold leading-none text-foreground">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: RecordingStatus }) {
  const map: Record<RecordingStatus, string> = {
    UPLOAD: "border-border bg-secondary text-muted-foreground",
    PROCESSING: "border-primary/30 bg-primary/10 text-primary",
    COMPLETED: "border-normal/40 bg-normal/10 text-foreground",
    FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  return (
    <span className={`num rounded border px-1.5 py-0.5 text-[10px] font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

export function ClassBadge({ label }: { label: ClassLabel | null }) {
  if (!label) return <span className="num text-[11px] text-muted-foreground">—</span>;
  return (
    <span
      className="num rounded border px-1.5 py-0.5 text-[11px] font-medium"
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
    <p className="rounded border border-border bg-secondary/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
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
    <div className="flex flex-col items-center justify-center gap-2 rounded border border-dashed border-border px-6 py-12 text-center">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="max-w-md text-xs text-muted-foreground">{body}</p>
      {action && (
        <Link
          to={action.to}
          className="mt-2 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
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