import { Link, useRouterState } from "@tanstack/react-router";

/**
 * Breadcrumb trail derived from the live route, not a hand-maintained tree.
 *
 * Segment labels come from the same route table the sidebar renders, so the two
 * can never disagree. A detail route's final crumb shows whatever label the page
 * passes in (a patient code, a short analysis id) rather than a raw uuid.
 * Ancestors navigate; the current page does not.
 */

/** Label and link target for each first-level route. */
const SECTION: Record<string, { label: string; to: string }> = {
  dashboard: { label: "Dashboard", to: "/dashboard" },
  patients: { label: "Patients", to: "/patients" },
  upload: { label: "New Analysis", to: "/upload" },
  predictions: { label: "Predictions", to: "/predictions" },
  analysis: { label: "EEG Analysis", to: "/analysis" },
  model: { label: "Architecture", to: "/model" },
  performance: { label: "Performance", to: "/performance" },
  about: { label: "About", to: "/about" },
  settings: { label: "Settings", to: "/settings" },
};

export function Breadcrumbs({ leafLabel }: { leafLabel?: string | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segments = pathname.split("/").filter(Boolean);

  const crumbs: Array<{ label: string; to?: string | undefined }> = [
    { label: "Dashboard", to: "/dashboard" },
  ];

  const [head, ...rest] = segments;
  if (head && head !== "dashboard") {
    const section = SECTION[head];
    if (section) {
      // The section only links when something sits below it.
      crumbs.push({ label: section.label, to: rest.length ? section.to : undefined });
    }
    if (rest.length) {
      crumbs.push({ label: leafLabel ?? rest[rest.length - 1]!.slice(0, 8) });
    }
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-[12px]">
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center">
            {i > 0 && (
              <span aria-hidden className="mx-1.5 text-muted-foreground/40 select-none">
                /
              </span>
            )}
            {crumb.to && !last ? (
              <Link
                to={crumb.to}
                className="truncate rounded-control px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={last ? "page" : undefined}
                className={
                  last
                    ? "truncate px-1 py-0.5 font-medium text-foreground"
                    : "truncate px-1 py-0.5 text-muted-foreground"
                }
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
