import { useEffect } from "react";

export function ExternalRedirectPage({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted">
      Redirecting…
    </div>
  );
}

