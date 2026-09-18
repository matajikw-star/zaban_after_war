/**
 * The top-level React error boundary (`what.md` §10.1).
 *
 * A class component because that is the only way React offers to catch a render error. It does
 * two things: report through `log/errors.ts`, and show a Persian screen with one way out. It
 * never shows the stack — the user cannot act on it and the record already carries it.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../../log/errors.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly crashed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void reportError('react', error, { componentStack: info.componentStack });
  }

  /**
   * A full reload rather than clearing the flag: the tree that threw is in an unknown state and
   * React gives no way to prove otherwise. Progress is in IndexedDB, so a reload costs nothing.
   */
  private readonly goHome = (): void => {
    globalThis.location.assign('/');
  };

  override render(): ReactNode {
    if (!this.state.crashed) return this.props.children;

    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-sm text-center">
          <h1 className="text-h5 font-medium">{strings.crash.title}</h1>
          <p className="mt-3 text-body-sm text-[var(--fg-muted)]">{strings.crash.body}</p>
          <Button variant="primary" block className="mt-6" onClick={this.goHome}>
            {strings.crash.goHome}
          </Button>
        </Card>
      </main>
    );
  }
}
