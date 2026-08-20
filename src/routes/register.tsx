import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout, Field } from "@/routes/login";
import { useAuth, type Role } from "@/context/AuthContext";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — QSFE-Net Research Platform" },
      {
        name: "description",
        content: "Create a researcher or administrator account on the QSFE-Net platform.",
      },
      { property: "og:title", content: "Register — QSFE-Net Research Platform" },
      { property: "og:description", content: "Create a QSFE-Net research workspace account." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("researcher");
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthLayout
      title="Create account"
      subtitle="Roles: researcher (analysis) or administrator (full access)"
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await register({ name, email, password, role });
            navigate({ to: "/dashboard" });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Registration failed.");
          }
        }}
      >
        <Field label="Full name" value={name} onChange={setName} />
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Password" value={password} onChange={setPassword} type="password" />
        <p className="-mt-1 text-[11px] text-muted-foreground">At least 8 characters.</p>
        <label className="block">
          <span className="label-xs">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mt-1.5 w-full rounded-control border border-input bg-card px-3 py-2 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            <option value="researcher">researcher</option>
            <option value="administrator">administrator</option>
          </select>
        </label>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-control bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
        >
          Create account
        </button>
        <p className="text-[11px] text-muted-foreground">
          Already registered?{" "}
          <a href="/login" className="text-primary hover:underline">
            Sign in
          </a>
        </p>
      </form>
    </AuthLayout>
  );
}
