'use client';

import { useActionState, useId } from 'react';
import { type ScanFormState, scanAction } from './actions.ts';

// The big form on the home page ("hero") or the small one in a report's header ("compact").
export function ScanForm({
  defaultValue = '',
  variant = 'hero',
}: {
  defaultValue?: string;
  variant?: 'hero' | 'compact';
}) {
  const [state, action, pending] = useActionState<ScanFormState, FormData>(scanAction, {
    error: null,
  });
  const id = useId();
  return (
    <form action={action} className={`scan-form ${variant}`}>
      <div className="scan-row">
        <label htmlFor={id} className="visually-hidden">
          Domain or URL
        </label>
        <input
          id={id}
          name="url"
          defaultValue={defaultValue}
          placeholder={variant === 'hero' ? 'example.com' : 'Scan a domain'}
          autoComplete="off"
          required
        />
        <button type="submit" disabled={pending}>
          {pending ? 'Starting…' : 'Scan'}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="warn" style={{ margin: 0 }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
