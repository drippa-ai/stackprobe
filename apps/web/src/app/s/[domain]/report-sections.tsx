import type { Report, ScanRecord } from '@drippa/stackprobe-core';
import {
  foundByText,
  layersThatRan,
  type SurfaceTab,
  scanDuration,
  surfaceTabs,
  techLabel,
  techName,
  verdict,
} from '../../../lib/report-view.ts';
import { rescanAction } from '../../actions.ts';
import { ScanForm } from '../../scan-form.tsx';
import { AutoRefresh } from './auto-refresh.tsx';
import { CopyLink } from './copy-link.tsx';

// The report page's sections, apart from loading the scan, so they can be rendered in tests.

export function NotScanned({ domain }: { domain: string }) {
  return (
    <section className="report-head">
      <div>
        <h1>{domain}</h1>
        <p className="verdict">Not scanned yet.</p>
      </div>
      <ScanForm defaultValue={domain} variant="compact" />
    </section>
  );
}

export function Running({ scan }: { scan: ScanRecord }) {
  return (
    <section className="report-head">
      <div>
        <h1>{scan.domain}</h1>
        <p className="verdict" role="status">
          Scanning {scan.url}. This takes about half a minute.
        </p>
      </div>
      <AutoRefresh />
    </section>
  );
}

export function ReportView({
  scan,
  report,
  selected,
}: {
  scan: ScanRecord;
  report: Report;
  selected: string | undefined;
}) {
  const tabs = surfaceTabs(report);
  const current = tabs.find((t) => t.surface.id === selected) ?? tabs[0];
  const duration = scanDuration(scan.createdAt, scan.finishedAt);
  return (
    <>
      <section className="report-head">
        <div>
          <h1>{scan.domain}</h1>
          <p className="verdict">{verdict(report)}</p>
        </div>
        <dl className="facts">
          <dt>Scanned</dt>
          <dd>{formatDate(scan.finishedAt ?? scan.createdAt)}</dd>
          <dt>Surfaces</dt>
          <dd>{report.surfaces.length}</dd>
          <dt>Took</dt>
          <dd>{duration ?? '–'}</dd>
        </dl>
      </section>

      <section>
        <nav className="tabs" aria-label="Surfaces">
          {tabs.map((tab) => (
            <a
              key={tab.surface.id}
              href={`?surface=${encodeURIComponent(tab.surface.id)}`}
              aria-current={tab === current ? 'page' : undefined}
            >
              {tab.label}
            </a>
          ))}
        </nav>
        {current ? <SurfacePanel tab={current} /> : null}
        <p className="muted" style={{ margin: '14px 0 0', fontSize: 14 }}>
          Backends and databases aren't visible from outside. Checks that ran:{' '}
          {layersThatRan(report)}.
          {scan.status === 'partial' ? (
            <span className="warn"> Some checks failed, so this result may be incomplete.</span>
          ) : null}
        </p>
      </section>

      <section className="report-foot">
        <span className="muted">Fingerprints {report.fingerprintsVersion}</span>
        <span className="actions">
          <CopyLink />
          <form action={rescanAction}>
            <input type="hidden" name="url" value={scan.url} />
            <button type="submit" className="link-button">
              Scan again
            </button>
          </form>
        </span>
      </section>
    </>
  );
}

function SurfacePanel({ tab }: { tab: SurfaceTab }) {
  const { surface, folded, detections } = tab;
  const sure =
    surface.kindConfidence !== null ? `, ${Math.round(surface.kindConfidence * 100)}% sure` : '';
  const notes = [
    foundByText(surface),
    surface.kind === 'unclassified' && surface.kindReasons?.length
      ? surface.kindReasons.join(', ')
      : null,
    ...folded.map(({ surface: s, reason }) =>
      reason === 'redirect'
        ? `${shortUrl(s.url)} redirects here`
        : `${shortUrl(s.url)} is the same app`,
    ),
  ].filter(Boolean);
  return (
    <>
      <div className="surface-line">
        <span>
          <span className="mono">{shortUrl(surface.url)}</span>{' '}
          <span className="muted">
            · {tab.label.split(' · ')[0]?.toLowerCase()}
            {sure}
          </span>
        </span>
        {notes.length ? <span className="muted">{notes.join(' · ')}</span> : null}
      </div>
      {detections.length === 0 ? (
        <p>Nothing detected here.</p>
      ) : (
        <div className="techs">
          <div className="tech-head" aria-hidden="true">
            <span>Technology</span>
            <span className="num">Clues</span>
            <span className="num">Confidence</span>
          </div>
          {detections.map((detection) => (
            <details key={detection.tech}>
              <summary className="tech-row">
                <span
                  className="bar"
                  style={{ width: `${Math.round(detection.confidence * 100)}%` }}
                />
                <span>
                  <strong>{techName(detection.tech)}</strong>
                  {detection.version ? <span className="mono"> {detection.version}</span> : null}{' '}
                  <span className="muted">· {detection.category}</span>
                  <span className="visually-hidden">
                    {` ${techLabel(detection)}: ${detection.evidence.length} clues, ${Math.round(detection.confidence * 100)}% confidence`}
                  </span>
                </span>
                <span className="num" aria-hidden="true">
                  {detection.evidence.length}
                </span>
                <span className="num" aria-hidden="true">
                  {Math.round(detection.confidence * 100)}%
                </span>
              </summary>
              <ul className="evidence">
                {detection.evidence.map((e) => (
                  <li key={`${e.ruleId} ${e.detail}`}>
                    <span>{e.layer}</span>
                    <span>{e.detail}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

function shortUrl(url: string): string {
  const u = new URL(url);
  return `${u.hostname}${u.pathname === '/' ? '' : u.pathname}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}
