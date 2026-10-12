'use client';

import { useActionState } from 'react';
import { type ScanFormState, scanAction } from '../../actions.ts';

// "Scan again" on a report: a forced scan of the stored URL. When the daily limit is reached,
// says so here instead of failing the page.
export function ScanAgain({ url }: { url: string }) {
  const [state, action, pending] = useActionState<ScanFormState, FormData>(scanAction, {
    error: null,
  });
  return (
    <>
      <form action={action}>
        <input type="hidden" name="url" value={url} />
        <input type="hidden" name="force" value="1" />
        <button type="submit" className="button" disabled={pending}>
          {pending ? 'Starting…' : 'Scan again'}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="form-error actions-error">
          {state.error}
        </p>
      ) : null}
    </>
  );
}
