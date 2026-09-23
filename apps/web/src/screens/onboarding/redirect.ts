/**
 * The guard of `what.md` §7.8: "A returning user (profile exists) never sees onboarding."
 *
 * Owned by Home, not by a route loader — `useSettingsStore` is only populated once `main.tsx`'s
 * bootstrap has resolved `load()`, which happens before the router ever mounts a screen, so by
 * the time Home renders `hasProfile` is already settled and this fires at most once.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useSettingsStore } from '../../stores/settings.ts';

export function useOnboardingRedirect(): void {
  const hasProfile = useSettingsStore((state) => state.hasProfile);
  const navigate = useNavigate();

  useEffect(() => {
    if (hasProfile) return;
    navigate('/onboarding', { replace: true });
  }, [hasProfile, navigate]);
}
