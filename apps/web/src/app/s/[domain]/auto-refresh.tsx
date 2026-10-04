'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Reloads the page's data every few seconds while a scan is still running.
export function AutoRefresh({ everyMs = 2000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
