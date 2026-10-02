// Loaded before every test file: any attempt to reach the internet fails the test.
// Tests use recorded fixtures instead. Connections to this machine stay allowed.
// dns.lookup stays allowed: local connections need it, and any remote connect is blocked anyway.
import dns from 'node:dns';
import net from 'node:net';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', undefined]);

function blocked(what: string): never {
  throw new Error(`Network access is blocked in tests (${what}). Use a recorded fixture.`);
}

globalThis.fetch = (input) => blocked(`fetch ${String(input)}`);

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  // net.connect() hands its arguments over already normalized, as a single array.
  const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  let host: string | undefined;
  if (typeof first === 'object' && first !== null) {
    const options = first as { host?: string; path?: string };
    host = options.path ? 'localhost' : options.host;
  } else if (typeof second === 'string') {
    host = second;
  }
  if (!LOCAL_HOSTS.has(host)) blocked(`connect to ${host}`);
  return connect.apply(this, args as Parameters<typeof connect>);
} as typeof connect;

for (const target of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const name of Object.getOwnPropertyNames(target)) {
    if (/^(resolve|reverse)/.test(name)) {
      Object.defineProperty(target, name, { value: () => blocked(`dns.${name}`) });
    }
  }
}
