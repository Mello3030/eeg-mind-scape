import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — QSFE-Net Research Platform" },
      { name: "description", content: "Sign in to the QSFE-Net EEG dementia screening research platform." },
      { property: "og:title", content: "Sign in — QSFE-Net Research Platform" },
      { property: "og:description", content: "Researcher and administrator access to QSFE-Net." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("researcher@qsfe.lab");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
            navigate({ to: "/dashboard" });
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
          className="w-full rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          No account?{" "}
          <a href="/register" className="text-primary hover:underline">
            Register
          </a>{" "}
          · The dashboard is publicly viewable in this demo build.
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
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded bg-primary/10 text-primary">
            <FlaskConical className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">QSFE-Net</div>
            <div className="num text-[10px] text-muted-foreground">EEG Dementia Screening Platform</div>
          </div>
        </div>
        <div className="panel p-5">
          <h1 className="text-base font-semibold">{title}</h1>
          <p className="mb-4 mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
          {children}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Research prototype — not for clinical diagnosis. Demo credentials are validated client-side only.
        </p>
      </div>
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
        className="mt-1 w-full rounded border border-input bg-card px-2.5 py-1.5 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
      />
    </label>
  );
}