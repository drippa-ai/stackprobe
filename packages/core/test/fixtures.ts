import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LayerError } from '../src/layer.ts';
import { distillHtml, isHtml } from '../src/layers/http.ts';
import type {
  DnsAnswer,
  DnsRecordType,
  HttpRequest,
  HttpResponse,
  Net,
  TlsInfo,
} from '../src/net.ts';
import type { LayerErrorCode } from '../src/report.ts';
import { redactHeaders, redactText } from './redact.ts';

// A fixture is everything one scan of a real site saw on the network, saved once and replayed
// in tests. Tests never touch live sites.
//
// fixtures/sites/<name>/
//   net.json       every Net call and its answer (or error)
//   expected.json  what a scan of this site must and must not detect, written by hand

export const FIXTURES_DIR = new URL('../../../fixtures/sites/', import.meta.url);
// Recordings of the ground-truth surfaces (fixtures/ground-truth.csv). They have no
// expected.json: the CSV says what each one should detect.
export const RECORDINGS_DIR = new URL('../../../fixtures/recordings/', import.meta.url);

type Recorded<T> = { result: T } | { error: { code: LayerErrorCode; message: string } };

export interface NetRecording {
  url: string;
  recordedAt: string;
  http: Record<string, Recorded<HttpResponse>>;
  dns: Record<string, Recorded<DnsAnswer>>;
  tls: Record<string, Recorded<TlsInfo>>;
}

export interface Expected {
  present: { tech: string; minConfidence: number }[];
  absent: string[];
}

export const keys = {
  http: (req: HttpRequest) => `${req.method} ${req.url}`,
  dns: (name: string, type: DnsRecordType) => `${type} ${name.toLowerCase()}`,
  tls: (host: string, port: number) => `${host.toLowerCase()}:${port}`,
};

export class FixtureMiss extends Error {
  constructor(key: string) {
    super(`No recorded answer for "${key}". Re-record the fixture if the scan changed.`);
    this.name = 'FixtureMiss';
  }
}

// Answers from a recording. A call that was never recorded throws and is listed in `misses`,
// so a test cannot quietly pass on an incomplete fixture.
export class ReplayNet implements Net {
  readonly misses: string[] = [];
  private readonly recording: NetRecording;

  constructor(recording: NetRecording) {
    this.recording = recording;
  }

  http(req: HttpRequest): Promise<HttpResponse> {
    return this.answer(this.recording.http, keys.http(req));
  }

  dns(name: string, type: DnsRecordType): Promise<DnsAnswer> {
    return this.answer(this.recording.dns, keys.dns(name, type));
  }

  tls(host: string, port: number): Promise<TlsInfo> {
    return this.answer(this.recording.tls, keys.tls(host, port));
  }

  private async answer<T>(entries: Record<string, Recorded<T>>, key: string): Promise<T> {
    const entry = entries[key];
    if (!entry) {
      this.misses.push(key);
      throw new FixtureMiss(key);
    }
    if ('error' in entry) throw new LayerError(entry.error.code, entry.error.message);
    return structuredClone(entry.result);
  }
}

// Wraps a real Net and keeps every answer, redacted, for saving as a fixture.
export class RecordingNet implements Net {
  readonly recording: NetRecording;
  private readonly inner: Net;

  constructor(inner: Net, url: string, recordedAt = new Date()) {
    this.inner = inner;
    this.recording = { url, recordedAt: recordedAt.toISOString(), http: {}, dns: {}, tls: {} };
  }

  http(req: HttpRequest, signal: AbortSignal): Promise<HttpResponse> {
    return this.record(
      this.recording.http,
      keys.http(req),
      this.inner.http(req, signal),
      (res) => ({
        ...res,
        url: redactText(res.url),
        headers: redactHeaders(res.headers),
        // Only the tags the HTTP layer reads, plus link text; no other page content goes into the repo.
        body: isHtml(res) ? redactText(distillHtml(res.body)) : '',
      }),
    );
  }

  dns(name: string, type: DnsRecordType, signal: AbortSignal): Promise<DnsAnswer> {
    return this.record(
      this.recording.dns,
      keys.dns(name, type),
      this.inner.dns(name, type, signal),
      (answer) => ({
        ...answer,
        records: answer.records.map(redactText),
      }),
    );
  }

  tls(host: string, port: number, signal: AbortSignal): Promise<TlsInfo> {
    return this.record(
      this.recording.tls,
      keys.tls(host, port),
      this.inner.tls(host, port, signal),
      (info) => info,
    );
  }

  private async record<T>(
    entries: Record<string, Recorded<T>>,
    key: string,
    pending: Promise<T>,
    redact: (value: T) => T,
  ): Promise<T> {
    try {
      const result = await pending;
      entries[key] = { result: redact(result) };
      return result;
    } catch (error) {
      const code = error instanceof LayerError ? error.code : 'INTERNAL';
      const message = error instanceof Error ? error.message : String(error);
      entries[key] = { error: { code, message: redactText(message) } };
      throw error;
    }
  }
}

export function loadFixture(name: string): { recording: NetRecording; expected: Expected } {
  const dir = new URL(`${name}/`, FIXTURES_DIR);
  return {
    recording: JSON.parse(readFileSync(new URL('net.json', dir), 'utf8')),
    expected: JSON.parse(readFileSync(new URL('expected.json', dir), 'utf8')),
  };
}

export function loadRecording(name: string, root = RECORDINGS_DIR): NetRecording {
  return JSON.parse(readFileSync(new URL(`${name}/net.json`, root), 'utf8'));
}

export function saveRecording(name: string, recording: NetRecording, root = FIXTURES_DIR): void {
  const dir = new URL(`${name}/`, root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('net.json', dir), `${JSON.stringify(recording, null, 2)}\n`);
}
