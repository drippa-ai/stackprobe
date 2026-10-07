import type { ReactNode } from 'react';

const REPO = 'https://github.com/drippa-ai/stackprobe';

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="page site-header">
      <div className="wordmark">
        <a href="/">stackprobe</a>
        <a href="https://drippa.ai">powered by Drippa</a>
      </div>
      {children}
      <nav className="site-nav" aria-label="Site">
        <a href={REPO}>GitHub</a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page">
        <span>
          Powered by <a href="https://drippa.ai">Drippa</a>. Open source,{' '}
          <a href={`${REPO}/blob/main/LICENSE`}>Apache-2.0</a>.
        </span>
        <nav aria-label="Footer">
          <a href={REPO}>GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
