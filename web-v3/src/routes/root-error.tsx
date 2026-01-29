import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom"

import { Button } from "@/components/ui/button"

export function RootErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {error.status} {error.statusText}
          </h1>
          {typeof error.data === "string" ? (
            <p className="text-sm text-muted-foreground">{error.data}</p>
          ) : null}
        </div>

        <Button asChild>
          <Link to="/">Back to Home</Link>
        </Button>
      </div>
    )
  }

  const message = error instanceof Error ? error.message : "Unknown error"
  const stack = error instanceof Error ? error.stack : null

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Unexpected Error</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>

      {stack ? (
        <pre className="bg-muted/50 overflow-auto rounded-lg p-3 text-xs">
          {stack}
        </pre>
      ) : null}

      <Button asChild>
        <Link to="/">Back to Home</Link>
      </Button>
    </div>
  )
}

