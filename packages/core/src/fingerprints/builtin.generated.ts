// Generated from fingerprints/*.yaml by `pnpm fingerprints`. Do not edit.
export const FINGERPRINTS_VERSION = '84c9355fa9ff';
export const FINGERPRINT_DEFINITIONS: unknown[] = [
  {
    "id": "auth0",
    "name": "Auth0",
    "category": "auth",
    "website": "https://auth0.com",
    "rules": [
      {
        "id": "redirect-to-login",
        "layer": "http",
        "signal": "header",
        "key": "location",
        "match": {
          "regex": "^https://[a-z0-9-]+(?:\\.[a-z]{2})?\\.auth0\\.com/(?:authorize|u/login)"
        },
        "weight": 0.95,
        "detail": "Redirect to an Auth0 login"
      },
      {
        "id": "cdn-script",
        "layer": "http",
        "signal": "script-src",
        "match": {
          "prefix": "https://cdn.auth0.com/"
        },
        "weight": 0.85,
        "detail": "Script from Auth0's CDN"
      },
      {
        "id": "preconnect",
        "layer": "http",
        "signal": "link-href",
        "match": {
          "regex": "^https://[a-z0-9-]+(?:\\.[a-z]{2})?\\.auth0\\.com"
        },
        "weight": 0.8,
        "detail": "Preconnect to an Auth0 tenant"
      },
      {
        "id": "tenant-request",
        "layer": "browser",
        "signal": "request-url",
        "match": {
          "regex": "^https://[a-z0-9-]+(?:\\.[a-z]{2})?\\.auth0\\.com/(?:authorize|oauth/token|u/login|co/authenticate)"
        },
        "weight": 0.95,
        "detail": "Request to an Auth0 tenant"
      },
      {
        "id": "spa-cookie",
        "layer": "browser",
        "signal": "cookie-name",
        "match": {
          "regex": "^auth0\\.[A-Za-z0-9]+\\.is\\.authenticated$"
        },
        "weight": 0.9,
        "detail": "auth0-spa-js session cookie"
      }
    ]
  },
  {
    "id": "clerk",
    "name": "Clerk",
    "category": "auth",
    "website": "https://clerk.com",
    "rules": [
      {
        "id": "header-auth-status",
        "layer": "http",
        "signal": "header",
        "key": "x-clerk-auth-status",
        "match": {
          "exists": true
        },
        "weight": 0.95,
        "detail": "Clerk middleware header"
      },
      {
        "id": "header-auth-reason",
        "layer": "http",
        "signal": "header",
        "key": "x-clerk-auth-reason",
        "match": {
          "exists": true
        },
        "weight": 0.95,
        "detail": "Clerk middleware header"
      },
      {
        "id": "clerk-js",
        "layer": "http",
        "signal": "script-src",
        "match": {
          "regex": "/npm/@clerk/clerk-js@(\\d+)[^/]*/"
        },
        "version": "$1",
        "weight": 0.95,
        "detail": "Clerk's JavaScript SDK"
      },
      {
        "id": "cookie-uat",
        "layer": "http",
        "signal": "cookie-name",
        "match": {
          "regex": "^__client_uat(?:_|$)"
        },
        "weight": 0.9,
        "detail": "Clerk session cookie"
      },
      {
        "id": "cookie-uat-browser",
        "layer": "browser",
        "signal": "cookie-name",
        "match": {
          "regex": "^__client_uat(?:_|$)"
        },
        "weight": 0.9,
        "detail": "Clerk session cookie"
      },
      {
        "id": "frontend-api-request",
        "layer": "browser",
        "signal": "request-url",
        "match": {
          "regex": "^https://(?:clerk\\.[a-z0-9.-]+|[a-z0-9-]+\\.clerk\\.accounts\\.dev)/v1/"
        },
        "weight": 0.9,
        "detail": "Request to Clerk's frontend API"
      }
    ]
  },
  {
    "id": "cloudflare",
    "name": "Cloudflare",
    "category": "cdn",
    "website": "https://www.cloudflare.com",
    "rules": [
      {
        "id": "header-cf-ray",
        "layer": "http",
        "signal": "header",
        "key": "cf-ray",
        "match": {
          "exists": true
        },
        "weight": 0.95,
        "detail": "Cloudflare request id header"
      },
      {
        "id": "header-server",
        "layer": "http",
        "signal": "header",
        "key": "server",
        "match": {
          "equals": "cloudflare"
        },
        "weight": 0.95
      },
      {
        "id": "header-cache-status",
        "layer": "http",
        "signal": "header",
        "key": "cf-cache-status",
        "match": {
          "exists": true
        },
        "weight": 0.9,
        "detail": "Cloudflare cache header"
      },
      {
        "id": "cookie-bot-management",
        "layer": "http",
        "signal": "cookie-name",
        "match": {
          "equals": "__cf_bm"
        },
        "weight": 0.9,
        "detail": "Cloudflare bot management cookie"
      },
      {
        "id": "asn",
        "layer": "tls",
        "signal": "asn",
        "match": {
          "regex": "^AS13335\\b"
        },
        "weight": 0.85,
        "detail": "Address in Cloudflare's network"
      },
      {
        "id": "dns-cname",
        "layer": "dns",
        "signal": "cname",
        "match": {
          "regex": "\\.(?:pages\\.dev|cdn\\.cloudflare\\.net)\\.?$"
        },
        "weight": 0.9,
        "detail": "CNAME to Cloudflare"
      }
    ]
  },
  {
    "id": "firebase",
    "name": "Firebase",
    "category": "backend-as-a-service",
    "website": "https://firebase.google.com",
    "rules": [
      {
        "id": "hosting-reserved-script",
        "layer": "http",
        "signal": "script-src",
        "match": {
          "regex": "/__/firebase/"
        },
        "weight": 0.95,
        "detail": "Script from Firebase Hosting's reserved URLs"
      },
      {
        "id": "sdk-script",
        "layer": "http",
        "signal": "script-src",
        "match": {
          "regex": "^https://www\\.gstatic\\.com/firebasejs/(\\d+\\.\\d+\\.\\d+)/"
        },
        "version": "$1",
        "weight": 0.9,
        "detail": "Firebase JavaScript SDK"
      },
      {
        "id": "dns-cname",
        "layer": "dns",
        "signal": "cname",
        "match": {
          "regex": "\\.(?:web\\.app|firebaseapp\\.com)\\.?$"
        },
        "weight": 0.9,
        "detail": "CNAME to Firebase Hosting"
      },
      {
        "id": "dns-a",
        "layer": "dns",
        "signal": "a",
        "match": {
          "cidr": [
            "199.36.158.100/32",
            "151.101.1.195/32",
            "151.101.65.195/32"
          ]
        },
        "weight": 0.85,
        "detail": "A record at Firebase Hosting"
      },
      {
        "id": "api-request",
        "layer": "browser",
        "signal": "request-url",
        "match": {
          "regex": "^https://(?:firestore|identitytoolkit|securetoken|firebaseinstallations)\\.googleapis\\.com/"
        },
        "weight": 0.9,
        "detail": "Request to a Firebase API"
      },
      {
        "id": "realtime-database",
        "layer": "browser",
        "signal": "websocket-url",
        "match": {
          "regex": "\\.firebaseio\\.com/"
        },
        "weight": 0.9,
        "detail": "Firebase Realtime Database connection"
      }
    ]
  },
  {
    "id": "framer",
    "name": "Framer",
    "category": "site-builder",
    "website": "https://www.framer.com",
    "rules": [
      {
        "id": "meta-generator",
        "layer": "http",
        "signal": "meta",
        "key": "generator",
        "match": {
          "regex": "^Framer\\b"
        },
        "weight": 0.95,
        "detail": "Generator tag names Framer"
      },
      {
        "id": "header-site-id",
        "layer": "http",
        "signal": "header",
        "key": "framer-site-id",
        "match": {
          "exists": true
        },
        "weight": 0.95,
        "detail": "Framer site id header"
      },
      {
        "id": "header-server",
        "layer": "http",
        "signal": "header",
        "key": "server",
        "match": {
          "regex": "^Framer(?:/|$)"
        },
        "weight": 0.95
      },
      {
        "id": "asset-cdn",
        "layer": "http",
        "signal": "link-href",
        "match": {
          "prefix": "https://framerusercontent.com/"
        },
        "weight": 0.85,
        "detail": "Asset served from Framer's CDN"
      },
      {
        "id": "script-cdn",
        "layer": "http",
        "signal": "script-src",
        "match": {
          "regex": "^https://(?:framerusercontent\\.com|events\\.framer\\.com)/"
        },
        "weight": 0.85,
        "detail": "Script served by Framer"
      },
      {
        "id": "dns-cname",
        "layer": "dns",
        "signal": "cname",
        "match": {
          "regex": "\\.framer\\.(?:app|website)\\.?$"
        },
        "weight": 0.9,
        "detail": "CNAME to Framer"
      }
    ]
  },
  {
    "id": "netlify",
    "name": "Netlify",
    "category": "hosting",
    "website": "https://www.netlify.com",
    "rules": [
      {
        "id": "header-server",
        "layer": "http",
        "signal": "header",
        "key": "server",
        "match": {
          "equals": "Netlify"
        },
        "weight": 0.95
      },
      {
        "id": "header-request-id",
        "layer": "http",
        "signal": "header",
        "key": "x-nf-request-id",
        "match": {
          "exists": true
        },
        "weight": 0.95,
        "detail": "Netlify request id header"
      },
      {
        "id": "header-vary",
        "layer": "http",
        "signal": "header",
        "key": "netlify-vary",
        "match": {
          "exists": true
        },
        "weight": 0.9,
        "detail": "Netlify cache header"
      },
      {
        "id": "dns-cname",
        "layer": "dns",
        "signal": "cname",
        "match": {
          "regex": "\\.netlify(?:globalcdn)?\\.(?:app|com)\\.?$"
        },
        "weight": 0.9,
        "detail": "CNAME to Netlify"
      },
      {
        "id": "dns-a",
        "layer": "dns",
        "signal": "a",
        "match": {
          "cidr": [
            "75.2.60.5/32"
          ]
        },
        "weight": 0.85,
        "detail": "A record at Netlify's load balancer"
      }
    ]
  },
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
    "id": "payload",
    "name": "Payload",
    "category": "cms",
    "website": "https://payloadcms.com",
    "rules": [
      {
        "id": "header-powered-by",
        "layer": "http",
        "signal": "header",
        "key": "x-powered-by",
        "match": {
          "regex": "\\bPayload\\b"
        },
        "weight": 0.95,
        "detail": "x-powered-by names Payload"
      },
      {
        "id": "upload-url",
        "layer": "http",
        "signal": "meta",
        "key": "og:image",
        "match": {
          "regex": "/api/[a-z0-9-]+/file/"
        },
        "weight": 0.6,
        "detail": "Share image served from a Payload upload URL"
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
        "id": "dns-a-vercel-network",
        "layer": "dns",
        "signal": "a",
        "match": {
          "cidr": [
            "76.76.21.0/24",
            "66.33.60.0/24",
            "198.169.1.0/24",
            "198.169.2.0/24",
            "216.198.79.0/24",
            "216.230.84.0/24",
            "216.230.86.0/24",
            "216.150.16.0/24",
            "216.150.1.0/24",
            "64.239.123.0/24",
            "64.239.109.0/24",
            "64.29.17.0/24",
            "143.13.0.0/16",
            "155.121.0.0/16"
          ]
        },
        "weight": 0.85,
        "detail": "A record in a network registered to Vercel"
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
  },
  {
    "id": "webflow",
    "name": "Webflow",
    "category": "site-builder",
    "website": "https://webflow.com",
    "rules": [
      {
        "id": "header-page-id",
        "layer": "http",
        "signal": "header",
        "key": "x-wf-page-id",
        "match": {
          "exists": true
        },
        "weight": 0.95,
        "detail": "Webflow page id header"
      },
      {
        "id": "header-region",
        "layer": "http",
        "signal": "header",
        "key": "x-wf-region",
        "match": {
          "exists": true
        },
        "weight": 0.9,
        "detail": "Webflow region header"
      },
      {
        "id": "meta-generator",
        "layer": "http",
        "signal": "meta",
        "key": "generator",
        "match": {
          "regex": "^Webflow\\b"
        },
        "weight": 0.95,
        "detail": "Generator tag names Webflow"
      },
      {
        "id": "asset-cdn",
        "layer": "http",
        "signal": "link-href",
        "match": {
          "regex": "^https://(?:cdn\\.prod|assets)\\.website-files\\.com/"
        },
        "weight": 0.85,
        "detail": "Stylesheet or asset from Webflow's CDN"
      },
      {
        "id": "script-cdn",
        "layer": "http",
        "signal": "script-src",
        "match": {
          "regex": "^https://(?:cdn\\.prod|assets)\\.website-files\\.com/"
        },
        "weight": 0.85,
        "detail": "Script from Webflow's CDN"
      },
      {
        "id": "dns-cname",
        "layer": "dns",
        "signal": "cname",
        "match": {
          "regex": "^(?:cdn|proxy-ssl)\\.webflow\\.com\\.?$"
        },
        "weight": 0.9,
        "detail": "CNAME to Webflow"
      },
      {
        "id": "dns-a",
        "layer": "dns",
        "signal": "a",
        "match": {
          "cidr": [
            "198.202.211.1/32"
          ]
        },
        "weight": 0.85,
        "detail": "A record at Webflow"
      }
    ]
  }
];
