import type { Metadata } from 'next';
import { getStore } from '../../../lib/services.ts';
import { SiteHeader } from '../../site-chrome.tsx';
import { NotScanned, ReportView, Running } from './report-sections.tsx';

interface Props {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ surface?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = decodeURIComponent((await params).domain).toLowerCase();
  return {
    title: `${name} · stackprobe`,
    // Agents can find the report as data from the page itself.
    alternates: { types: { 'application/json': `/s/${encodeURIComponent(name)}.json` } },
  };
}

export default async function ScanPage({ params, searchParams }: Props) {
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const { surface } = await searchParams;
  const store = getStore();
  const scan = await store.latestScan(domain);
  const runs = scan && !scan.report ? await store.listLayerRuns(scan.id) : [];

  return (
    <>
      <SiteHeader />
      <main className="page report">
        {!scan ? (
          <NotScanned domain={domain} />
        ) : scan.report ? (
          <ReportView scan={scan} report={scan.report} selected={surface} />
        ) : (
          <Running scan={scan} runs={runs} />
        )}
      </main>
    </>
  );
}
