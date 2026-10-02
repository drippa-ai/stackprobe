import dns, { type LookupAddress, type LookupOptions } from 'node:dns';
import { Resolver } from 'node:dns/promises';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { Readable } from 'node:stream';
import tls from 'node:tls';
import zlib from 'node:zlib';
import { LayerError } from '../layer.ts';
import type { DnsAnswer, DnsRecordType, HttpRequest, HttpResponse, Net, TlsInfo } from '../net.ts';
import type { LayerErrorCode } from '../report.ts';
import { STACKPROBE_VERSION } from '../version.ts';

export const USER_AGENT = `stackprobe/${STACKPROBE_VERSION} (+https://github.com/drippa-ai/stackprobe)`;

// The start of a page is what matters; stop reading huge responses.
const MAX_BODY_BYTES = 2_000_000;

const PRIVATE_RANGES = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE_RANGES.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE_RANGES.addSubnet(address, prefix, 'ipv6');
}

// True for loopback, private, link-local and other addresses that are not on the public internet.
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  const family = isIP(address);
  if (family === 0) return true;
  return PRIVATE_RANGES.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export interface NodeNetOptions {
  // Only for tests against a local server. A scanner must never reach private addresses.
  allowPrivateAddresses?: boolean;
}

// Net for Node: real HTTP requests that refuse private addresses at connect time, so a public
// hostname that resolves to an internal IP is caught as well.
export class NodeNet implements Net {
  private readonly allowPrivate: boolean;

  constructor(options: NodeNetOptions = {}) {
    this.allowPrivate = options.allowPrivateAddresses ?? false;
  }

  http(req: HttpRequest, signal: AbortSignal): Promise<HttpResponse> {
    const url = new URL(req.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return Promise.reject(new LayerError('HTTP_STATUS', `Unsupported URL ${req.url}`));
    }
    const blocked = this.blockedLiteral(url.hostname);
    if (blocked) return Promise.reject(blocked);
    const client = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const request = client.request(
        url,
        {
          method: req.method,
          headers: {
            'user-agent': USER_AGENT,
            'accept-encoding': 'gzip, deflate, br',
            ...req.headers,
          },
          signal,
          ...(this.allowPrivate ? {} : { lookup: publicOnlyLookup }),
        },
        (response) => {
          readBody(response).then(
            (body) =>
              resolve({
                url: req.url,
                status: response.statusCode ?? 0,
                headers: headerPairs(response),
                body,
              }),
            (error) => reject(toLayerError(error)),
          );
        },
      );
      request.on('error', (error) => reject(toLayerError(error)));
      request.end();
    });
  }

  async dns(name: string, type: DnsRecordType, signal: AbortSignal): Promise<DnsAnswer> {
    const resolver = new Resolver({ timeout: 2_000, tries: 2 });
    const cancel = () => resolver.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      return { name, type, records: await resolve(resolver, name, type) };
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      // The name exists but has no records of this type.
      if ((error as NodeJS.ErrnoException).code === 'ENODATA') return { name, type, records: [] };
      throw toLayerError(error);
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }

  // Completes a TLS handshake to read the certificate, then hangs up without sending anything.
  // The certificate is validated as usual; an invalid one fails with TLS_HANDSHAKE.
  tls(host: string, port: number, signal: AbortSignal): Promise<TlsInfo> {
    const blocked = this.blockedLiteral(host);
    if (blocked) return Promise.reject(blocked);

    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host,
        port,
        servername: isIP(host) ? undefined : host,
        ...(this.allowPrivate ? {} : { lookup: publicOnlyLookup }),
      });
      const onAbort = () => {
        socket.destroy();
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      const done = () => signal.removeEventListener('abort', onAbort);

      socket.once('secureConnect', () => {
        const cert = socket.getPeerCertificate();
        const info: TlsInfo = {
          host,
          ip: socket.remoteAddress ?? '',
          issuer: describeName(cert.issuer),
          subjectAltNames: (cert.subjectaltname ?? '')
            .split(',')
            .map((entry) => entry.trim().replace(/^DNS:/, ''))
            .filter(Boolean),
          validFrom: cert.valid_from ?? '',
          validTo: cert.valid_to ?? '',
        };
        done();
        socket.end();
        resolve(info);
      });
      socket.once('error', (error) => {
        done();
        reject(toLayerError(error));
      });
    });
  }

  private blockedLiteral(hostname: string): LayerError | null {
    const literal = hostname.replace(/^\[|\]$/g, '');
    return !this.allowPrivate && isIP(literal) && isPrivateAddress(literal)
      ? blockedError(literal)
      : null;
  }
}

