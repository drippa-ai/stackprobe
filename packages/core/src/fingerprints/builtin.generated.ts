// Generated from fingerprints/*.yaml by `pnpm fingerprints`. Do not edit.
export const FINGERPRINTS_VERSION = '21f606546cfb';
export const FINGERPRINT_DEFINITIONS: unknown[] = [
  {
    "id": "nextjs",
    "name": "Next.js",
    "category": "framework",
    "website": "https://nextjs.org",
    "rules": [
      {
        "id": "header-x-powered-by",
        "layer": "http",
        "signal": "header",
        "key": "x-powered-by",
        "match": {
          "regex": "(?:^|, *)Next\\.js"
        },
        "weight": 0.95
      },
      {
        "id": "header-cache",
        "layer": "http",
        "signal": "header",
        "key": "x-nextjs-cache",
        "match": {
          "exists": true
        },
        "weight": 0.9
      },
      {
        "id": "header-prerender",
        "layer": "http",
        "signal": "header",
        "key": "x-nextjs-prerender",
        "match": {
          "exists": true
        },
        "weight": 0.9
      },
      {
        "id": "header-vary-router",
        "layer": "http",
        "signal": "header",
        "key": "vary",
        "match": {
          "contains": "next-router-state-tree"
        },
        "weight": 0.9
      },
      {
        "id": "static-script",
        "layer": "http",
        "signal": "script-src",
        "match": {
          "contains": "/_next/static/"
        },
        "weight": 0.9,
        "detail": "Script served from /_next/static/"
      },
      {
        "id": "static-link",
        "layer": "http",
        "signal": "link-href",
        "match": {
          "contains": "/_next/static/"
        },
        "weight": 0.9,
        "detail": "Asset served from /_next/static/"
      },
      {
        "id": "meta-head-count",
        "layer": "http",
        "signal": "meta",
        "key": "next-head-count",
        "match": {
          "exists": true
        },
        "weight": 0.9
      },
      {
        "id": "global-next-data",
        "layer": "browser",
        "signal": "window-global",
        "match": {
          "equals": "__NEXT_DATA__"
        },
        "weight": 0.95,
        "detail": "Pages Router data global"
      },
      {
        "id": "global-flight",
        "layer": "browser",
        "signal": "window-global",
        "match": {
          "equals": "__next_f"
        },
        "weight": 0.95,
        "detail": "App Router streaming global"
      },
      {
        "id": "static-request",
        "layer": "browser",
        "signal": "request-url",
        "match": {
          "contains": "/_next/static/"
        },
        "weight": 0.9,
        "detail": "Request to /_next/static/"
      }
    ]
  },
  {
    "id": "supabase",
    "name": "Supabase",
    "category": "backend-as-a-service",
    "website": "https://supabase.com",
    "rules": [
      {
        "id": "api-request",
        "layer": "browser",
        "signal": "request-url",
        "match": {
          "regex": "^https://[a-z0-9]{20}\\.supabase\\.co/(?:rest|auth|storage|functions)/v1/"
        },
        "weight": 0.95,
        "detail": "Request to a Supabase project API"
      },
      {
        "id": "realtime-websocket",
        "layer": "browser",
        "signal": "websocket-url",
        "match": {
          "regex": "^wss://[a-z0-9]{20}\\.supabase\\.co/realtime/v1/"
        },
        "weight": 0.95,
        "detail": "Supabase Realtime connection"
      },
      {
        "id": "client-info-header",
        "layer": "browser",
        "signal": "request-header",
        "key": "x-client-info",
        "match": {
          "regex": "^supabase-js(?:-web|-node)?/(\\d+\\.\\d+\\.\\d+)"
        },
        "version": "$1",
        "weight": 0.9,
        "detail": "supabase-js client header"
      },
      {
        "id": "auth-cookie-browser",
        "layer": "browser",
        "signal": "cookie-name",
        "match": {
          "regex": "^sb-[a-z0-9]+-auth-token"
        },
        "weight": 0.85,
        "detail": "Supabase auth cookie"
      },
      {
        "id": "auth-cookie-http",
        "layer": "http",
        "signal": "cookie-name",
        "match": {
          "regex": "^sb-[a-z0-9]+-auth-token"
        },
        "weight": 0.85,
        "detail": "Supabase auth cookie"
      },
      {
        "id": "preconnect",
        "layer": "http",
        "signal": "link-href",
        "match": {
          "regex": "^https://[a-z0-9]{20}\\.supabase\\.co"
        },
        "weight": 0.8,
        "detail": "Preconnect to a Supabase project"
      },
      {
        "id": "dns-cname",
        "layer": "dns",
        "signal": "cname",
        "match": {
          "regex": "\\.supabase\\.co\\.?$"
        },
        "weight": 0.6,
        "detail": "CNAME to Supabase"
      }
    ]
  },
  {
    "id": "vercel",
    "name": "Vercel",
    "category": "hosting",
    "website": "https://vercel.com",
    "rules": [
      {
        "id": "header-x-vercel-id",
        "layer": "http",
        "signal": "header",
        "key": "x-vercel-id",
        "match": {
          "exists": true
        },
        "weight": 0.95,
        "detail": "Vercel request id header"
      },
      {
        "id": "header-x-vercel-cache",
        "layer": "http",
        "signal": "header",
        "key": "x-vercel-cache",
        "match": {
          "exists": true
        },
        "weight": 0.9,
        "detail": "Vercel edge cache header"
      },
      {
        "id": "header-server",
        "layer": "http",
        "signal": "header",
        "key": "server",
        "match": {
          "equals": "Vercel"
        },
        "weight": 0.9
      },
      {
        "id": "insights-script",
        "layer": "http",
        "signal": "script-src",
        "match": {
          "regex": "/_vercel/(?:insights|speed-insights)/"
        },
        "weight": 0.85,
        "detail": "Vercel analytics script"
      },
      {
        "id": "insights-request",
        "layer": "browser",
        "signal": "request-url",
        "match": {
          "regex": "/_vercel/(?:insights|speed-insights)/"
        },
        "weight": 0.85,
        "detail": "Vercel analytics request"
      },
      {
        "id": "dns-cname",
        "layer": "dns",
        "signal": "cname",
        "match": {
          "regex": "\\.vercel-dns(?:-\\d+)?\\.com\\.?$"
        },
        "weight": 0.9,
        "detail": "CNAME to Vercel"
      },
      {
        "id": "dns-a-anycast",
        "layer": "dns",
        "signal": "a",
        "match": {
          "cidr": [
            "76.76.21.0/24"
          ]
        },
        "weight": 0.85,
        "detail": "A record in Vercel's anycast range"
      },
      {
        "id": "dns-ns",
        "layer": "dns",
        "signal": "ns",
        "match": {
          "regex": "\\.vercel-dns\\.com\\.?$"
        },
        "weight": 0.4,
        "detail": "Nameservers at Vercel"
      }
    ]
  }
];
