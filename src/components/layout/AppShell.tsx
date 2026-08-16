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
import { MOCK_INFERENCE } from "@/services/mockApi";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/upload", label: "New Analysis", icon: Upload },
  { to: "/predictions", label: "Predictions", icon: ListOrdered },
  { to: "/analysis", label: "EEG Analysis", icon: Activity },
  { to: "/model", label: "Model Architecture", icon: BrainCircuit },
  { to: "/performance", label: "Performance", icon: Gauge },
  { to: "/about", label: "About", icon: Info },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

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

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
          <div className="flex size-8 items-center justify-center rounded bg-sidebar-primary/15 text-sidebar-primary">
            <FlaskConical className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-sidebar-accent-foreground">QSFE-Net</div>
            <div className="num text-[10px] text-sidebar-foreground/60">EEG Dementia Screening</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2.5 rounded px-2.5 py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-sidebar-border p-3">
          <div className="num text-[10px] leading-relaxed text-sidebar-foreground/55">
            <div>model {MODEL.version}</div>
            <div>{MODEL.parameterCount.toLocaleString()} params</div>
            <div>dataset CAUEEG · 19 ch · 200 Hz</div>
          </div>
          {user ? (
            <div className="flex items-center justify-between rounded border border-sidebar-border px-2 py-1.5">
              <div className="min-w-0">
                <div className="truncate text-xs text-sidebar-accent-foreground">{user.name}</div>
                <div className="num text-[10px] text-sidebar-foreground/60">{user.role}</div>
              </div>
              <button
                aria-label="Sign out"
                onClick={logout}
                className="text-sidebar-foreground/60 transition-colors hover:text-sidebar-accent-foreground"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="block rounded bg-sidebar-primary px-2 py-1.5 text-center text-xs font-medium text-sidebar-primary-foreground"
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-semibold text-foreground">{title}</h1>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-secondary/50 px-4 py-1.5 lg:px-6">
            <span className="label-xs">Research prototype — not for clinical diagnosis</span>
            {MOCK_INFERENCE && (
              <span className="num rounded border border-mci/40 bg-mci/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                MOCK_INFERENCE = true · demo data
              </span>
            )}
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden">
          {NAV.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 px-4 py-5 lg:px-6">{children}</main>

        <footer className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground lg:px-6">
          QSFE-Net · Deep Learning-Based Cross-Dataset EEG Analysis for Early Dementia Detection · Outputs
          are model predictions, not confirmed diagnoses.
        </footer>
      </div>
    </div>
  );
}