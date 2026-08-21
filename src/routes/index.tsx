import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/` redirects to `/dashboard`.
 *
 * Both routes used to mount `DashboardView` directly with different <title>
 * tags, which meant one page reachable at two URLs — duplicate content, and no
 * canonical for anything linking to it. One page, one address.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
