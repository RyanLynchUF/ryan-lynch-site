import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE_TIME_ZONE, formatDay, isoDay, toCalendarDay } from "../src/lib/dates.mjs";

/** The calendar day `instant` falls on in `timeZone`, as YYYY-MM-DD. */
const dayOf = (instant, timeZone) => isoDay(toCalendarDay(new Date(instant), timeZone));

test("the site timezone is America/New_York", () => {
  assert.equal(SITE_TIME_ZONE, "America/New_York");
});

test("toCalendarDay returns a Date at UTC midnight", () => {
  const day = toCalendarDay(new Date("2026-08-19T00:04:58Z"));
  assert.equal(day.toISOString(), "2026-08-18T00:00:00.000Z");
});

test("toCalendarDay: an evening send in New York stays on the New York day", () => {
  // "Your Turn, Robot - August 18, 2026" was sent at 8:04 pm EDT on Aug 18.
  assert.equal(dayOf("2026-08-19T00:04:58Z"), "2026-08-18");
  assert.equal(dayOf("2026-08-12T14:19:54Z"), "2026-08-12");
});

test("toCalendarDay: spring-forward day (2026-03-08, EST to EDT at 07:00Z)", () => {
  assert.equal(dayOf("2026-03-08T04:59:59Z"), "2026-03-07"); // 23:59:59 EST
  assert.equal(dayOf("2026-03-08T05:00:00Z"), "2026-03-08"); // 00:00 EST
  assert.equal(dayOf("2026-03-08T07:30:00Z"), "2026-03-08"); // 03:30 EDT, after the switch
  // The next midnight is at 04:00Z now that the offset is -4.
  assert.equal(dayOf("2026-03-09T03:59:59Z"), "2026-03-08"); // 23:59:59 EDT
  assert.equal(dayOf("2026-03-09T04:00:00Z"), "2026-03-09"); // 00:00 EDT
});

test("toCalendarDay: fall-back day (2026-11-01, EDT to EST at 06:00Z)", () => {
  assert.equal(dayOf("2026-11-01T03:59:59Z"), "2026-10-31"); // 23:59:59 EDT
  assert.equal(dayOf("2026-11-01T04:00:00Z"), "2026-11-01"); // 00:00 EDT
  assert.equal(dayOf("2026-11-01T05:30:00Z"), "2026-11-01"); // 01:30 EDT, first pass
  assert.equal(dayOf("2026-11-01T06:30:00Z"), "2026-11-01"); // 01:30 EST, after fall-back
  // The next midnight is at 05:00Z now that the offset is -5.
  assert.equal(dayOf("2026-11-02T04:59:59Z"), "2026-11-01"); // 23:59:59 EST
  assert.equal(dayOf("2026-11-02T05:00:00Z"), "2026-11-02"); // 00:00 EST
});

test("toCalendarDay: winter midnight boundary", () => {
  assert.equal(dayOf("2026-12-01T04:59:59Z"), "2026-11-30"); // 23:59:59 EST
  assert.equal(dayOf("2026-12-01T05:00:00Z"), "2026-12-01"); // 00:00 EST
});

test("toCalendarDay with UTC keeps a YAML calendar day on its own day", () => {
  assert.equal(dayOf("2026-04-07T00:00:00Z", "UTC"), "2026-04-07");
  assert.equal(
    toCalendarDay(new Date("2026-04-07T00:00:00Z"), "UTC").toISOString(),
    "2026-04-07T00:00:00.000Z"
  );
});

test("toCalendarDay keeps years 0 to 99 in the first century, not the 1900s", () => {
  const day = toCalendarDay(new Date("0050-06-15T12:00:00Z"), "UTC");
  assert.equal(day.getUTCFullYear(), 50);
  assert.equal(day.toISOString(), "0050-06-15T00:00:00.000Z");
  // New York used local mean time (UTC-4:56:02) before 1883.
  assert.equal(dayOf("0050-06-15T03:00:00Z"), "0050-06-14");
});

test("toCalendarDay handles years before 1 AD", () => {
  const instant = new Date(0);
  instant.setUTCFullYear(-1, 5, 15); // 2 BC in the proleptic Gregorian calendar
  instant.setUTCHours(12);
  const day = toCalendarDay(instant, "UTC");
  assert.equal(day.getUTCFullYear(), -1);
  assert.equal(day.toISOString(), "-000001-06-15T00:00:00.000Z");
});

test("toCalendarDay throws a RangeError for an invalid instant", () => {
  assert.throws(() => toCalendarDay(new Date("nope")), RangeError);
  assert.throws(() => toCalendarDay(/** @type {any} */ ("2026-04-07")), RangeError);
});

test("formatDay renders each style", () => {
  const day = new Date("2026-04-07T00:00:00Z");
  assert.equal(formatDay(day, "long"), "April 7, 2026");
  assert.equal(formatDay(day, "medium"), "Apr 7, 2026");
  assert.equal(formatDay(day, "short"), "Apr 7");
  assert.equal(formatDay(day, "month"), "April 2026");
});

test("formatDay does not depend on the process timezone", () => {
  const day = new Date("2026-04-07T00:00:00Z");
  const monthStart = new Date("2026-04-01T00:00:00Z");
  const previousTz = process.env.TZ;
  try {
    // Negative offsets only: west of UTC, a UTC-midnight day falls on the
    // previous local day, which is the regression this guards against.
    for (const tz of ["America/Los_Angeles", "Pacific/Honolulu"]) {
      process.env.TZ = tz;
      // Prove the zone actually switched, so the assertions below mean something.
      assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, tz);
      assert.equal(day.toLocaleDateString("en-US"), "4/6/2026", `${tz}: unformatted is a day early`);

      assert.equal(formatDay(day, "long"), "April 7, 2026", tz);
      assert.equal(formatDay(day, "medium"), "Apr 7, 2026", tz);
      assert.equal(formatDay(day, "short"), "Apr 7", tz);
      assert.equal(formatDay(monthStart, "month"), "April 2026", tz);
    }
  } finally {
    if (previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  }
});

test("isoDay formats a calendar day as YYYY-MM-DD", () => {
  assert.equal(isoDay(new Date("2026-04-07T00:00:00Z")), "2026-04-07");
  assert.equal(isoDay(new Date("0050-06-15T00:00:00Z")), "0050-06-15");
});

test("isoDay keeps the whole date for years outside 0 to 9999", () => {
  const bc = new Date(0);
  bc.setUTCFullYear(-1, 5, 15);
  assert.equal(isoDay(bc), "-000001-06-15");
});
