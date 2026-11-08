'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { ApiError } from '../lib/api';
import { makeStore, type AppStore } from '../store/store';

export function Providers({ children }: { children: ReactNode }) {
  // One store and one query client per browser tab (created lazily, never shared across requests).
  const [store] = useState<AppStore>(() => makeStore());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60000,
            refetchOnWindowFocus: false,
            // Do not retry client errors (400/404): they will not fix themselves.
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
}
