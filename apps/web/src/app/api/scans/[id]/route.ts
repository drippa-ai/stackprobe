import { getScanResponse } from '../../../../lib/scans-api.ts';
import { getAccess, getStore } from '../../../../lib/services.ts';
import { startScanWorkflow } from '../../../../lib/start-workflow.ts';

// A scan's status, and its report once finished. See lib/scans-api.ts.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { status, body, headers } = await getScanResponse((await params).id, {
    store: getStore(),
    access: getAccess(),
    start: startScanWorkflow,
    origin: new URL(request.url).origin,
  });
  return Response.json(body, { status, headers });
}
