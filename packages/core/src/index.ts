export type { Browser, BrowserCapture, CaptureOptions } from './browser.ts';
export { browserLayer, captureSignals, ownCapture, sanitizeCapture } from './browser.ts';
export type {
  Classification,
  ClassifiedKind,
  ClassifyOptions,
  Decider,
} from './classify.ts';
export {
  classifyByRules,
  classifySurfaces,
  DECIDER_MINIMUM,
  KIND_DESCRIPTIONS,
  kindQuestion,
  RULES_MINIMUM,
  RULES_SETTLE,
  ruleVotes,
  surfaceState,
  surfacesByRole,
} from './classify.ts';
export type { DetectOptions } from './detect.ts';
export { DEFAULT_MIN_CONFIDENCE, detect, MAX_CONFIDENCE } from './detect.ts';
export type { DetectionChange, DetectionState, ReportDiff, SurfaceDiff } from './diff.ts';
export { diffReports, MIN_CONFIDENCE_CHANGE } from './diff.ts';
export type { DiscoverOptions } from './discover.ts';
export {
  discoverSurfaces,
  MAX_DISCOVERED,
  registrableDomain,
  SUBDOMAIN_PREFIXES,
  surfaceId,
} from './discover.ts';
export type { CompiledFingerprint, Matcher, Rule } from './fingerprint.ts';
export { compileFingerprints, Fingerprint, FingerprintError } from './fingerprint.ts';
export { builtinFingerprints, FINGERPRINTS_VERSION } from './fingerprints/index.ts';
export type {
  Layer,
  LayerContext,
  Signal,
  SignalKind,
  SurfaceTarget,
} from './layer.ts';
export { LayerError, SIGNAL_KINDS } from './layer.ts';
export {
  bundleLayer,
  DEFAULT_LAYERS,
  distillHtml,
  distillScript,
  dnsLayer,
  extractBundleStrings,
  firstPartyScripts,
  httpLayer,
  isScript,
  lookupAsn,
  MAX_SCRIPTS,
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
  SurfaceFoundBy,
  SurfaceKind,
} from './report.ts';
export type { RequestScanDeps } from './request-scan.ts';
export { FRESH_FOR_MS, requestScan, STALE_AFTER_MS } from './request-scan.ts';
export type { LayerResult, RunOptions } from './runner.ts';
export { runLayer, runLayers } from './runner.ts';
export type { BuildReportInput, ScanOptions, SurfaceResults } from './scan.ts';
export {
  buildReport,
  deepTargets,
  layersForSurfaces,
  MAX_DEEP_SURFACES,
  reportStatus,
  SCAN_BUDGET_MS,
  scan,
} from './scan.ts';
export type { ScanRecord, ScanStatus, Store } from './store.ts';
export { DEFAULT_LIST_LIMIT, MemoryStore, ScanFinishedError, ScanNotFoundError } from './store.ts';
export { surfaceTarget } from './surface.ts';
export { STACKPROBE_VERSION } from './version.ts';
