import { z } from 'zod';

export const LayerId = z.enum(['http', 'dns', 'tls', 'browser']);
export type LayerId = z.infer<typeof LayerId>;

// 'unclassified' until surface discovery exists: the scanned URL is not claimed to be the product app.
export const SurfaceKind = z.enum([
  'unclassified',
  'marketing',
  'app',
  'api',
  'docs',
  'status',
  'auth',
  'other',
]);
export type SurfaceKind = z.infer<typeof SurfaceKind>;

const Confidence = z.number().min(0).max(1);

export const Evidence = z.object({
  type: z.enum(['observed', 'stated']),
  layer: LayerId,
  ruleId: z.string(),
  detail: z.string(),
  weight: Confidence,
});
export type Evidence = z.infer<typeof Evidence>;

export const Detection = z.object({
  tech: z.string(),
  category: z.string(),
  version: z.string().nullable(),
  confidence: Confidence,
  evidence: z.array(Evidence).min(1),
});
export type Detection = z.infer<typeof Detection>;

// How a scan found a surface besides the one it was asked to scan: a link on that page (with
// the link's text), or a common subdomain that exists.
export const SurfaceFoundBy = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), text: z.string().optional() }),
  z.object({ kind: z.literal('subdomain') }),
]);
export type SurfaceFoundBy = z.infer<typeof SurfaceFoundBy>;

export const Surface = z.object({
  id: z.string(),
  url: z.url(),
  kind: SurfaceKind,
  kindConfidence: Confidence.nullable(),
  // Absent for the surface the scan was asked for.
  foundBy: SurfaceFoundBy.optional(),
  detections: z.array(Detection),
});
export type Surface = z.infer<typeof Surface>;

export const LayerErrorCode = z.enum([
  'TIMEOUT',
  'DNS_NXDOMAIN',
  'TLS_HANDSHAKE',
  'HTTP_STATUS',
  'CONNECT_FAILED',
  'BLOCKED_PRIVATE_ADDRESS',
  'BROWSER_UNAVAILABLE',
  'INTERNAL',
]);
export type LayerErrorCode = z.infer<typeof LayerErrorCode>;

export const LayerRun = z.object({
  layer: LayerId,
  surfaceId: z.string(),
  status: z.enum(['ok', 'failed', 'timeout', 'skipped']),
  durationMs: z.number().nonnegative(),
  error: z.object({ code: LayerErrorCode, message: z.string() }).optional(),
});
export type LayerRun = z.infer<typeof LayerRun>;

export const Report = z.object({
  schemaVersion: z.literal('1'),
  domain: z.string(),
  scannedAt: z.iso.datetime(),
  fingerprintsVersion: z.string(),
  surfaces: z.array(Surface),
  layersRun: z.array(LayerRun),
});
export type Report = z.infer<typeof Report>;

export function reportJsonSchema(): unknown {
  return z.toJSONSchema(Report, { target: 'draft-2020-12' });
}
