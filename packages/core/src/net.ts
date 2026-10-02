// Everything a layer may do on the network goes through Net. Core never does I/O itself:
// the Node implementation, the hosted runner and the test replayer each provide one.

export interface HttpRequest {
  url: string;
  method: 'GET' | 'HEAD';
  headers?: Record<string, string>;
}

export interface HttpResponse {
  url: string;
  status: number;
  // A list, not a map: headers like set-cookie repeat. Names are lower-case.
  headers: [name: string, value: string][];
  body: string;
}

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'NS' | 'MX' | 'TXT';

export interface DnsAnswer {
  name: string;
  type: DnsRecordType;
  records: string[];
}

export interface TlsInfo {
  host: string;
  ip: string;
  issuer: string;
  subjectAltNames: string[];
  validFrom: string;
  validTo: string;
}

export interface Net {
  // Does not follow redirects; the caller does, so every hop can be checked.
  http(req: HttpRequest, signal: AbortSignal): Promise<HttpResponse>;
  dns(name: string, type: DnsRecordType, signal: AbortSignal): Promise<DnsAnswer>;
  tls(host: string, port: number, signal: AbortSignal): Promise<TlsInfo>;
}
