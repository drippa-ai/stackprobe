// Fixtures are committed to a public repo. Anything that could be a credential is removed
// before a recording touches disk, and a test re-checks every committed fixture.

const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'apikey',
  'x-api-key',
]);

const SECRET_PATTERNS: [pattern: RegExp, replacement: string][] = [
  [/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, '<jwt>'],
  [/\bsb_(publishable|secret)_[\w-]{8,}/g, 'sb_$1_<redacted>'],
  [/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/g, '$1_$2_<redacted>'],
];

export function redactText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// Keeps the header names, which fingerprints use, and drops values that may be credentials.
export function redactHeaders(headers: [string, string][]): [string, string][] {
  return headers.map(([name, value]) => {
    if (SECRET_HEADERS.has(name)) return [name, '<redacted>'];
    if (name === 'set-cookie') {
      const cookieName = value.split('=', 1)[0] ?? '';
      return [name, `${cookieName}=<redacted>`];
    }
    return [name, redactText(value)];
  });
}

// Returns every unredacted secret-looking string in the text.
export function findSecrets(text: string): string[] {
  const found: string[] = [];
  for (const [pattern] of SECRET_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (!match[0].includes('<redacted>')) found.push(match[0]);
    }
  }
  return found;
}
