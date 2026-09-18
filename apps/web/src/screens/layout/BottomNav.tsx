/**
 * The glass bottom bar for the four top-level screens (`what.md` §7.8, §7.9).
 *
 * A new component rather than a change to `screens/layout/Layout.tsx`: `/review`, `/word/:id`,
 * `/session/summary` and the onboarding/paywall/login/checkout flow do not show it, so it is not
 * a property of the root layout — it is rendered by the four screens that want it
 * (`Home`, `Boxes`, `Progress`, `Settings`), each of which owns its own bottom padding for it.
 */

import { BarChart3, Home as HomeIcon, LayoutGrid, Settings as SettingsIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router';
import { strings } from '../../strings.ts';
import { cn } from '../../ui/cn.ts';

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly Icon: ComponentType<{ size?: number; className?: string }>;
}

const ITEMS: readonly NavItem[] = [
  { to: '/', label: strings.home.nav.home, Icon: HomeIcon },
  { to: '/boxes', label: strings.home.nav.boxes, Icon: LayoutGrid },
  { to: '/progress', label: strings.home.nav.progress, Icon: BarChart3 },
  { to: '/settings', label: strings.home.nav.settings, Icon: SettingsIcon },
];

export function BottomNav() {
  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[430px] items-stretch justify-around',
        'border-t border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]',
        'px-2 pb-[env(safe-area-inset-bottom,0px)]',
      )}
    >
      {ITEMS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-caption',
              isActive ? 'text-[var(--fg)] font-medium' : 'text-[var(--fg-muted)]',
            )
          }
        >
          <Icon size={22} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** The bottom padding every screen using `BottomNav` needs so content clears the fixed bar. */
export const BOTTOM_NAV_SPACER_CLASS = 'pb-20';
