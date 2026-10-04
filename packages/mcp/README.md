# @drippa/stackprobe-mcp

An MCP server that lets AI agents find out what a website is built on. Every finding comes with
its evidence and a confidence score. It runs on your machine, needs no account, and keeps scans
in `~/.stackprobe/scans.db`.

## Tools

| Tool | What it does |
| --- | --- |
| `scan_domain` | Scans a domain and stores the result. Returns a scan younger than 24 hours instead of scanning again, unless `force` is set. |
| `get_scan` | Returns a stored scan, by `scan_id` or the newest scan of a `domain`. |
| `explain_detection` | Explains one finding (`tech`): the evidence and how its confidence was reached. |
| `diff_scans` | What changed between two scans: technologies added, removed, or with a new version or confidence. |

Each tool returns a short text summary for the agent and the full typed report as structured
content.

Findings belong to the scanned URL. Until surface discovery lands, stackprobe does not claim
whether that URL is the product app or a marketing site.

## Run from a clone

Not on npm yet. From a clone of this repo, with Node 22.18 or newer (it runs the TypeScript
source directly):

```sh
pnpm install
```

Claude Code:

```sh
claude mcp add stackprobe -- node /path/to/stackprobe/packages/mcp/src/bin.ts
```

Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stackprobe": {
      "command": "node",
      "args": ["/path/to/stackprobe/packages/mcp/src/bin.ts"]
    }
  }
}
```

Set `STACKPROBE_DB` to keep scans in another file. Set `TYPESAFE_API_KEY` to let TypeSafe's Jev
model decide what kind a surface is (product app, marketing site, docs…) when the rules can't
tell; without it, scans classify by rules only.

To also load the product app in a headless browser (this is what reveals Supabase, Firebase and
other SDKs that only show up when the page's JavaScript runs), install Chromium once:

```sh
pnpm --filter @drippa/stackprobe-browser-playwright install-chromium
```

Without it, the browser layer is skipped.
