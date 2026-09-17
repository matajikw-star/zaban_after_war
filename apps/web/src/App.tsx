import { strings } from './strings.ts';
import { APP_VERSION, BUILD_SHA } from './version.ts';

/** Deliberately blank but for the name and the build: the scaffold proves wiring, not design. */
export function App() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-h4 font-medium">{strings.appName}</h1>
      <p className="text-caption text-fg-muted" dir="ltr">
        v{APP_VERSION} · {BUILD_SHA}
      </p>
    </main>
  );
}
