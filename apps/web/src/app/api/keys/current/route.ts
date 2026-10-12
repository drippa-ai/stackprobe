import { revokeKeyResponse } from '../../../../lib/keys-api.ts';
import { getAccess } from '../../../../lib/services.ts';

// Revokes the key the request is made with. See lib/keys-api.ts.
export async function DELETE(request: Request) {
  const { status, body, headers } = await revokeKeyResponse(request.headers.get('authorization'), {
    store: getAccess(),
  });
  return Response.json(body, { status, headers });
}
