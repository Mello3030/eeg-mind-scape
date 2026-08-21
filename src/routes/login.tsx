import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

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
          disabled={busy}
          className="w-full rounded-control bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          No account?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Register
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
