/**
 * Persian digits, everywhere, through `Intl` (`what.md` §7.9).
 *
 * Never a font feature and never a hand-rolled digit map: `Intl.NumberFormat('fa-IR')` is what
 * the platform already ships, and it gets the grouping separator right too (۱٬۲۳۴, not ۱,۲۳۴).
 */

const numberFormat = new Intl.NumberFormat('fa-IR');

/** `1234` → `۱٬۲۳۴`. Non-finite input prints as `—`, which is what a missing number should read as. */
export function faNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return numberFormat.format(value);
}

const yearFormat = new Intl.NumberFormat('fa-IR', { useGrouping: false });

/**
 * `1402` → `۱۴۰۲`. A year is a label, not a quantity: `faNumber` would group it as `۱٬۴۰۲`,
 * which no Iranian reader would recognise as a Jalali year.
 */
export function faYear(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return yearFormat.format(value);
}

const percentFormat = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });

/** `63` → `۶۳٪`. The argument is already 0..100, as `progress().percent` returns it. */
export function faPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${percentFormat.format(Math.round(value))}٪`;
}
