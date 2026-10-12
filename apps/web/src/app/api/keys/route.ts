import { clientIp, createKeyResponse } from '../../../lib/keys-api.ts';
import { getAccess, getIpHashSecret } from '../../../lib/services.ts';

// Agents get their own key here, with no sign-up. See lib/keys-api.ts.
export async function POST(request: Request) {
  const { status, body, headers } = await createKeyResponse(
    clientIp(request.headers),
    getIpHashSecret(),
    { store: getAccess() },
  );
  return Response.json(body, { status, headers });
}
