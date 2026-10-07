import type { Detection, LayerRun, Report, ScanRecord } from '@drippa/stackprobe-core';
import {
  failedChecks,
  foundByText,
  layersThatRan,
  type SurfaceTab,
  scanDuration,
  scanProgress,
  surfaceTabs,
  techLabel,
  techName,
  verdict,
  verdictNames,
} from '../../../lib/report-view.ts';
import { rescanAction } from '../../actions.ts';
import { ScanBand } from '../../effects/scan-band.tsx';
import { ScanForm } from '../../scan-form.tsx';
import { AutoRefresh } from './auto-refresh.tsx';
import { CopyLink } from './copy-link.tsx';

// The report page's sections, apart from loading the scan, so they can be rendered in tests.

// Under this, a confidence bar is drawn grey: a weak guess shouldn't look like a finding.
const SURE = 0.6;

export function NotScanned({ domain }: { domain: string }) {
  return (
    <section className="report-head">
      <div className="report-title">
        <h1 className="domain">{domain}</h1>
        <p className="verdict">Not scanned yet.</p>
      </div>
      <ScanForm defaultValue={domain} variant="compact" />
    </section>
  );
}

export function Running({ scan, runs }: { scan: ScanRecord; runs: LayerRun[] }) {
  const { now, steps } = scanProgress(runs);
  return (
    <>
      <section className="report-head">
        <div className="report-title">
          <h1 className="domain">{scan.domain}</h1>
          <p className="status-line" role="status">
            <Chip state="running">Running</Chip>
            <span>{now}</span>
          </p>
        </div>
      </section>
      <ScanBand />
      <ol className="progress" aria-label="Checks">
        {steps.map((step) => (
          <li key={step.layer} className={`progress-step ${step.state}`}>
            <span className="step-dot" aria-hidden="true" />
            <span className="step-layer">{step.layer}</span>
            <span className="step-text">
              {step.text}
              {step.failed > 0 ? <span className="warn-text"> · {step.failed} failed</span> : null}
              <span className="visually-hidden">
                {step.state === 'done' ? ', done' : step.state === 'now' ? ', in progress' : ''}
              </span>
            </span>
            <span className="step-took">{step.took}</span>
          </li>
        ))}
      </ol>
      <p className="report-note">
        Scanning <span className="mono">{scan.url}</span>. This usually takes about half a minute,
        and the page updates by itself.
      </p>
      <AutoRefresh />
    </>
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
  const failed = scan.status === 'partial' ? failedChecks(report) : [];
  return (
    <>
      <section className="report-head">
        <div className="report-title">
          <h1 className="domain">{scan.domain}</h1>
          <Verdict report={report} />
        </div>
        <dl className="facts">
          <div>
            <dt>Scanned</dt>
            <dd>{formatDate(scan.finishedAt ?? scan.createdAt)}</dd>
          </div>
          <div>
            <dt>Surfaces</dt>
            <dd>{report.surfaces.length}</dd>
          </div>
          <div>
            <dt>Took</dt>
            <dd>{duration ?? '–'}</dd>
          </div>
        </dl>
      </section>

      <section className="surfaces">
        <nav className="tabs" aria-label="Surfaces">
          {tabs.map((tab) => (
            <a
              key={tab.surface.id}
              href={`?surface=${encodeURIComponent(tab.surface.id)}`}
              aria-current={tab === current ? 'page' : undefined}
            >
              <span className="tab-kind">{tab.label.split(' · ')[0]}</span>
              <span className="tab-host">{new URL(tab.surface.url).hostname}</span>
            </a>
          ))}
        </nav>
        {current ? <SurfacePanel tab={current} /> : null}
      </section>

      <section className="report-foot">
        <div className="report-notes">
          {failed.length > 0 ? (
            <p className="status-line">
              <Chip state="partial">Partial</Chip>
              <span>
                Some checks failed, so this result may be incomplete: {failed.join(', ')}.
              </span>
            </p>
          ) : null}
          <p className="report-note">
            Backends and databases aren't visible from outside. Checks that ran:{' '}
            {layersThatRan(report)}. Fingerprints{' '}
            <span className="mono">{report.fingerprintsVersion}</span>.
          </p>
        </div>
        <div className="actions">
          <CopyLink />
          <form action={rescanAction}>
            <input type="hidden" name="url" value={scan.url} />
            <button type="submit" className="button">
              Scan again
            </button>
          </form>
        </div>
      </section>
    </>
  );
}

function SurfacePanel({ tab }: { tab: SurfaceTab }) {
  const { surface, folded, detections } = tab;
  const notes = [
    surface.kindConfidence !== null
      ? `${Math.round(surface.kindConfidence * 100)}% sure it's ${tab.label.split(' · ')[0]?.toLowerCase()}`
      : null,
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
      <p className="surface-line">
        <span className="mono">{shortUrl(surface.url)}</span>
        {notes.length ? <span> · {notes.join(' · ')}</span> : null}
      </p>
      {detections.length === 0 ? (
        <p className="empty">Nothing we recognise on this surface.</p>
      ) : (
        <div className="tech-table">
          <div className="tech-head" aria-hidden="true">
            <span>Technology</span>
            <span>Category</span>
            <span className="num">Clues</span>
            <span className="confidence-head">Confidence</span>
          </div>
          {detections.map((detection) => (
            <TechRow key={detection.tech} detection={detection} />
          ))}
        </div>
      )}
    </>
  );
}

// The verdict with the technologies it names in full ink.
function Verdict({ report }: { report: Report }) {
  const text = verdict(report);
  const names = verdictNames(report);
  if (names.length === 0) return <p className="verdict">{text}</p>;
  const pattern = new RegExp(
    `(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  );
  return (
    <p className="verdict">
      {text.split(pattern).map((part, i) =>
        names.includes(part) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed sentence
          <strong key={i}>{part}</strong>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function TechRow({ detection }: { detection: Detection }) {
  const percent = Math.round(detection.confidence * 100);
  const clues = detection.evidence.length;
  return (
    <details>
      <summary className="tech-row">
        <span className="tech-name">
          <strong>{techName(detection.tech)}</strong>
          {detection.version ? <span className="version"> {detection.version}</span> : null}
          <span className="visually-hidden">
            {` ${techLabel(detection)}, ${detection.category}: ${clues} clues, ${percent}% confidence`}
          </span>
        </span>
        <span className="tech-category" aria-hidden="true">
          {category(detection.category)}
        </span>
        <span className="tech-clues" aria-hidden="true">
          {clues}
          <span className="clues-word"> {clues === 1 ? 'clue' : 'clues'}</span>
        </span>
        <span className="meter" aria-hidden="true">
          <span
            className={detection.confidence >= SURE ? 'fill' : 'fill low'}
            style={{ width: `${percent}%` }}
          />
        </span>
        <span className="pct" aria-hidden="true">
          {percent}%
        </span>
      </summary>
      <ul className="evidence">
        {detection.evidence.map((e) => (
          <li key={`${e.ruleId} ${e.detail}`}>
            <span className="evidence-layer">{e.layer}</span>
            <span>{e.detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Chip({ state, children }: { state: 'running' | 'partial'; children: string }) {
  return (
    <span className={`chip ${state}`}>
      <span className="chip-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

function category(id: string): string {
  const words = id.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
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
