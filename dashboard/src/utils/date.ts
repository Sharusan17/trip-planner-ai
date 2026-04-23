/**
 * Parse a YYYY-MM-DD string as LOCAL midnight.
 *
 * `new Date("YYYY-MM-DD")` is treated as UTC by the spec, which shifts the
 * displayed date backwards by one day in timezones east of UTC (BST, CET…).
 * This helper avoids that by constructing the Date using local-time components.
 */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d); // month is 0-indexed; no UTC shift
}

/** Format a YYYY-MM-DD string for display (e.g. "9 May 2026"). */
export function fmtDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
  locale = 'en-GB',
): string {
  return parseLocalDate(iso).toLocaleDateString(locale, opts);
}
