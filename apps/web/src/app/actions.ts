'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clientIp } from '../lib/keys-api.ts';
import { getAccess, getBotCheck, getIpHashSecret, getStore } from '../lib/services.ts';
import { startScan } from '../lib/start-scan.ts';
import { startScanWorkflow } from '../lib/start-workflow.ts';

export interface ScanFormState {
  error: string | null;
}

// Every scan form on the site: the home page, a report's "Scan again", not-found pages.
export async function scanAction(_state: ScanFormState, form: FormData): Promise<ScanFormState> {
  const result = await startScan(
    String(form.get('url') ?? ''),
    { force: form.get('force') === '1' },
    {
      store: getStore(),
      access: getAccess(),
      botCheck: getBotCheck(),
      ip: clientIp(await headers()),
      ipHashSecret: getIpHashSecret(),
      start: startScanWorkflow,
    },
  );
  if ('error' in result) return { error: result.error };
  redirect(`/s/${encodeURIComponent(result.domain)}`);
}
