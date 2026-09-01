import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useThemeStore } from '@/stores/theme-store';
import { createQueryClient } from './query-client';

export function Providers({ children }: { children: ReactNode }) {
  // Created once per app instance, not per render.
  const [client] = useState(createQueryClient);
  const syncWithSystem = useThemeStore((s) => s.syncWithSystem);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', syncWithSystem);
    return () => media.removeEventListener('change', syncWithSystem);
  }, [syncWithSystem]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
