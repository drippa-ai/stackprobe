'use client';

import { usePathname } from 'next/navigation';

// The address that was asked for, which the not-found page isn't given on the server.
export function RequestedPath() {
  const path = usePathname();
  return <span className="mono requested-path">{path || 'this address'}</span>;
}
