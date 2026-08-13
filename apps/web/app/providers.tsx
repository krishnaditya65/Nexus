'use client';

// One QueryClient per browser tab (created once via useState, not module
// scope) — module-scope would leak cached data across users/tenants on
// the server in an RSC context, even though every fetch we make today is
// client-side. Cheap insurance against a real cross-tenant data leak if a
// server component ever calls a query hook without going through this
// same instance.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 5_000,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
