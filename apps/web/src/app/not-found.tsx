import type { Metadata } from 'next';
import { RequestedPath } from './requested-path.tsx';
import { ScanForm } from './scan-form.tsx';
import { SiteHeader } from './site-chrome.tsx';

export const metadata: Metadata = { title: 'Page not found · stackprobe' };

// Any address that doesn't exist. Next sends it with a 404 status.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="page not-found">
        <div className="report-title">
          <h1 className="not-found-title">Page not found</h1>
          <p className="verdict">
            There's no page at <RequestedPath />. Scan a domain, or go back to the home page.
          </p>
        </div>
        <ScanForm variant="compact" />
        <p>
          <a href="/">Back to the home page</a>
        </p>
      </main>
    </>
  );
}
