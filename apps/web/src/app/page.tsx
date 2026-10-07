import { ScanForm } from './scan-form.tsx';
import { SiteHeader } from './site-chrome.tsx';

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="page home">
        <section className="home-hero">
          <h1>What's it built on?</h1>
          <p>
            The product, not the landing page. Each finding comes with the headers, requests and
            code that show it.
          </p>
          <ScanForm />
        </section>
      </main>
    </>
  );
}
