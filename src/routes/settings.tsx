import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, Panel } from "@/components/ui-kit";
import { useAuth } from "@/context/AuthContext";
import { MODEL } from "@/lib/qsfe";
import { MOCK_INFERENCE, resetDb } from "@/services/mockApi";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — QSFE-Net Workspace Configuration" },
      {
        name: "description",
        content: "Workspace configuration for the QSFE-Net platform: account, model checkpoint, environment variables and demo data.",
      },
      { property: "og:title", content: "Settings — QSFE-Net Workspace Configuration" },
      { property: "og:description", content: "Account, environment and demo-data controls." },
    ],
  }),
  component: SettingsPage,
});

const ENV = [
  ["DATABASE_URL", "postgresql://user:pass@localhost:5432/qsfe", "PostgreSQL connection string used by Prisma"],
  ["JWT_SECRET", "••••••••", "Signing secret for access tokens"],
  ["ML_SERVICE_URL", "http://localhost:8000", "FastAPI inference service base URL"],
  ["VITE_API_URL", "http://localhost:4000/api", "Express API base URL consumed by the frontend"],
  ["MOCK_INFERENCE", String(MOCK_INFERENCE), "When true, predictions are labelled demo values"],
];

function SettingsPage() {
  const { user, logout } = useAuth();
  const [done, setDone] = useState(false);

  return (
    <AppShell title="Settings" subtitle="Workspace, model and environment configuration">
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Account">
          {user ? (
            <table className="w-full text-xs">
              <tbody>
                <Row k="Name" v={user.name} />
                <Row k="Email" v={user.email} />
                <Row k="Role" v={user.role} />
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground">
              Not signed in. The dashboard is publicly viewable in this demo build; sign in to associate uploads
              with a researcher account.
            </p>
          )}
          {user && (
            <button onClick={logout} className="mt-3 rounded border border-border px-2.5 py-1 text-[11px]">
              Sign out
            </button>
          )}
        </Panel>

        <Panel title="Active model">
          <table className="w-full text-xs">
            <tbody>
              <Row k="Name" v={MODEL.name} />
              <Row k="Version" v={MODEL.version} />
              <Row k="Parameters" v={MODEL.parameterCount.toLocaleString()} />
              <Row k="Test accuracy" v={`${(MODEL.testAccuracy * 100).toFixed(2)}%`} />
              <Row k="Validation accuracy" v={`${(MODEL.validationAccuracy * 100).toFixed(2)}%`} />
              <Row k="Macro F1" v={MODEL.macroF1.toFixed(4)} />
              <Row k="Checkpoint path" v={MODEL.checkpointPath} />
              <Row k="Inference mode" v={MOCK_INFERENCE ? "MOCK_INFERENCE (demo data)" : "PyTorch checkpoint"} />
            </tbody>
          </table>
        </Panel>

        <Panel title="Environment variables" hint="Read by the Express API and FastAPI service">
          <table className="w-full text-left text-xs">
            <thead className="label-xs border-b border-border">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Key</th>
                <th className="py-1.5 pr-2 font-medium">Value</th>
                <th className="py-1.5 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {ENV.map(([k, v, d]) => (
                <tr key={k} className="border-b border-border/70 last:border-0">
                  <td className="num py-1.5 pr-2">{k}</td>
                  <td className="num py-1.5 pr-2 text-muted-foreground">{v}</td>
                  <td className="py-1.5 text-muted-foreground">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Demo data">
          <p className="text-xs text-muted-foreground">
            This frontend build stores patients, recordings and analyses in the browser so the full workflow is
            usable without a backend. Reseeding restores the documented cohort and Run 8 values.
          </p>
          <button
            onClick={() => {
              resetDb();
              setDone(true);
            }}
            className="mt-3 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Reseed workspace
          </button>
          {done && <p className="mt-2 text-[11px] text-normal">Workspace reseeded.</p>}
          <div className="mt-3">
            <Disclaimer>
              MOCK_INFERENCE mode is active. Predictions are demo values, clearly labelled everywhere they appear,
              and are never presented as real trained-model output.
            </Disclaimer>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b border-border/70 last:border-0">
      <td className="py-1.5 pr-2 text-muted-foreground">{k}</td>
      <td className="num py-1.5 text-right">{v}</td>
    </tr>
  );
}