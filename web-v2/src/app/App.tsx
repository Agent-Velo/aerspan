import { useMemo } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/AppProviders';
import { BootstrapGate } from '@/app/BootstrapGate';
import { createAppRouter } from '@/router/createAppRouter';

export function App() {
  const router = useMemo(() => createAppRouter(), []);
  return (
    <AppProviders>
      <BootstrapGate>
        <RouterProvider router={router} />
      </BootstrapGate>
    </AppProviders>
  );
}
