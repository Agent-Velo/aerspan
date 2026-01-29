import { NavLink, Outlet, useNavigation } from "react-router-dom"

import { Button } from "@/components/ui/button"

export function RootLayout() {
  const navigation = useNavigation()
  const isNavigating = navigation.state !== "idle"

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">web-v3</span>
            {isNavigating ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : null}
          </div>

          <nav className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="aria-[current=page]:bg-muted"
            >
              <NavLink to="/" end>
                Home
              </NavLink>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="aria-[current=page]:bg-muted"
            >
              <NavLink to="/data-demo">Data Demo</NavLink>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

