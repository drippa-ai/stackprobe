export type { DetectOptions } from './detect.ts';
export { DEFAULT_MIN_CONFIDENCE, detect, MAX_CONFIDENCE } from './detect.ts';
export type { CompiledFingerprint, Matcher, Rule } from './fingerprint.ts';
export { compileFingerprints, Fingerprint, FingerprintError } from './fingerprint.ts';
export { builtinFingerprints, FINGERPRINTS_VERSION } from './fingerprints/index.ts';
export type { Layer, LayerContext, Signal, SignalKind, SurfaceTarget } from './layer.ts';
export { LayerError, SIGNAL_KINDS } from './layer.ts';
export {
  DEFAULT_LAYERS,
  distillHtml,
  dnsLayer,
  httpLayer,
  lookupAsn,
  tlsLayer,
} from './layers/index.ts';
export type { DnsAnswer, DnsRecordType, HttpRequest, HttpResponse, Net, TlsInfo } from './net.ts';
export {
  Detection,
  Evidence,
  LayerErrorCode,
  LayerId,
  LayerRun,
  Report,
  reportJsonSchema,
  Surface,
  SurfaceKind,
} from './report.ts';
export type { LayerResult, RunOptions } from './runner.ts';
export { runLayer, runLayers } from './runner.ts';
export type { BuildReportInput, ScanOptions, SurfaceResults } from './scan.ts';
export { buildReport, reportStatus, SCAN_BUDGET_MS, scan } from './scan.ts';
export type { ScanRecord, ScanStatus, Store } from './store.ts';
export { MemoryStore, ScanFinishedError, ScanNotFoundError } from './store.ts';
export { surfaceTarget } from './surface.ts';
export { STACKPROBE_VERSION } from './version.ts';
