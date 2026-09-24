/**
 * Any path the route table does not know (`what.md` §7.8). The service worker answers every
 * navigation with `index.html`, so a mistyped or stale link lands here rather than on a browser
 * error page — and the one thing to offer is the way home.
 */

import { Link } from 'react-router';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';

export function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-h5 font-medium">{strings.screens.notFound}</h1>
      <p className="text-body-sm text-[var(--fg-muted)]">{strings.notFound.body}</p>
      <Button asChild variant="primary" className="mt-3">
        <Link to="/">{strings.notFound.home}</Link>
      </Button>
    </main>
  );
}
