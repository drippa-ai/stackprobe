# stackprobe
Probe the tech stacks of any product

## MCP

Connect an agent to the hosted MCP server with an API key (see "Get a key" below):

```sh
claude mcp add --transport http stackprobe https://stackprobe.tech/mcp \
  --header "Authorization: Bearer $STACKPROBE_KEY"
```

It has four tools: `scan_domain`, `get_scan`, `explain_detection` and `diff_scans`. `scan_domain` waits up to 25 seconds for a scan; if it's still running, call `get_scan` a little later. The limits are the same as the HTTP API's.

## HTTP API

Agents and scripts can use stackprobe over HTTP. Reading is free; starting scans needs a key, which you can create yourself.

**1. Get a key** (at most 3 a day per address; the key is shown once):

```sh
curl -X POST https://stackprobe.tech/api/keys
# {"key":"sp_…","prefix":"sp_…","limits":{"scansPerDay":10},"note":"…"}
```

**2. Start a scan** (10 new scans a day per key; getting back a scan from the last 24 hours is free):

```sh
curl -X POST https://stackprobe.tech/api/scans \
  -H "Authorization: Bearer sp_…" \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
# 202 while it runs: {"scanId":"…","status":"running","report":null,"reused":false,"poll":"https://stackprobe.tech/api/scans/…",…}
```

Add `"force": true` to scan again even if a recent scan exists.

**3. Poll** until `status` is `done` or `partial` (a few seconds apart; no key needed):

```sh
curl https://stackprobe.tech/api/scans/<scanId>
# 200 when finished: {"status":"done","report":{…},…}
```

**Or read the latest report for a domain** without a key: `https://stackprobe.tech/s/example.com.json`.

The `report` field follows [`schema/report.v1.json`](schema/report.v1.json).

| Status | Meaning |
|---|---|
| `400` | The body isn't JSON, or `domain` isn't a domain or URL |
| `401` | Missing, unknown or revoked key |
| `404` | No scan with that id |
| `429` | Daily limit reached; `resetAt` and `Retry-After` say when to try again |

Revoke a key with `curl -X DELETE https://stackprobe.tech/api/keys/current -H "Authorization: Bearer sp_…"`.
