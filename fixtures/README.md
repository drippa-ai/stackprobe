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

## Ground truth

`ground-truth.csv` lists sites whose stack we know from a source we trust, so accuracy can be
measured instead of guessed. Each row is one surface: a product app, a marketing site or docs,
because the two often run on different stacks.

| Column | Meaning |
| --- | --- |
| `surface_url` | The page to scan |
| `surface_kind` | `app`, `marketing`, `docs`, `api`, or `unclear` when the source doesn't say |
| `present` / `absent` | Technologies the source says are used / not used (space separated). `absent` usually comes from a documented migration away |
| `source` | A public case study or the company's own post, or `first-hand` |
| `source_date` | When the source was written. Stacks change, so older rows are weaker |
| `strength` | `first-hand`, `strong` (own post, or vendor case study from 2024 on), or `medium` (older, or an inferred app URL) |

Rules: only list a technology a source states explicitly (a logo on a customer wall is not
enough), and never a fact you found by scanning the site yourself. Plain CSV with no quoting, so
no field may contain a comma. A test checks the format.
