/**
 * The root layout every route renders inside (`what.md` §7.8).
 *
 * Three jobs and no more: apply the theme attribute, hold the error boundary, and record a `nav`
 * breadcrumb on every route change so an error record shows how the user arrived.
 */

import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { breadcrumb } from '../../log/breadcrumbs.ts';
import { useSettingsStore } from '../../stores/settings.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';

/**
 * `system` deletes the attribute rather than writing a value, so `prefers-color-scheme` in
 * `tokens.css` is what decides. A written `light` or `dark` is the manual override and wins in
 * both directions (§7.9).
 */
function useThemeAttribute(): void {
  const theme = useSettingsStore((state) => state.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }
  }, [theme]);
}

function useNavBreadcrumb(): void {
  const location = useLocation();
  useEffect(() => {
    breadcrumb('nav', location.pathname);
  }, [location.pathname]);
}

export function Layout() {
  useThemeAttribute();
  useNavBreadcrumb();

  return (
    <ErrorBoundary>
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <Outlet />
      </div>
    </ErrorBoundary>
  );
}
