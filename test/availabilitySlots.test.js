import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";

import { __testables } from "../src/utils/availabilitySlots.js";

const {
  buildGroupedSlotsForAvailability,
  buildUtcDateTimeFromStoredClock,
  combineAvailabilityRecords,
  getAvailabilityForLocalDate,
  getHostIterationRange,
  getMinimumNoticeDiff,
  getRequestedViewerMonthRange,
  mergeGroupedSlots,
} = __testables;

const makeStoredClock = ({ dateISO, zone, hour, minute }) => {
  const [year, month, day] = dateISO.split("-").map(Number);

  return DateTime.fromObject(
    {
      year,
      month,
      day,
      hour,
      minute,
      second: 0,
      millisecond: 0,
    },
    { zone },
  )
    .toUTC()
    .toFormat("HH:mm");
};

const buildAvailability = ({ timezone, dateOverrides = [], availability }) => ({
  timezone,
  availability: availability ?? [[], [], [], [], [], [], []],
  dateOverrides,
});

test("buildUtcDateTimeFromStoredClock resolves fixed-offset midnight into the previous UTC day", () => {
  const localDate = DateTime.fromISO("2030-04-05", { zone: "UTC+3" });
  const slotStart = buildUtcDateTimeFromStoredClock({
    localDate,
    storedClock: "21:00",
  });

  assert.equal(slotStart.toISO(), "2030-04-04T21:00:00.000Z");
  assert.equal(
    slotStart.setZone("UTC+3").toISO(),
    "2030-04-05T00:00:00.000+03:00",
  );
});

test("buildUtcDateTimeFromStoredClock resolves both sides of a spring-forward DST day", () => {
  const localDate = DateTime.fromISO("2030-03-31", { zone: "Europe/London" });
  const beforeShiftClock = makeStoredClock({
    dateISO: "2030-03-31",
    zone: "Europe/London",
    hour: 0,
    minute: 30,
  });
  const afterShiftClock = makeStoredClock({
    dateISO: "2030-03-31",
    zone: "Europe/London",
    hour: 3,
    minute: 30,
  });

  const beforeShift = buildUtcDateTimeFromStoredClock({
    localDate,
    storedClock: beforeShiftClock,
  });
  const afterShift = buildUtcDateTimeFromStoredClock({
    localDate,
    storedClock: afterShiftClock,
  });

  assert.equal(beforeShift.toISO(), "2030-03-31T00:30:00.000Z");
  assert.equal(
    beforeShift.setZone("Europe/London").toFormat("yyyy-MM-dd HH:mm"),
    "2030-03-31 00:30",
  );
  assert.equal(afterShift.toISO(), "2030-03-31T02:30:00.000Z");
  assert.equal(
    afterShift.setZone("Europe/London").toFormat("yyyy-MM-dd HH:mm"),
    "2030-03-31 03:30",
  );
});

test("buildUtcDateTimeFromStoredClock resolves a fall-back DST slot that maps to the previous UTC day", () => {
  const localDate = DateTime.fromISO("2030-10-27", { zone: "Europe/London" });
  const storedClock = makeStoredClock({
    dateISO: "2030-10-27",
    zone: "Europe/London",
    hour: 0,
    minute: 30,
  });

  const slotStart = buildUtcDateTimeFromStoredClock({
    localDate,
    storedClock,
  });

  assert.equal(storedClock, "23:30");
  assert.equal(slotStart.toISO(), "2030-10-26T23:30:00.000Z");
  assert.equal(
    slotStart.setZone("Europe/London").toFormat("yyyy-MM-dd HH:mm"),
    "2030-10-27 00:30",
  );
});

test("buildGroupedSlotsForAvailability groups a host midnight slot under the previous viewer day", () => {
  const availability = buildAvailability({
    timezone: "UTC+3",
    dateOverrides: [
      {
        date: "2030-04-05",
        availability: [{ start: "21:00", end: "22:00" }],
      },
    ],
  });

  const groupedSlots = buildGroupedSlotsForAvailability({
    availability,
    bookings: [],
    bufferTimeAfter: 0,
    bufferTimeBefore: 0,
    minimumNotice: 0,
    minimumNoticeType: "minutes",
    effectiveIncrement: 60,
    viewerTimezone: "UTC",
    year: 2030,
    month: 3,
    fallbackUserId: "host-1",
  });

  assert.deepEqual(Object.keys(groupedSlots), ["4"]);
  assert.equal(groupedSlots["4"][0].utcTime, "2030-04-04T21:00:00.000Z");
  assert.equal(groupedSlots["4"][0].originalDate, "2030-04-05");
});

test("buildGroupedSlotsForAvailability includes host spillover days at the viewer month boundary", () => {
  const availability = buildAvailability({
    timezone: "UTC+3",
    dateOverrides: [
      {
        date: "2030-05-01",
        availability: [{ start: "21:00", end: "22:00" }],
      },
    ],
  });

  const groupedSlots = buildGroupedSlotsForAvailability({
    availability,
    bookings: [],
    bufferTimeAfter: 0,
    bufferTimeBefore: 0,
    minimumNotice: 0,
    minimumNoticeType: "minutes",
    effectiveIncrement: 60,
    viewerTimezone: "UTC",
    year: 2030,
    month: 3,
    fallbackUserId: "host-1",
  });

  assert.ok(groupedSlots["30"]);
  assert.equal(groupedSlots["30"][0].utcTime, "2030-04-30T21:00:00.000Z");
  assert.equal(groupedSlots["30"][0].originalDate, "2030-05-01");
});

