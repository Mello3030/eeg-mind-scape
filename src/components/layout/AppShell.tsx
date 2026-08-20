import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BrainCircuit,
  FlaskConical,
  Gauge,
  Info,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { MODEL } from "@/lib/qsfe";
import { apiHealth, modelInfo } from "@/services/api";

/** Same routes as before, grouped for the sidebar's editorial sectioning. */
const NAV_GROUPS = [
  {
    heading: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/patients", label: "Patients", icon: Users },
      { to: "/upload", label: "New Analysis", icon: Upload },
      { to: "/predictions", label: "Predictions", icon: ListOrdered },
      { to: "/analysis", label: "EEG Analysis", icon: Activity },
    ],
  },
  {
    heading: "Model",
    items: [
      { to: "/model", label: "Architecture", icon: BrainCircuit },
      { to: "/performance", label: "Performance", icon: Gauge },
    ],
  },
  {
    heading: "Reference",
    items: [
      { to: "/about", label: "About", icon: Info },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

// Spread rather than flatMap: it keeps each `to` as a literal type, which the
// router's Link needs for type-safe routes.
const NAV = [...NAV_GROUPS[0].items, ...NAV_GROUPS[1].items, ...NAV_GROUPS[2].items];

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const { data: health, isError: apiOffline } = useQuery({
    queryKey: ["health"],
    queryFn: apiHealth,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const { data: model } = useQuery({
    queryKey: ["modelInfo"],
    queryFn: modelInfo,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-sidebar-border px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground">
              <FlaskConical className="size-3.5" />
            </div>
            <div className="text-[15px] font-bold tracking-tight text-sidebar-accent-foreground">
              QSFE&#8209;Net
            </div>
          </div>
          <div className="mt-2.5 text-[10px] leading-relaxed tracking-[0.12em] text-sidebar-foreground/55 uppercase">
            EEG Dementia
            <br />
            Screening Platform
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="mb-4 last:mb-0">
              <div className="px-5 pb-1.5 text-[10px] font-semibold tracking-[0.16em] text-sidebar-foreground/40 uppercase">
                {group.heading}
              </div>
              {group.items.map(({ to, label, icon: Icon }) => {
                const active =
                  pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`relative flex items-center gap-2.5 px-5 py-1.5 text-[13px] transition-colors ${
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-[2px] bg-sidebar-primary"
                      />
                    )}
                    <Icon className="size-3.5 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border">
          <dl className="num space-y-1 px-5 py-3.5 text-[10px] leading-relaxed text-sidebar-foreground/50">
            <div className="flex justify-between gap-2">
              <dt className="tracking-wider uppercase">ckpt</dt>
              <dd className="truncate text-sidebar-foreground/75" title={model?.checkpoint ?? ""}>
                {model ? model.checkpoint : "none"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="tracking-wider uppercase">params</dt>
              <dd className="text-sidebar-foreground/75">
                {model ? model.nParameters.toLocaleString() : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="tracking-wider uppercase">device</dt>
              <dd className="text-sidebar-foreground/75">{model ? model.device : "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="tracking-wider uppercase">data</dt>
              <dd className="text-sidebar-foreground/75">
                {MODEL.dataset.name} · {MODEL.dataset.channels}ch · {MODEL.dataset.samplingRate}Hz
              </dd>
            </div>
          </dl>

          <div className="border-t border-sidebar-border p-3">
            {user ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs text-sidebar-accent-foreground">
                      {user.name}
                    </div>
                    <div className="text-[10px] tracking-wider text-sidebar-foreground/55 uppercase">
                      {user.role}
                    </div>
                  </div>
                </div>
                <button
                  aria-label="Sign out"
                  onClick={logout}
                  className="shrink-0 p-1 text-sidebar-foreground/55 transition-colors hover:text-sidebar-accent-foreground"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="block rounded-control bg-sidebar-primary px-2 py-2 text-center text-xs font-medium text-sidebar-primary-foreground transition-opacity hover:opacity-90"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b-[1.5px] border-border-strong bg-background/92 backdrop-blur-sm">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-5 pb-3 lg:px-8">
            <div className="min-w-0">
              <h1 className="display-1 text-foreground">{title}</h1>
              {subtitle && (
                <p className="mt-1.5 max-w-2xl truncate text-[11px] tracking-wide text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface px-4 py-1.5 lg:px-8">
            <span className="label-xs">Research prototype — not for clinical diagnosis</span>
            {health && !health.modelLoaded && (
              <span className="num rounded-xs border border-dementia/40 bg-dementia/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                no checkpoint loaded · predictions unavailable
              </span>
            )}
            {health?.modelLoaded && health.extractorCompatible === false && (
              <span className="num rounded-xs border border-mci/40 bg-mci/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                checkpoint predates the current feature extractor
              </span>
            )}
            {apiOffline && (
              <span className="num rounded-xs border border-dementia/40 bg-dementia/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                API unreachable · start the server (see README)
              </span>
            )}
          </div>
        </header>

        <nav className="flex gap-1.5 overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden">
          {NAV.map(({ to, label }) => {
            const active =
              pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));
            return (
              <Link
                key={to}
                to={to}
                className={`shrink-0 rounded-xs border px-2.5 py-1 text-[11px] tracking-wide whitespace-nowrap uppercase transition-colors ${
                  active
                    ? "border-border-strong bg-foreground text-background"
                    : "border-border text-muted-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>

        <footer className="border-t border-border px-4 py-4 text-[11px] leading-relaxed text-muted-foreground lg:px-8">
          QSFE-Net · Deep Learning-Based Cross-Dataset EEG Analysis for Early Dementia Detection ·
          Outputs are model predictions, not confirmed diagnoses.
        </footer>
      </div>
    </div>
  );
}
