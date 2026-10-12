import { initBotId } from 'botid/client/core';

// Vercel BotID: marks the browser's requests to the pages that start scans, so the server action
// can tell people from bots (see lib/start-scan.ts). Only on Vercel production, matching
// getBotCheck in lib/services.ts. Scan forms post to the page they're on: home, reports, and any
// not-found address.
if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
  initBotId({ protect: [{ path: '/*', method: 'POST' }] });
}
