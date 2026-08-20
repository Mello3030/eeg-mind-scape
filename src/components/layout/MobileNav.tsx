import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, type ComponentType } from "react";

export type NavItem = {
  readonly to: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
};

export type NavGroup = { readonly heading: string; readonly items: readonly NavItem[] };

/**
 * Mobile navigation drawer.
 *
 * Replaces the horizontal chip strip, which pushed later routes off-screen. The
 * drawer carries the same groups and the same route list as the desktop rail —
 * nothing is dropped at small sizes.
 */
export function MobileNav({
  open,
  onOpen,
  onClose,
  groups,
  isActive,
  user,
  logout,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  groups: readonly NavGroup[];
  isActive: (to: string) => boolean;
  user: { name: string; role: string } | null;
  logout: () => void;
}) {
  // Close on Escape, and stop the page scrolling behind the open drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const current = groups.flatMap((g) => g.items).find((i) => isActive(i.to))?.label ?? "QSFE-Net";

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border bg-card px-3 py-2.5 lg:hidden">
        <button
          onClick={onOpen}
          aria-label="Open navigation"
          aria-expanded={open}
          className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Menu className="size-4" />
        </button>
        <span className="truncate text-[13px] font-medium">{current}</span>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-sidebar text-sidebar-foreground shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
              <span className="text-[15px] font-bold tracking-tight text-sidebar-accent-foreground">
                QSFE&#8209;Net
              </span>
              <button
                onClick={onClose}
                aria-label="Close navigation"
                className="flex size-8 items-center justify-center rounded-control text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {groups.map((group) => (
                <div key={group.heading} className="mb-6 last:mb-0">
                  <div className="mb-2 px-2.5 text-[10px] font-semibold tracking-[0.16em] text-sidebar-foreground/45 uppercase">
                    {group.heading}
                  </div>
                  <div className="space-y-1">
                    {group.items.map(({ to, label, icon: Icon }) => {
                      const active = isActive(to);
                      return (
                        <Link
                          key={to}
                          to={to}
                          onClick={onClose}
                          className={`flex items-center gap-3 rounded-control border px-3 text-[13px] font-medium transition-colors ${
                            active
                              ? "border-white/10 bg-white/12 text-sidebar-accent-foreground"
                              : "border-transparent text-sidebar-foreground/70 hover:bg-white/6 hover:text-sidebar-accent-foreground"
                          }`}
                          style={{ height: 40 }}
                        >
                          <Icon
                            className={`size-4 shrink-0 ${
                              active ? "text-sidebar-primary" : "text-sidebar-foreground/50"
                            }`}
                          />
                          <span className="truncate">{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="border-t border-sidebar-border p-3">
              {user ? (
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-[11px] font-semibold text-sidebar-accent-foreground">
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-sidebar-accent-foreground">
                      {user.name}
                    </div>
                    <div className="truncate text-[10px] tracking-wider text-sidebar-foreground/55 uppercase">
                      {user.role}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      onClose();
                    }}
                    className="rounded-control px-2 py-1 text-[11px] text-sidebar-foreground/60 transition-colors hover:bg-white/8 hover:text-sidebar-accent-foreground"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={onClose}
                  className="block rounded-control bg-sidebar-primary py-2 text-center text-xs font-medium text-sidebar-primary-foreground"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
