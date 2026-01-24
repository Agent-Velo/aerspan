import { useContext, useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/heroui";
import { getLogoUrl, getSystemName } from "@/lib/branding";
import { useStatus } from "@/stores/status/StatusStore";
import { ThemeContext } from "@/theme/ThemeProvider";

function getHeaderCta(pathname: string, selfUseMode: boolean) {
  if (pathname.startsWith("/auth/signin")) {
    if (selfUseMode) return null;
    return { to: "/auth/signup", label: "Create account" };
  }
  if (pathname.startsWith("/auth/signup")) {
    return { to: "/auth/signin", label: "Sign in" };
  }
  return { to: "/auth/signin", label: "Sign in" };
}

export function AuthLayout() {
  const { status } = useStatus();
  const location = useLocation();
  const { mode, setMode, resolvedTheme } = useContext(ThemeContext);

  const systemName =
    (status?.system_name as string | undefined) || getSystemName();
  const logoUrl = (status?.logo as string | undefined) || getLogoUrl();
  const selfUseMode = Boolean(status?.self_use_mode_enabled);

  const cta = useMemo(() => {
    return getHeaderCta(location.pathname, selfUseMode);
  }, [location.pathname, selfUseMode]);

  return (
    <div className="auth-shell">
      <div className="auth-shell__content">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6">
          <header className="flex items-center justify-between gap-3">
            <NavLink to="/" className="flex items-center gap-2">
              <img
                src={logoUrl}
                alt={`${systemName} logo`}
                className="h-7 w-7 rounded"
              />
              <span className="text-sm font-semibold">{systemName}</span>
            </NavLink>

            <div className="flex items-center gap-2">
              {cta ? (
                <NavLink
                  to={cta.to}
                  className="text-sm text-muted underline-offset-4 hover:underline"
                >
                  {cta.label}
                </NavLink>
              ) : null}

              <Button
                isIconOnly
                aria-label="Toggle theme"
                variant="tertiary"
                onPress={() => {
                  const next =
                    mode === "auto"
                      ? "light"
                      : mode === "light"
                        ? "dark"
                        : "auto";
                  setMode(next);
                }}
              >
                {resolvedTheme === "dark" ? (
                  <Moon size={16} />
                ) : (
                  <Sun size={16} />
                )}
              </Button>
            </div>
          </header>

          <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-2">
            <aside className="hidden lg:block">
              <div className="max-w-lg space-y-6">
                <div className="space-y-2 pb-24">
                  <h1 className="text-5xl font-bold tracking-tight">
                    {systemName}
                  </h1>
                  <p className="text-xl pt-4">The next way to build AI apps.</p>
                  <p className="text-l pt-2 text-muted">
                    The most cost-effective AI infrastructure for any workload.
                  </p>
                </div>
              </div>
            </aside>

            <main className="flex w-full justify-center lg:justify-start">
              <Outlet />
            </main>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs text-muted">
            <div>
              © {new Date().getFullYear()} {systemName}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {status?.user_agreement_enabled ? (
                <NavLink
                  to="/terms"
                  className="underline-offset-4 hover:underline"
                >
                  Terms
                </NavLink>
              ) : null}
              {status?.privacy_policy_enabled ? (
                <NavLink
                  to="/privacy-policy"
                  className="underline-offset-4 hover:underline"
                >
                  Privacy
                </NavLink>
              ) : null}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
