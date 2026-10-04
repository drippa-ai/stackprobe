'use client';

import { useActionState } from 'react';
import { type ScanFormState, scanAction } from './actions.ts';

export function ScanForm({ defaultValue = '' }: { defaultValue?: string }) {
  const [state, action, pending] = useActionState<ScanFormState, FormData>(scanAction, {
    error: null,
  });
  return (
    <form action={action} className="scan">
      <input
        name="url"
        defaultValue={defaultValue}
        placeholder="example.com"
        aria-label="Domain or URL"
        autoComplete="off"
        required
      />
      <button type="submit" disabled={pending}>
        {pending ? 'Starting…' : 'Scan'}
      </button>
      {state.error ? (
        <p role="alert" className="warn">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
