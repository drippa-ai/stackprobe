import { reportJson } from '../../../../lib/report-json.ts';
import { getStore } from '../../../../lib/services.ts';

// /s/<domain>.json lands here (see next.config.ts): the report page's JSON twin.
export async function GET(request: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const scan = await getStore().latestScan(domain);
  const { status, body, headers } = reportJson(domain, scan, new URL(request.url).origin);
  return Response.json(body, { status, headers });
}
