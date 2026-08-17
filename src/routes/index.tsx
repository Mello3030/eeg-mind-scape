import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "@/components/views/DashboardView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QSFE-Net — EEG Dementia Screening Dashboard" },
      {
        name: "description",
        content:
          "Research dashboard for QSFE-Net: gated four-stream EEG analysis for early dementia and MCI screening on the CAUEEG dataset.",
      },
      { property: "og:title", content: "QSFE-Net — EEG Dementia Screening Dashboard" },
      {
        property: "og:description",
        content:
          "Lightweight interpretable EEG deep-learning platform: 830 features, four gated streams, 79,431 parameters.",
      },
    ],
  }),
  component: DashboardView,
});
