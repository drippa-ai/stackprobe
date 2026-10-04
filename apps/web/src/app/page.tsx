import { ScanForm } from './scan-form.tsx';

export default function Home() {
  return (
    <>
      <h1>What is it built on?</h1>
      <p className="muted">
        Type a domain or URL. stackprobe shows the technologies it finds, with the evidence and a
        confidence score for each.
      </p>
      <ScanForm />
    </>
  );
}
