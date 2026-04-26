/**
 * Parse a date string as LOCAL midnight — resilient to both "YYYY-MM-DD" and
 * full ISO timestamps "YYYY-MM-DDTHH:mm:ss.sssZ" (what node-postgres returns
 * for DATE columns in some versions).
 *
 * `new Date("YYYY-MM-DD")` is treated as UTC by the spec, which shifts the
 * displayed date backwards by one day in timezones east of UTC (BST, CET…).
 * This helper avoids that by constructing the Date using local-time components.
 */
export function parseLocalDate(iso: string): Date {
  // Take only the first 10 characters to handle ISO timestamps from pg
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(y, m - 1, d); // month is 0-indexed; no UTC shift
}

/**
 * Safely extract YYYY-MM-DD from any date string.
 * Returns empty string for null/undefined/invalid inputs.
 */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/**
 * Convert a UTC ISO timestamp to "YYYY-MM-DDTHH:mm" in local time —
 * the format expected by <input type="datetime-local">.
 * Returns empty string for null/undefined/empty inputs.
 */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Format a date string for display (e.g. "9 May 2026"). */
export function fmtDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
  locale = 'en-GB',
): string {
  return parseLocalDate(iso).toLocaleDateString(locale, opts);
}
