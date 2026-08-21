import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BrainCircuit,
  Brain,
  Gauge,
  Info,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { MobileNav } from "@/components/layout/MobileNav";
import { useAuth } from "@/context/AuthContext";
import { MODEL } from "@/lib/qsfe";
import { apiHealth, modelInfo } from "@/services/api";

/**
 * Navigation groups. The same nine routes as before — grouping and order are
 * presentational only. `System` is pinned to the bottom of the rail.
 */
const NAV_GROUPS = [
  {
    heading: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/patients", label: "Patients", icon: Users },
      { to: "/upload", label: "New Analysis", icon: Upload },
    ],
  },
  {
    heading: "Analysis",
    items: [
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
] as const;

const BOTTOM_GROUP = {
  heading: "System",
  items: [
    { to: "/about", label: "About", icon: Info },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
} as const;

const ALL_GROUPS = [...NAV_GROUPS, BOTTOM_GROUP];

export function AppShell({
  title,
  subtitle,
  actions,
  breadcrumbLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Label for the final breadcrumb on detail routes (a code, not a raw id). */
  breadcrumbLabel?: string | undefined;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  // Signing out on a data page would otherwise leave every panel 401ing in place.
  const signOut = () => {
    logout();
    navigate({ to: "/login" });
  };
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Unchanged active-route rule: exact match, or a parent of a detail route.
  const isActive = (to: string) =>
    pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground backdrop-blur-xl transition-[width] duration-200 ease-out lg:flex ${
          collapsed ? "w-[72px]" : "w-[212px]"
        }`}
      >
        {/* Profile sits at the top of the rail, as the reference has it. */}
        <div className="border-b border-sidebar-border p-3">
          {user ? (
            <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
              <div
                title={collapsed ? `${user.name} · ${user.role}` : undefined}
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-[11px] font-semibold text-sidebar-accent-foreground"
              >
                {user.name.slice(0, 1).toUpperCase()}
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-sidebar-accent-foreground">
                      {user.name}
                    </div>
                    <div className="truncate text-[10px] tracking-wider text-sidebar-foreground/50 uppercase">
                      {user.role}
                    </div>
                  </div>
                  <button
                    aria-label="Sign out"
                    title="Sign out"
                    onClick={signOut}
                    className="shrink-0 rounded-control p-1.5 text-sidebar-foreground/50 transition-colors duration-150 hover:bg-white/10 hover:text-sidebar-accent-foreground"
                  >
                    <LogOut className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-control bg-sidebar-primary text-sidebar-primary-foreground">
                <Brain className="size-4" />
              </div>
              {!collapsed && (
                <Link
                  to="/login"
                  className="min-w-0 flex-1 truncate text-[13px] font-medium text-sidebar-accent-foreground hover:underline"
                >
                  Sign in
                </Link>
              )}
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col overflow-y-auto px-2.5 py-4">
          {NAV_GROUPS.map((group) => (
            <NavGroup
              key={group.heading}
              heading={group.heading}
              items={group.items}
              collapsed={collapsed}
              isActive={isActive}
            />
          ))}

          {/* Pinned to the bottom of the rail, per the reference layout. */}
          <div className="mt-auto pt-4">
            <NavGroup
              heading={BOTTOM_GROUP.heading}
              items={BOTTOM_GROUP.items}
              collapsed={collapsed}
              isActive={isActive}
            />
          </div>
        </nav>

        {!collapsed && (
          <div className="px-3 pb-3">
            <div className="rounded-control border border-white/8 bg-white/[0.04] px-3 py-2.5">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${
                    model ? "bg-normal" : "bg-sidebar-foreground/30"
                  }`}
                />
                <span className="text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                  {model ? "Model loaded" : "No checkpoint"}
                </span>
              </div>
              <dl className="num space-y-0.5 text-[10px] text-sidebar-foreground/50">
                {[
                  ["ckpt", model ? model.checkpoint : "none"],
                  ["params", model ? model.nParameters.toLocaleString() : "—"],
                  ["device", model ? model.device : "—"],
                  ["data", `${MODEL.dataset.name} · ${MODEL.dataset.channels}ch`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="tracking-wider uppercase">{k}</dt>
                    <dd className="truncate text-sidebar-foreground/75" title={v}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        <div className="border-t border-sidebar-border p-2.5">
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-[12px] text-sidebar-foreground/55 transition-colors duration-150 hover:bg-white/[0.055] hover:text-sidebar-accent-foreground ${
              collapsed ? "justify-center" : ""
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="size-4 shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact application taskbar: breadcrumbs left, existing actions right. */}
        <header className="sticky top-0 z-10 border-b border-border bg-background/92 backdrop-blur-sm">
          <div className="flex h-16 items-center gap-4 px-4 lg:px-8">
            <Breadcrumbs leafLabel={breadcrumbLabel} />
            <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
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

        <MobileNav
          open={drawerOpen}
          onOpen={() => setDrawerOpen(true)}
          onClose={() => setDrawerOpen(false)}
          groups={ALL_GROUPS}
          isActive={isActive}
          user={user}
          logout={signOut}
        />

        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mb-6">
            <h1 className="display-1 text-foreground">{title}</h1>
            {subtitle && (
              <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          {children}
        </main>

        <footer className="border-t border-border px-4 py-4 text-[11px] leading-relaxed text-muted-foreground lg:px-8">
          QSFE-Net · Deep Learning-Based Cross-Dataset EEG Analysis for Early Dementia Detection ·
          Outputs are model predictions, not confirmed diagnoses.
        </footer>
      </div>
    </div>
  );
}

/** One labelled group of rail items. */
function NavGroup({
  heading,
  items,
  collapsed,
  isActive,
}: {
  heading: string;
  items: readonly { readonly to: string; readonly label: string; readonly icon: typeof Users }[];
  collapsed: boolean;
  isActive: (to: string) => boolean;
}) {
  return (
    <div className="mb-6 last:mb-0">
      {!collapsed && (
        <div className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.16em] text-sidebar-foreground/40 uppercase">
          {heading}
        </div>
      )}
      <div className="space-y-1">
        {items.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={`group flex h-10 items-center gap-3 rounded-control border px-3 text-[13px] font-medium transition-colors duration-150 ${
                collapsed ? "justify-center" : ""
              } ${
                active
                  ? "border-white/[0.08] bg-white/[0.11] text-sidebar-accent-foreground"
                  : "border-transparent text-sidebar-foreground/75 hover:bg-white/[0.055] hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon
                className={`size-4 shrink-0 transition-colors ${
                  active
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80"
                }`}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
