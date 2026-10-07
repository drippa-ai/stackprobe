import { ProbeField } from './effects/probe-field.tsx';
import { ScanForm } from './scan-form.tsx';
import { SiteHeader } from './site-chrome.tsx';

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="home">
        <section className="home-hero">
          <ProbeField />
          <div className="page home-copy">
            <h1>What's it built on?</h1>
            <p>
              The product, not the landing page. Each finding comes with the headers, requests and
              code that show it.
            </p>
            <ScanForm />
          </div>
        </section>
      </main>
    </>
  );
}
