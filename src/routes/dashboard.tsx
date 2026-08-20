import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "@/components/views/DashboardView";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QSFE-Net EEG Analysis" },
      {
        name: "description",
        content:
          "Dense research dashboard of QSFE-Net EEG screening results: prediction distribution, gate weights and Run 8 performance metrics.",
      },
      { property: "og:title", content: "Dashboard — QSFE-Net EEG Analysis" },
      {
        property: "og:description",
        content: "Prediction distribution, stream gate weights and model performance for QSFE-Net.",
      },
    ],
  }),
  component: DashboardView,
});
