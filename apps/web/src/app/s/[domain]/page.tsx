import {
  type Detection,
  type Report,
  type ScanRecord,
  type Surface,
  surfacesByRole,
} from '@drippa/stackprobe-core';
import type { Metadata } from 'next';
import { getStore } from '../../../lib/services.ts';
import { rescanAction } from '../../actions.ts';
import { ScanForm } from '../../scan-form.tsx';
import { AutoRefresh } from './auto-refresh.tsx';

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  return { title: `${decodeURIComponent(domain)} · stackprobe` };
}

export default async function ScanPage({ params }: Props) {
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const scan = await getStore().latestScan(domain);

  if (!scan) {
    return (
      <>
        <h1>{domain}</h1>
        <p className="muted">Not scanned yet.</p>
        <ScanForm defaultValue={domain} />
      </>
    );
  }

  return (
    <>
      <h1>{scan.domain}</h1>
      <ScanStatusLine scan={scan} />
      {scan.status === 'running' ? <AutoRefresh /> : null}
      {scan.report ? <ReportView report={scan.report} /> : null}
    </>
  );
}

function ScanStatusLine({ scan }: { scan: ScanRecord }) {
  if (scan.status === 'running') {
    return <p className="muted">Scanning {scan.url} …</p>;
  }
  return (
    <>
      <p className="muted">
        Scanned {scan.url} on {formatDate(scan.finishedAt ?? scan.createdAt)}.
        {scan.status === 'partial' ? (
          <span className="warn"> Some checks failed, so this result may be incomplete.</span>
        ) : null}
      </p>
      <form action={rescanAction} className="scan">
        <input type="hidden" name="url" value={scan.url} />
        <button type="submit">Scan again</button>
      </form>
    </>
  );
}

// Product first: marketing findings never stand in for the product's stack.
function ReportView({ report }: { report: Report }) {
  const { product, marketing, other } = surfacesByRole(report);
  return (
    <>
      <section>
        <h2>Product</h2>
        {product.length > 0 ? null : marketing.length > 0 ? (
          <p className="warn">No product app found; showing the marketing site only.</p>
        ) : (
          <p className="warn">
            Couldn't tell which of these is the product app, so nothing is shown as the product.
          </p>
        )}
      </section>
      {[...product, ...marketing, ...other].map((surface) => (
        <SurfaceView key={surface.id} surface={surface} />
      ))}
      <section>
        <h2>Checks run</h2>
        <ul>
          {report.layersRun.map((run) => (
            <li key={`${run.surfaceId} ${run.layer}`}>
              {run.layer.toUpperCase()}: {run.status}
              {run.error ? <span className="muted"> ({run.error.message})</span> : null}
            </li>
          ))}
        </ul>
        <p className="muted">Fingerprints version {report.fingerprintsVersion}.</p>
      </section>
    </>
  );
}

const SURFACE_LABELS: Record<Surface['kind'], string> = {
  unclassified: 'Not sure what this is',
  marketing: 'Marketing site',
  app: 'Product app',
  api: 'API',
  docs: 'Docs',
  status: 'Status page',
  auth: 'Sign-in',
  other: 'Other',
};

const FOUND_BY = (foundBy: NonNullable<Surface['foundBy']>) =>
  foundBy.kind === 'subdomain'
    ? 'Found as a subdomain.'
    : foundBy.text
      ? `Found via the “${foundBy.text}” link.`
      : 'Found via a link.';

function SurfaceView({ surface }: { surface: Surface }) {
  return (
    <section>
      <h2>
        <code>{surface.url}</code>
      </h2>
      <p className="muted">
        <strong>{SURFACE_LABELS[surface.kind]}</strong>
        {surface.kindConfidence !== null ? ` (${Math.round(surface.kindConfidence * 100)}%)` : ''}
        {surface.kindReasons?.length ? `: ${surface.kindReasons.join(', ')}.` : '.'}
        {surface.foundBy ? ` ${FOUND_BY(surface.foundBy)}` : ''}
      </p>
      {surface.detections.length === 0 ? (
        <p>Nothing detected here yet.</p>
      ) : (
        <ul className="detections">
          {surface.detections.map((detection) => (
            <DetectionView key={detection.tech} detection={detection} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DetectionView({ detection }: { detection: Detection }) {
  return (
    <li>
      <div className="detection-head">
        <strong>
          {detection.tech}
          {detection.version ? ` ${detection.version}` : ''}
        </strong>
        <span title="Confidence">{Math.round(detection.confidence * 100)}%</span>
      </div>
      <div className="muted">{detection.category}</div>
      <details>
        <summary>Evidence ({detection.evidence.length})</summary>
        <ul>
          {detection.evidence.map((evidence) => (
            <li key={`${evidence.ruleId} ${evidence.detail}`}>
              <code>{evidence.detail}</code>{' '}
              <span className="muted">
                {evidence.type} by {evidence.layer.toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toUTCString();
}
