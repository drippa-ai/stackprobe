const REPO = 'https://github.com/drippa-ai/stackprobe';

// The probe mark: a ring with the signal dot in the middle.
function ProbeMark() {
  return (
    <svg className="probe-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.75" className="probe-dot" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="page">
        <a href="/" className="wordmark">
          <ProbeMark />
          stackprobe
        </a>
        <nav className="site-nav" aria-label="Site">
          <a href={REPO}>GitHub</a>
          <a href="https://drippa.ai" className="by">
            powered by Drippa
          </a>
        </nav>
      </div>
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
