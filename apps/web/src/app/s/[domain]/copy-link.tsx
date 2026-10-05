'use client';

import { useState } from 'react';

export function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link-button"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href.split('?')[0] ?? '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
