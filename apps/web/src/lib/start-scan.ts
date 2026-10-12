import {
  type AccessStore,
  assertAllowance,
  LimitError,
  requestScan,
  type ScanRecord,
  type Store,
  VISITOR_SCANS_PER_DAY,
  visitorSubject,
} from '@drippa/stackprobe-core';

// Starting a scan from the website's forms: the bot check, the visitor's daily allowance, then
// requestScan. Apart from the server action so it can be tested without Next.

// Whether the request comes from a person's browser. Vercel BotID on Vercel; everyone is a
// person when self-hosted (see services.ts).
export interface BotCheck {
  isBot(): Promise<boolean>;
}

export interface StartScanDeps {
  store: Store;
  access: AccessStore;
  botCheck: BotCheck;
  ip: string;
  ipHashSecret: string;
  start(scan: ScanRecord): Promise<void>;
  now?: () => Date;
}

export type StartScanResult = { domain: string } | { error: string };

export async function startScan(
  input: string,
  { force }: { force: boolean },
  deps: StartScanDeps,
): Promise<StartScanResult> {
  if (await deps.botCheck.isBot()) {
    return { error: "We couldn't confirm this is a browser. Reload the page and try again." };
  }
  const subject = await visitorSubject(deps.ip, deps.ipHashSecret);
  const clock = deps.now ? { now: deps.now } : {};
  const access = { store: deps.access, ...clock };
  try {
    const scan = await requestScan(
      input,
      {
        store: deps.store,
        start: deps.start,
        ...clock,
        allowance: {
          check: async () => {
            await assertAllowance(subject, VISITOR_SCANS_PER_DAY, access);
          },
          spend: () => deps.access.recordUsage({ subject, endpoint: 'scan form', newScan: true }),
        },
      },
      { force },
    );
    return { domain: scan.domain };
  } catch (error) {
    if (error instanceof TypeError) return { error: 'Enter a domain or URL, like example.com.' };
    if (error instanceof LimitError) return { error: limitMessage(error.resetAt, deps.now) };
    throw error;
  }
}

// "You've started 3 new scans today …, more in 5 hours." Reset is always midnight UTC.
export function limitMessage(resetAt: string, now: () => Date = () => new Date()): string {
  const hours = Math.max(1, Math.ceil((Date.parse(resetAt) - now().getTime()) / 3_600_000));
  return (
    `You've started ${VISITOR_SCANS_PER_DAY} new scans today, the daily limit without a key. ` +
    `Scans that already exist are still free to open. You can start more at midnight UTC, ` +
    `in ${hours === 1 ? 'about an hour' : `${hours} hours`}.`
  );
}
