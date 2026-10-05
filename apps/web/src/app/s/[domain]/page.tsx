import type { Metadata } from 'next';
import { getStore } from '../../../lib/services.ts';
import { ScanForm } from '../../scan-form.tsx';
import { SiteHeader } from '../../site-chrome.tsx';
import { NotScanned, ReportView, Running } from './report-sections.tsx';

interface Props {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ surface?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  return { title: `${decodeURIComponent(domain)} · stackprobe` };
}

export default async function ScanPage({ params, searchParams }: Props) {
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const { surface } = await searchParams;
  const scan = await getStore().latestScan(domain);

  return (
    <>
      <SiteHeader>
        <ScanForm variant="compact" />
      </SiteHeader>
      <main className="page report">
        {!scan ? (
          <NotScanned domain={domain} />
        ) : scan.report ? (
          <ReportView scan={scan} report={scan.report} selected={surface} />
        ) : (
          <Running scan={scan} />
        )}
      </main>
    </>
  );
}