test("buildGroupedSlotsForAvailability removes slots that overlap bookings with buffers", () => {
  const availability = buildAvailability({
    timezone: "UTC",
    dateOverrides: [
      {
        date: "2030-04-10",
        availability: [{ start: "09:00", end: "11:00" }],
      },
    ],
  });

  const groupedSlots = buildGroupedSlotsForAvailability({
    availability,
    bookings: [
      {
        startTime: "2030-04-10T09:30:00.000Z",
        endTime: "2030-04-10T10:00:00.000Z",
      },
    ],
    bufferTimeAfter: 15,
    bufferTimeBefore: 15,
    minimumNotice: 0,
    minimumNoticeType: "minutes",
    effectiveIncrement: 30,
    viewerTimezone: "UTC",
    year: 2030,
    month: 3,
    fallbackUserId: "host-1",
  });

  assert.deepEqual(
    groupedSlots["10"].map((slot) => slot.utcTime),
    ["2030-04-10T10:30:00.000Z"],
  );
});

test("date overrides take precedence over weekly availability", () => {
  const localDate = DateTime.fromISO("2030-04-05", { zone: "UTC" });
  const weeklyAvailability = [
    [],
    [],
    [],
    [],
    [],
    [{ start: "09:00", end: "17:00" }],
    [],
  ];
  const dateOverrides = [
    {
      date: "2030-04-05",
      availability: [{ start: "13:00", end: "14:00" }],
    },
  ];

  assert.deepEqual(
    getAvailabilityForLocalDate({
      localDate,
      weeklyAvailability,
      dateOverrides,
    }),
    [{ start: "13:00", end: "14:00" }],
  );
});

test("getRequestedViewerMonthRange and getHostIterationRange keep spillover coverage around month edges", () => {
  const viewerMonthRange = getRequestedViewerMonthRange({
    year: 2030,
    month: 3,
    viewerTimezone: "UTC",
  });
  const hostRange = getHostIterationRange({
    viewerMonthStart: viewerMonthRange.start,
    viewerMonthEnd: viewerMonthRange.end,
    hostTimezone: "UTC+3",
  });

  assert.equal(viewerMonthRange.start.toISO(), "2030-04-01T00:00:00.000Z");
  assert.equal(viewerMonthRange.end.toISO(), "2030-05-01T00:00:00.000Z");
  assert.equal(hostRange.start.toUTC().toISO(), "2030-03-30T21:00:00.000Z");
  assert.equal(hostRange.end.toUTC().toISO(), "2030-05-01T21:00:00.000Z");
});

test("mergeGroupedSlots deduplicates identical instants and preserves all users", () => {
  const merged = mergeGroupedSlots(
    {
      5: [
        {
          utcTime: "2030-04-05T09:00:00.000Z",
          user: "alpha",
          formattedTime: "09:00:00",
          originalDate: "2030-04-05",
        },
      ],
    },
    {
      5: [
        {
          utcTime: "2030-04-05T09:00:00.000Z",
          user: "beta",
          formattedTime: "09:00:00",
          originalDate: "2030-04-05",
        },
      ],
    },
  );

  assert.deepEqual(merged["5"][0].users.sort(), ["alpha", "beta"]);
});

test("combineAvailabilityRecords keeps user ownership on weekly and override slots", () => {
  const combined = combineAvailabilityRecords([
    {
      user: "alpha",
      availability: [
        [],
        [],
        [],
        [],
        [],
        [{ start: "09:00", end: "10:00" }],
        [],
      ],
      dateOverrides: [
        {
          date: "2030-04-05",
          availability: [{ start: "11:00", end: "12:00" }],
        },
      ],
    },
    {
      user: "beta",
      availability: [
        [],
        [],
        [],
        [],
        [],
        [{ start: "13:00", end: "14:00" }],
        [],
      ],
      dateOverrides: [],
    },
  ]);

  assert.equal(combined.availability[5][0].user, "alpha");
  assert.equal(combined.availability[5][1].user, "beta");
  assert.equal(combined.dateOverrides[0].availability[0].user, "alpha");
});

test("getMinimumNoticeDiff floors each requested unit", () => {
  const now = DateTime.fromISO("2030-04-01T00:00:00.000Z", { zone: "utc" });
  const slotStart = now.plus({ hours: 26, minutes: 45 });

  assert.equal(
    getMinimumNoticeDiff({ slotStart, now, minimumNoticeType: "minutes" }),
    1605,
  );
  assert.equal(
    getMinimumNoticeDiff({ slotStart, now, minimumNoticeType: "hours" }),
    26,
  );
  assert.equal(
    getMinimumNoticeDiff({ slotStart, now, minimumNoticeType: "days" }),
    1,
  );
});
