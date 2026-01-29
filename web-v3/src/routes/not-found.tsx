import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"

export function NotFoundRoute() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">404</h1>
        <p className="text-sm text-muted-foreground">页面不存在。</p>
      </div>

      <Button asChild>
        <Link to="/">Back to Home</Link>
      </Button>
    </div>
  )
}