async function resolve(resolver: Resolver, name: string, type: DnsRecordType): Promise<string[]> {
  switch (type) {
    case 'A':
      return resolver.resolve4(name);
    case 'AAAA':
      return resolver.resolve6(name);
    case 'CNAME':
      return resolver.resolveCname(name);
    case 'NS':
      return resolver.resolveNs(name);
    case 'MX':
      return (await resolver.resolveMx(name)).map((mx) => mx.exchange);
    case 'TXT':
      return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(''));
  }
}

function describeName(name: Record<string, string | string[] | undefined> | undefined): string {
  if (!name) return '';
  return ['C', 'O', 'OU', 'CN']
    .filter((field) => name[field])
    .map((field) => `${field}=${[name[field]].flat().join(' ')}`)
    .join(', ');
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

function publicOnlyLookup(
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback,
): void {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const blocked = addresses.find((entry) => isPrivateAddress(entry.address));
    if (blocked) return callback(blockedError(blocked.address) as NodeJS.ErrnoException, []);
    const [first] = addresses;
    if (!first)
      return callback(
        Object.assign(new Error(`No addresses for ${hostname}`), { code: 'ENOTFOUND' }),
        [],
      );
    if (options.all) return callback(null, addresses);
    callback(null, first.address, first.family);
  });
}

function blockedError(address: string): LayerError {
  return new LayerError(
    'BLOCKED_PRIVATE_ADDRESS',
    `Refusing to connect to non-public address ${address}`,
  );
}

function headerPairs(response: IncomingMessage): [string, string][] {
  const pairs: [string, string][] = [];
  const raw = response.rawHeaders;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    pairs.push([(raw[i] as string).toLowerCase(), raw[i + 1] as string]);
  }
  return pairs;
}

function readBody(response: IncomingMessage): Promise<string> {
  const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
  let stream: Readable = response;
  if (encoding === 'gzip' || encoding === 'x-gzip') stream = response.pipe(zlib.createGunzip());
  else if (encoding === 'deflate') stream = response.pipe(zlib.createInflate());
  else if (encoding === 'br') stream = response.pipe(zlib.createBrotliDecompress());

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    stream.on('data', (chunk: Buffer) => {
      if (done) return;
      chunks.push(chunk);
      size += chunk.length;
      if (size >= MAX_BODY_BYTES) {
        finish();
        response.destroy();
        if (stream !== response) stream.destroy();
      }
    });
    stream.on('end', finish);
    stream.on('error', (error) => {
      if (!done) {
        done = true;
        reject(error);
      }
    });
  });
}

const CONNECT_ERRORS = new Set([
  'ECONNREFUSED',
  'ETIMEOUT',
  'ESERVFAIL',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_SOCKET',
]);

function toLayerError(error: unknown): unknown {
  if (error instanceof LayerError) return error;
  if (!(error instanceof Error)) return new LayerError('INTERNAL', String(error));
  // Aborts belong to the runner, which reports them as timeouts.
  if (error.name === 'AbortError') return error;
  const code = (error as NodeJS.ErrnoException).code ?? '';
  let layerCode: LayerErrorCode = 'INTERNAL';
  if (code === 'ENOTFOUND' || code === 'ENODATA') layerCode = 'DNS_NXDOMAIN';
  else if (CONNECT_ERRORS.has(code)) layerCode = 'CONNECT_FAILED';
  else if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) layerCode = 'TLS_HANDSHAKE';
  return new LayerError(layerCode, error.message, { cause: error });
}
