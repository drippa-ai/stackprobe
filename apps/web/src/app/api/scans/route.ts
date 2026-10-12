import { CORS_PREFLIGHT, createScanResponse } from '../../../lib/scans-api.ts';
import { getAccess, getStore } from '../../../lib/services.ts';
import { startScanWorkflow } from '../../../lib/start-workflow.ts';

// Starts a scan for an agent or script. See lib/scans-api.ts.
export async function POST(request: Request) {
  const { status, body, headers } = await createScanResponse(
    request.headers.get('authorization'),
    await request.text(),
    {
      store: getStore(),
      access: getAccess(),
      start: startScanWorkflow,
      origin: new URL(request.url).origin,
    },
  );
  return Response.json(body, { status, headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_PREFLIGHT });
}
