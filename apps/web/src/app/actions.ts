'use server';

import { redirect } from 'next/navigation';
import { start } from 'workflow/api';
import { requestScan } from '../lib/request-scan.ts';
import { getStore } from '../lib/services.ts';
import { scanWorkflow } from '../workflows/scan.ts';

export interface ScanFormState {
  error: string | null;
}

export async function scanAction(_state: ScanFormState, form: FormData): Promise<ScanFormState> {
  const input = String(form.get('url') ?? '');
  let domain: string;
  try {
    const scan = await requestScan(
      input,
      {
        store: getStore(),
        start: async (created) => {
          await start(scanWorkflow, [created.id, created.url, created.createdAt]);
        },
      },
      { force: form.get('force') === '1' },
    );
    domain = scan.domain;
  } catch (error) {
    if (error instanceof TypeError) return { error: 'Enter a domain or URL, like example.com.' };
    throw error;
  }
  redirect(`/s/${encodeURIComponent(domain)}`);
}

// "Scan again" on a results page: the URL came from a stored scan, so it is always valid.
export async function rescanAction(form: FormData): Promise<void> {
  form.set('force', '1');
  await scanAction({ error: null }, form);
}
