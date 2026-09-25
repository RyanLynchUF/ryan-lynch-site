// Calendar-day handling for the site. Blog dates are calendar days (YAML
// `date: 2026-04-07` parses to UTC midnight). Newsletter dates are send
// instants. Both are normalised to "a calendar day stored at UTC midnight"
// and always formatted in UTC, so the build machine's timezone never shifts
// a displayed date.

/** Ryan's timezone; newsletter send times are converted to days here. */
export const SITE_TIME_ZONE = "America/New_York";

/**
 * The calendar day an instant falls on in `timeZone`, as a Date at UTC midnight.
 * @param {Date} instant
 * @param {string} [timeZone]
 * @returns {Date}
 * @throws {RangeError} if `instant` is not a valid Date
 */
export function toCalendarDay(instant, timeZone = SITE_TIME_ZONE) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new RangeError(`toCalendarDay needs a valid Date, got ${String(instant)}`);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    era: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  /** @param {Intl.DateTimeFormatPartTypes} type */
  const get = (type) => parts.find((p) => p.type === type)?.value;
  // Intl counts years before 1 AD as 1 BC, 2 BC, ...; Date uses 0, -1, ...
  const eraYear = Number(get("year"));
  const year = get("era") === "BC" ? 1 - eraYear : eraYear;
  // Not Date.UTC, which reads years 0 to 99 as 1900 to 1999.
  const day = new Date(0);
  day.setUTCFullYear(year, Number(get("month")) - 1, Number(get("day")));
  return day;
}

/** @typedef {"long" | "medium" | "short" | "month"} DayStyle */

/** @type {Record<DayStyle, Intl.DateTimeFormatOptions>} */
const DAY_FORMATS = {
  long: { year: "numeric", month: "long", day: "numeric" }, // April 7, 2026
  medium: { year: "numeric", month: "short", day: "numeric" }, // Apr 7, 2026
  short: { month: "short", day: "numeric" }, // Apr 7
  month: { year: "numeric", month: "long" }, // April 2026
};

/**
 * Display a calendar day. Always formatted in UTC.
 * @param {Date} day a calendar day at UTC midnight
 * @param {DayStyle} style
 * @returns {string}
 */
export function formatDay(day, style) {
  return day.toLocaleDateString("en-US", { ...DAY_FORMATS[style], timeZone: "UTC" });
}

/**
 * A calendar day as YYYY-MM-DD, for `<time datetime>`.
 * @param {Date} day
 * @returns {string}
 */
export function isoDay(day) {
  // Split rather than slice(0, 10): years outside 0 to 9999 have a sign and
  // six digits ("-000001-06-15T00:00:00.000Z").
  return day.toISOString().split("T")[0];
}
