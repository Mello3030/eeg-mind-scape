import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiHealth } from "@/services/api";

export const Route = createFileRoute("/login")({
  // Set by the shell's guard when an unauthenticated visitor asks for a page.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  head: () => ({
    meta: [
      { title: "Sign in — QSFE-Net Research Platform" },
      {
        name: "description",
        content: "Sign in to the QSFE-Net EEG dementia screening research platform.",
      },
      { property: "og:title", content: "Sign in — QSFE-Net Research Platform" },
      { property: "og:description", content: "Researcher and administrator access to QSFE-Net." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  // Never bounce back to an absolute URL a query string could smuggle in.
  const target = redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const server = useServerWake();

  // Landing here with a live session is a dead end otherwise.
  useEffect(() => {
    if (user) navigate({ to: target });
  }, [user, navigate, target]);

  return (
    <AuthLayout title="Sign in" subtitle="Researcher access to the QSFE-Net analysis workspace">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await login(email, password);
            navigate({ to: target });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Sign in failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Password" value={password} onChange={setPassword} type="password" />
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy || server.state === "cold" || server.state === "waking"}
          className="w-full rounded-control bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <ServerWakePanel server={server} />
        <p className="text-[11px] text-muted-foreground">
          No account?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Register
          </Link>{" "}
          ·{" "}
          <Link to="/about" className="text-primary hover:underline">
            About this project
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Editorial slab: the statement half. Hidden on small screens, where the
          form is the only thing that matters. */}
      <aside className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-14">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground">
            <Brain className="size-3.5" />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-sidebar-accent-foreground">
            QSFE&#8209;Net
          </span>
        </div>

        <div>
          <div className="text-[10px] font-semibold tracking-[0.16em] text-sidebar-foreground/45 uppercase">
            Quadrant-Stream Fusion EEG Network
          </div>
          <h2 className="mt-5 text-[clamp(1.9rem,3.2vw,3rem)] leading-[1.03] font-bold tracking-[-0.035em] text-sidebar-accent-foreground">
            Interpretable EEG
            <br />
            screening for early
            <br />
            cognitive decline.
          </h2>
          <p className="mt-5 max-w-md text-[13px] leading-relaxed text-sidebar-foreground/65">
            Four clinically grounded feature streams — frequency slowing, coherence, spectral
            entropy and hemispheric asymmetry — fused with learned per-patient gates, so every
            prediction ships with the weights that produced it.
          </p>
        </div>

        <dl className="num grid grid-cols-3 gap-6 border-t border-sidebar-border pt-6 text-sidebar-foreground/55">
          {[
            ["830", "features"],
            ["79,431", "parameters"],
            ["3", "classes"],
          ].map(([v, k]) => (
            <div key={k}>
              <dt className="text-[10px] tracking-[0.14em] uppercase">{k}</dt>
              <dd className="mt-1 text-lg text-sidebar-accent-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-2 lg:hidden">
            <div className="flex size-7 items-center justify-center bg-primary text-primary-foreground">
              <Brain className="size-3.5" />
            </div>
            <span className="text-sm font-bold tracking-tight">QSFE&#8209;Net</span>
          </div>

          <div className="label-xs">Access</div>
          <h1 className="display-1 mt-2">{title}</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>

          <div className="mt-7 border-t-[1.5px] border-border-strong pt-7">{children}</div>

          <p className="mt-8 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
            Research prototype — not for clinical diagnosis. Demo credentials are validated
            client-side only.
          </p>
        </div>
      </main>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <label className="block">
      <span className="label-xs">{label}</span>
      <input
        {...rest}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-control border border-input bg-card px-3 py-2 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
    </label>
  );
}

/* --------------------------- server wake-up --------------------------- */

/** Seconds the countdown starts from — a cold Render instance measured ~44s. */
const WAKE_SECONDS = 60;

type WakeState = "checking" | "ready" | "cold" | "waking" | "timeout";

/**
 * The API runs on a free Render instance that sleeps after ~15 minutes idle and
 * takes roughly 45 seconds to wake. Signing in against a sleeping server just
 * hangs, so probe on mount and let the user start the wake-up explicitly.
 */
function useServerWake() {
  const [state, setState] = useState<WakeState>("checking");
  const [remaining, setRemaining] = useState(WAKE_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  // A quick probe: a warm server answers in well under a second, so anything
  // slower is treated as asleep rather than blocking the form.
  useEffect(() => {
    let cancelled = false;
    const settle = (next: WakeState) => {
      if (!cancelled) setState(next);
    };
    const slow = setTimeout(() => settle("cold"), 3000);
    apiHealth()
      .then(() => {
        clearTimeout(slow);
        settle("ready");
      })
      .catch(() => {
        clearTimeout(slow);
        settle("cold");
      });
    return () => {
      cancelled = true;
      clearTimeout(slow);
    };
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const wake = useCallback(() => {
    setState("waking");
    setRemaining(WAKE_SECONDS);
    stopTimer();
    timer.current = setInterval(() => {
      setRemaining((n) => {
        if (n <= 1) {
          stopTimer();
          // The request may still be in flight; offer a retry rather than
          // claiming failure.
          setState((cur) => (cur === "waking" ? "timeout" : cur));
          return 0;
        }
        return n - 1;
      });
    }, 1000);

    // Resolve as soon as the server answers, without waiting out the countdown.
    apiHealth()
      .then(() => {
        stopTimer();
        setState("ready");
      })
      .catch(() => {
        stopTimer();
        setState("timeout");
      });
  }, [stopTimer]);

  return { state, remaining, wake };
}

function ServerWakePanel({ server }: { server: ReturnType<typeof useServerWake> }) {
  const { state, remaining, wake } = server;
  if (state === "checking" || state === "ready") return null;

  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2.5">
      <div className="label-xs">Server asleep</div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {state === "waking"
          ? "Waking the API. This takes about a minute on the free tier."
          : state === "timeout"
            ? "Still waking. Give it another moment, then try again."
            : "The API sleeps after inactivity. Wake it before signing in."}
      </p>

      {state === "waking" ? (
        <div className="mt-2.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear"
              style={{ width: `${((WAKE_SECONDS - remaining) / WAKE_SECONDS) * 100}%` }}
            />
          </div>
          <div className="num mt-1.5 text-[11px] text-muted-foreground">{remaining}s</div>
        </div>
      ) : (
        <button
          type="button"
          onClick={wake}
          className="mt-2.5 w-full rounded-control border border-border-strong px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
        >
          {state === "timeout" ? "Try again" : "Wake server"}
        </button>
      )}
    </div>
  );
}
