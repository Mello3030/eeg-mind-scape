import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Disclaimer, Panel } from "@/components/ui-kit";
import { useAuth } from "@/context/AuthContext";
import { MODEL, pct } from "@/lib/qsfe";
import {
  API_URL,
  apiHealth,
  listCheckpoints,
  modelInfo,
  modelPerformance,
  reloadCheckpoint,
} from "@/services/api";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — QSFE-Net Workspace Configuration" },
      {
        name: "description",
        content:
          "Workspace configuration for the QSFE-Net platform: account, active checkpoint, resolved server paths and environment variables.",
      },
      { property: "og:title", content: "Settings — QSFE-Net Workspace Configuration" },
      { property: "og:description", content: "Account, model checkpoint and environment." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: apiHealth,
    staleTime: 30_000,
  });
  const { data: model } = useQuery({ queryKey: ["modelInfo"], queryFn: modelInfo, retry: false });
  const { data: perf } = useQuery({
    queryKey: ["modelPerformance", "test"],
    queryFn: () => modelPerformance("test"),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const { data: checkpoints = [] } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: listCheckpoints,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const swap = useMutation({
    mutationFn: reloadCheckpoint,
    // Every measured figure on the site belongs to the previous checkpoint.
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const ENV: Array<[string, string, string]> = [
    ["VITE_API_URL", API_URL, "API base URL the frontend talks to"],
    [
      "QSFE_CHECKPOINT_SUBPATH",
      health?.paths["checkpoint"] ?? "—",
      "Checkpoint served for inference",
    ],
    [
      "QSFE_DATASET_SUBDIR",
      health?.paths["dataset_dir"] ?? "—",
      "CAUEEG annotations and EDF files",
    ],
    [
      "QSFE_FEATURE_SUBDIR",
      health?.paths["feature_dir"] ?? "—",
      "Cached .npz crops used for fast scoring and evaluation",
    ],
    ["QSFE_JWT_SECRET", "••••••••", "Signing secret for access tokens"],
    ["QSFE_DATABASE_URL", "(server-side)", "SQLite by default; set to a Postgres URL for Neon"],
  ];

  return (
    <AppShell title="Settings" subtitle="Workspace, model and environment configuration">
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Account">
          {user ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  <Row k="Name" v={user.name} />
                  <Row k="Email" v={user.email} />
                  <Row k="Role" v={user.role} />
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Not signed in. Sign in to associate uploads with a researcher account.
            </p>
          )}
          {user && (
            <button
              onClick={logout}
              className="mt-3 rounded-xs border border-border px-2.5 py-1 text-[11px]"
            >
              Sign out
            </button>
          )}
        </Panel>

        <Panel
          title="Active model"
          right={
            <span className="num text-[11px] text-muted-foreground">
              {health?.status === "ok" ? "healthy" : (health?.status ?? "unreachable")}
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                <Row k="Name" v={MODEL.name} />
                <Row k="Checkpoint" v={model?.checkpoint ?? "—"} />
                <Row k="Device" v={model?.device ?? "—"} />
                <Row k="Parameters" v={model ? model.nParameters.toLocaleString() : "—"} />
                <Row k="Test accuracy" v={perf ? pct(perf.accuracy) : "—"} />
                <Row k="Macro F1" v={perf ? perf.macroF1.toFixed(4) : "—"} />
                <Row
                  k="Extractor compatible"
                  v={model ? (model.extractorCompatible ? "yes" : "no") : "—"}
                />
                <Row
                  k="Crops per recording"
                  v={
                    model
                      ? `${model.defaultNCrops} × ${model.cropLength / model.sampleRate} s`
                      : "—"
                  }
                />
              </tbody>
            </table>
          </div>
          {model && !model.extractorCompatible && (
            <div className="mt-3">
              <Disclaimer>
                This checkpoint expects feature dimensions the current extractor no longer produces,
                so EDF uploads will be rejected. Switch to a compatible checkpoint below.
              </Disclaimer>
            </div>
          )}
        </Panel>

        <Panel
          title="Checkpoints"
          hint="Every .pth under outputs/ — switching reloads the server and re-measures performance"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-xs border-b-[1.5px] border-border-strong">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">File</th>
                  <th className="py-1.5 pr-2 font-medium">Stream dims</th>
                  <th className="py-1.5 pr-2 font-medium">Usable</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {checkpoints.map((c) => (
                  <tr key={c.name} className="border-b border-border/70 last:border-0">
                    <td className="num py-1.5 pr-2">
                      {c.name}
                      {c.active && <span className="ml-1.5 text-[10px] text-primary">active</span>}
                    </td>
                    <td className="num py-1.5 pr-2 text-muted-foreground">
                      {c.stream_dims
                        ? Object.values(c.stream_dims).join(" / ")
                        : (c.error ?? "unreadable")}
                    </td>
                    <td className="num py-1.5 pr-2">
                      {c.error ? "—" : c.extractor_compatible ? "yes" : "dims differ"}
                    </td>
                    <td className="py-1.5 text-right">
                      {!c.active && !c.error && (
                        <button
                          onClick={() => swap.mutate(c.name)}
                          disabled={swap.isPending}
                          className="rounded-xs border border-border px-2 py-0.5 text-[10px] disabled:opacity-60"
                        >
                          {swap.isPending ? "…" : "Use"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {swap.isError && (
            <p className="mt-2 text-[11px] text-destructive">
              {swap.error instanceof Error ? swap.error.message : "Could not switch checkpoint."}
            </p>
          )}
        </Panel>

        {/* Storage is the one piece of server state that fails silently: writes
            succeed, the API looks healthy, and the data is gone after a restart.
            Surfaced here so that is visible without reading deploy logs. */}
        <Panel
          title="Storage"
          hint="Where accounts, patients and analyses are actually written"
          emphasis={health?.database ? !health.database.persistent : false}
        >
          {!health?.database ? (
            <p className="text-xs text-muted-foreground">
              This API build does not report database status. Update the backend to see it here.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`num rounded-xs border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${
                    health.database.connected
                      ? "border-normal/40 bg-normal/10 text-foreground"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  {health.database.connected ? "connected" : "not connected"}
                </span>
                <span
                  className={`num rounded-xs border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${
                    health.database.persistent
                      ? "border-normal/40 bg-normal/10 text-foreground"
                      : "border-dementia/40 bg-dementia/10 text-foreground"
                  }`}
                >
                  {health.database.persistent ? "persistent" : "ephemeral"}
                </span>
                <span className="num text-[11px] text-muted-foreground">
                  {health.database.backend}
                </span>
              </div>

              <table className="mt-3 w-full text-left text-xs">
                <tbody>
                  <tr className="border-b border-border/70">
                    <td className="label-xs py-1.5 pr-3">URL</td>
                    <td
                      className="num max-w-[22rem] truncate py-1.5 text-muted-foreground"
                      title={health.database.url}
                    >
                      {health.database.url}
                    </td>
                  </tr>
                  {Object.entries(health.database.counts).map(([table, count]) => (
                    <tr key={table} className="border-b border-border/70 last:border-0">
                      <td className="label-xs py-1.5 pr-3">{table}</td>
                      <td className="num py-1.5">{count ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {health.database.error && (
                <p className="num mt-3 text-[11px] text-destructive">{health.database.error}</p>
              )}
              {health.database.warning && <Disclaimer>{health.database.warning}</Disclaimer>}
            </>
          )}
        </Panel>

        <Panel title="Environment" hint="Resolved server-side configuration">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-xs border-b-[1.5px] border-border-strong">
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
                    <td
                      className="num max-w-[16rem] truncate py-1.5 pr-2 text-muted-foreground"
                      title={v}
                    >
                      {v}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Disclaimer>
              Every prediction in this workspace is produced by the checkpoint named above running
              on real EEG. There is no demo or mock mode: if no checkpoint loads, scoring fails
              rather than returning a placeholder.
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
