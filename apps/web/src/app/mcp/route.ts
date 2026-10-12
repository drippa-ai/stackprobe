import { handleMcp } from '../../lib/mcp.ts';
import { getAccess, getStore } from '../../lib/services.ts';
import { startScanWorkflow } from '../../lib/start-workflow.ts';

// The remote MCP endpoint (Streamable HTTP). See lib/mcp.ts.
// scan_domain waits up to 25 s for a scan, so allow the function a minute.
export const maxDuration = 60;

function handle(request: Request): Promise<Response> {
  return handleMcp(request, { store: getStore(), access: getAccess(), start: startScanWorkflow });
}

export { handle as DELETE, handle as GET, handle as POST };
