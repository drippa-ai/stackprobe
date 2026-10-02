# Fixtures

Tests never touch live websites. Instead, each folder in `sites/` holds what one scan of a
real site saw on the network, recorded once and replayed in tests.

```
sites/<name>/
  net.json       every DNS, TLS and HTTP answer the scan received (or the error it got)
  expected.json  what a scan of this site must and must not detect, written by hand
```

- **Recording** strips credentials before anything is written: cookie values, auth headers,
  JWTs and API keys. A test re-checks every committed fixture for leftovers.
- **Replaying** fails if the scan asks for anything that wasn't recorded, so a fixture can
  never pass while incomplete. All network access is blocked while tests run.
- Recordings are snapshots. If a site changes its stack, re-record it rather than editing
  `net.json` by hand.
