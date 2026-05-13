import { DateTime } from "luxon";
import { db } from "./utils.js";

const EMPTY_WEEK = [[], [], [], [], [], [], []];

const isNotFoundError = (error) => {
  return (
    error?.status === 404 ||
    error?.response?.status === 404 ||
    String(error?.message || "")
      .toLowerCase()
      .includes("requested resource wasn't found")
  );
};

const getOneOrNull = async (collectionName, id) => {
  try {
    return await db.collection(collectionName).getOne(id);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
};

/**
 *
 * @param {string} eventTypeId
 * @param {string | null} userId
 * @param {boolean | null} roundRobin
 * @returns {Promise<{eventSetting: {settings:object}, user: object} | null>}
 */
const getUserEventSetting = async (
  eventTypeId,
  userId = null,
  roundRobin = false,
) => {
  try {
    const response = await db.send("/member/event_type_setting", {
      method: "POST",
      body: {
        eventTypeId,
        userId,
        roundRobin,
      },
    });

    return response;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
};

const safeParseJSON = (value, fallback) => {
  if (value == null) return fallback;
  if (Array.isArray(value) || typeof value === "object") return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
};

const normalizeAvailabilityRecord = (record) => ({
  ...record,
  availability: safeParseJSON(record?.availability, EMPTY_WEEK),
  dateOverrides: safeParseJSON(record?.dateOverrides, []),
});

const normalizeEventTypeSettingRecord = (record) => ({
  ...record,
  settings: safeParseJSON(record?.settings, {}),
});

const parseDateTimeUtc = (value) => {
  if (DateTime.isDateTime(value)) {
    return value.toUTC();
  }

  if (typeof value !== "string") {
    return DateTime.invalid("Invalid booking datetime value");
  }

  const trimmed = value.trim();
  const isoCandidate = trimmed.includes(" ")
    ? trimmed.replace(/\s+/, "T")
    : trimmed;

  let parsed = DateTime.fromISO(isoCandidate, { setZone: true });

  if (!parsed.isValid) {
    parsed = DateTime.fromSQL(trimmed, { setZone: true });
  }

  if (!parsed.isValid && isoCandidate !== trimmed) {
    parsed = DateTime.fromSQL(isoCandidate, { setZone: true });
  }

  return parsed.isValid ? parsed.toUTC() : parsed;
};

const normalizeBookingRecord = (record) => ({
  ...record,
  start: parseDateTimeUtc(record.startTime),
  end: parseDateTimeUtc(record.endTime),
});

const parseClockToMinutes = (clock) => {
  const [hours, minutes] = String(clock).split(":").map(Number);
  return hours * 60 + minutes;
};

const getAvailabilityWeekday = (localDate) => localDate.weekday % 7;

const getAvailabilityForLocalDate = ({
  localDate,
  weeklyAvailability,
  dateOverrides,
}) => {
  const localDateISO = localDate.toISODate();
  const override = dateOverrides.find((entry) => entry.date === localDateISO);

  if (override) {
    return Array.isArray(override.availability) ? override.availability : [];
  }

  return weeklyAvailability[getAvailabilityWeekday(localDate)] ?? [];
};

const resolveStoredUtcDateTime = ({ localDate, storedClock }) => {
  const [hour, minute] = String(storedClock).split(":").map(Number);
  const localDateISO = localDate.toISODate();
  const baseUtc = DateTime.fromObject(
    {
      year: localDate.year,
      month: localDate.month,
      day: localDate.day,
      hour,
      minute,
      second: 0,
      millisecond: 0,
    },
    { zone: "utc" },
  );

  const matchingCandidate = [-1, 0, 1]
    .map((dayOffset) => baseUtc.plus({ days: dayOffset }))
    .find(
      (candidate) =>
        candidate.setZone(localDate.zoneName).toISODate() === localDateISO,
    );

  return matchingCandidate ?? baseUtc;
};

const decodeStoredUtcClockToLocalMinutes = ({ storedClock, localDate }) => {
  const localDateTime = resolveStoredUtcDateTime({
    localDate,
    storedClock,
  }).setZone(localDate.zoneName);

  return Math.floor(
    localDateTime.diff(localDate.startOf("day"), "minutes").minutes,
  );
};

const buildUtcDateTimeFromStoredClock = ({ localDate, storedClock }) => {
  return resolveStoredUtcDateTime({
    localDate,
    storedClock,
  });
};

const getMinimumNoticeDiff = ({ slotStart, now, minimumNoticeType }) => {
  switch (minimumNoticeType) {
    case "minutes":
      return Math.floor(slotStart.diff(now, "minutes").minutes);
    case "hours":
      return Math.floor(slotStart.diff(now, "hours").hours);
    case "days":
      return Math.floor(slotStart.diff(now, "days").days);
    case "weeks":
      return Math.floor(slotStart.diff(now, "weeks").weeks);
    case "months":
      return Math.floor(slotStart.diff(now, "months").months);
    default:
      return Number.POSITIVE_INFINITY;
  }
};

const normalizeWeekday = (day, fallback) => {
  const parsed = Number(day);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 7) {
    return fallback;
  }
  return parsed;
};

const buildBusinessWeekdaySet = (startDay, endDay) => {
  const normalizedStart = normalizeWeekday(startDay, 1);
  const normalizedEnd = normalizeWeekday(endDay, 5);

  const allowedDays = new Set();
  let cursor = normalizedStart;

  for (let guard = 0; guard < 7; guard += 1) {
    allowedDays.add(cursor);
    if (cursor === normalizedEnd) {
      break;
    }
    cursor = cursor === 7 ? 1 : cursor + 1;
  }

  return allowedDays;
};

const addBusinessDays = (startDate, daysToAdd, businessWeekdaySet) => {
  let cursor = startDate;
  let remaining = daysToAdd;
  const allowedDays = businessWeekdaySet ?? new Set([1, 2, 3, 4, 5]);

  while (remaining > 0) {
    cursor = cursor.plus({ days: 1 });
    if (allowedDays.has(cursor.weekday)) {
      remaining -= 1;
    }
  }

  return cursor;
};

const buildFutureBookingWindow = ({
  limitFutureBookingsEnabled,
  limitFutureBookingsMode,
  limitFutureBookingsValue,
  limitFutureBookingsUnit,
  limitFutureBookingsAlwaysAvailable,
  businessWeekStartDay,
  businessWeekEndDay,
  limitFutureBookingsStartDate,
  limitFutureBookingsEndDate,
  viewerTimezone,
  nowUtc,
}) => {
  if (!limitFutureBookingsEnabled) {
    return null;
  }

  const nowViewer = nowUtc.setZone(viewerTimezone);

  if (limitFutureBookingsMode === "dateRange") {
    const startDate = DateTime.fromISO(String(limitFutureBookingsStartDate), {
      zone: viewerTimezone,
    }).startOf("day");
    const endDate = DateTime.fromISO(String(limitFutureBookingsEndDate), {
      zone: viewerTimezone,
    }).endOf("day");

    if (!startDate.isValid || !endDate.isValid || endDate < startDate) {
      return null;
    }

    return {
      start: startDate,
      end: endDate,
      mode: "dateRange",
      unit: null,
      businessDaysOnly: false,
    };
  }

  const limitAmount = Number(limitFutureBookingsValue);
  if (!Number.isFinite(limitAmount) || limitAmount <= 0) {
    return null;
  }

  const start = limitFutureBookingsAlwaysAvailable
    ? nowViewer.startOf("day")
    : nowViewer;
  const businessWeekdaySet = buildBusinessWeekdaySet(
    businessWeekStartDay,
    businessWeekEndDay,
  );

  let end;

  switch (limitFutureBookingsUnit) {
    case "calendar_days":
      end = start.plus({ days: limitAmount });
      break;
    case "business_days":
      end = addBusinessDays(
        start.startOf("day"),
        limitAmount,
        businessWeekdaySet,
      );
      break;
    case "weeks":
      end = start.plus({ weeks: limitAmount });
      break;
    case "months":
      end = start.plus({ months: limitAmount });
      break;
    default:
      return null;
  }

  return {
    start,
    end:
      limitFutureBookingsUnit === "business_days" ||
      limitFutureBookingsAlwaysAvailable
        ? end.endOf("day")
        : end,
    mode: "rolling",
    unit: limitFutureBookingsUnit,
    businessDaysOnly: limitFutureBookingsUnit === "business_days",
    businessWeekdaySet,
    rollingMaxOpenDates: limitAmount,
  };
};

const isWithinFutureBookingWindow = ({ viewerSlot, futureBookingWindow }) => {
  if (!futureBookingWindow) {
    return true;
  }

  if (
    futureBookingWindow.businessDaysOnly &&
    futureBookingWindow.businessWeekdaySet &&
    !futureBookingWindow.businessWeekdaySet.has(viewerSlot.weekday)
  ) {
    return false;
  }

  if (viewerSlot < futureBookingWindow.start) {
    return false;
  }

  if (futureBookingWindow.mode === "rolling") {
    return true;
  }

  return (
    viewerSlot >= futureBookingWindow.start &&
    viewerSlot <= futureBookingWindow.end
  );
};

const isViewerDateInRequestedMonth = ({
  viewerDateISO,
  viewerMonthRange,
  viewerTimezone,
}) => {
  const viewerDate = DateTime.fromISO(viewerDateISO, {
    zone: viewerTimezone,
  }).startOf("day");

  return (
    viewerDate >= viewerMonthRange.start && viewerDate < viewerMonthRange.end
  );
};

const filterSlotsAndAddUsers = (slots) => {
  const slotMap = new Map();

  for (const slot of slots) {
    const key = slot.utcTime;

    if (!slotMap.has(key)) {
      const nextSlot = {
        ...slot,
        users: slot.user ? [slot.user] : [],
      };
      delete nextSlot.user;
      slotMap.set(key, nextSlot);
      continue;
    }

    const existing = slotMap.get(key);
    if (slot.user) {
      existing.users.push(slot.user);
    }
    slotMap.set(key, existing);
  }

  return Array.from(slotMap.values());
};

const mergeGroupedSlots = (...groupedSlotMaps) => {
  const merged = {};

  groupedSlotMaps.forEach((slotMap) => {
    Object.entries(slotMap || {}).forEach(([dayKey, slots]) => {
      merged[dayKey] = merged[dayKey] ?? [];
      merged[dayKey].push(...slots);
    });
  });

  Object.keys(merged).forEach((dayKey) => {
    merged[dayKey] = filterSlotsAndAddUsers(
      merged[dayKey].sort((left, right) =>
        left.utcTime.localeCompare(right.utcTime),
      ),
    );
  });

  return merged;
};

const combineAvailabilityRecords = (availabilityRecords) => {
  return availabilityRecords.reduce(
    (accumulator, record) => {
      record.availability.forEach((daySlots, dayIndex) => {
        if (!Array.isArray(daySlots) || daySlots.length === 0) return;

        accumulator.availability[dayIndex].push(
          ...daySlots.map((slot) => ({
            ...slot,
            user: slot.user || record.user,
          })),
        );
      });

      record.dateOverrides.forEach((override) => {
        accumulator.dateOverrides.push({
          date: override.date,
          availability: (override.availability || []).map((slot) => ({
            ...slot,
            user: slot.user || record.user,
          })),
        });
      });

      return accumulator;
    },
    {
      availability: [[], [], [], [], [], [], []],
      dateOverrides: [],
    },
  );
};

const getRequestedViewerMonthRange = ({ year, month, viewerTimezone }) => {
  const start = DateTime.fromObject(
    {
      year: Number(year),
      month: Number(month) + 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    { zone: viewerTimezone },
  );

  return {
    start,
    end: start.plus({ months: 1 }),
  };
};

const getHostIterationRange = ({
  viewerMonthStart,
  viewerMonthEnd,
  hostTimezone,
}) => ({
  start: viewerMonthStart
    .setZone(hostTimezone)
    .startOf("day")
    .minus({ days: 1 }),
  end: viewerMonthEnd.setZone(hostTimezone).startOf("day").plus({ days: 1 }),
});

const buildNormalizedResponse = ({
  availability,
  eventTypeSetting,
  groupedSlots,
  viewerTimezone,
  user,
}) => ({
  availableDates: Object.keys(groupedSlots)
    .map(Number)
    .sort((left, right) => left - right),
  slots: groupedSlots,
  eventTypeSetting,
  availability,
  currentDate: DateTime.now().setZone(viewerTimezone).toISO(),
  userName: user?.name,
});

const buildFallbackEventTypeSetting = ({ eventType, user, userId }) => ({
  id: `fallback-${eventType?.id || "event-type"}-${user?.id || userId || "user"}`,
  event_type: eventType?.id,
  user: user?.id || userId,
  member: null,
  expand: {
    event_type: eventType,
    user,
    member: null,
  },
  settings: {
    ...eventType,
    title: eventType?.title,
    description: eventType?.description,
    location: eventType?.location,
    locationType: eventType?.locationType,
    length: eventType?.length,
    defaultDuration: eventType?.defaultDuration ?? eventType?.length,
    timeSlots: eventType?.timeSlots ?? [],
    minimumNotice: eventType?.minimumNotice ?? 0,
    minimumNoticeType: eventType?.minimumNoticeType,
    bufferTimeBefore: eventType?.bufferTimeBefore ?? 0,
    bufferTimeAfter: eventType?.bufferTimeAfter ?? 0,
    bookingQuestions: eventType?.bookingQuestions ?? [],
  },
});

const buildGroupedSlotsForAvailability = ({
  availability,
  bookings,
  bufferTimeAfter,
  bufferTimeBefore,
  minimumNotice,
  minimumNoticeType,
  effectiveIncrement,
  viewerTimezone,
  year,
  month,
  fallbackUserId,
  futureBookingWindowSettings,
  nowUtc,
}) => {
  const effectiveNowUtc = nowUtc ?? DateTime.utc();
  const availabilityTimezone = availability.timezone || "UTC";
  const weeklyAvailability = safeParseJSON(
    availability.availability,
    EMPTY_WEEK,
  );
  const dateOverrides = safeParseJSON(availability.dateOverrides, []);

  const viewerMonthRange = getRequestedViewerMonthRange({
    year,
    month,
    viewerTimezone,
  });
  const hostRange = getHostIterationRange({
    viewerMonthStart: viewerMonthRange.start,
    viewerMonthEnd: viewerMonthRange.end,
    hostTimezone: availabilityTimezone,
  });

  const normalizedBookings = bookings
    .map(normalizeBookingRecord)
    .filter(
      ({ start, end }) =>
        start?.isValid && end?.isValid && end.toMillis() > start.toMillis(),
    );
  const futureBookingWindow = buildFutureBookingWindow({
    ...futureBookingWindowSettings,
    viewerTimezone,
    nowUtc: effectiveNowUtc,
  });
  const rollingMode = futureBookingWindow?.mode === "rolling";
  const rollingViewerStart = rollingMode
    ? futureBookingWindow.start
    : viewerMonthRange.start;
  const rollingHostRangeStart = rollingViewerStart
    .setZone(availabilityTimezone)
    .startOf("day")
    .minus({ days: 1 });
  const groupedSlots = {};
  const allRollingSlotsByDate = {};
  let cursor = rollingMode ? rollingHostRangeStart : hostRange.start;

  while (cursor < hostRange.end) {
    const selectedAvailability = getAvailabilityForLocalDate({
      localDate: cursor,
      weeklyAvailability,
      dateOverrides,
    });

    for (const slot of selectedAvailability) {
      if (!slot?.start || !slot?.end) continue;

      const startUtc = buildUtcDateTimeFromStoredClock({
        localDate: cursor,
        storedClock: slot.start,
      });
      let endUtc = buildUtcDateTimeFromStoredClock({
        localDate: cursor,
        storedClock: slot.end,
      });

      if (endUtc <= startUtc) {
        endUtc = endUtc.plus({ days: 1 });
      }

      let slotStart = startUtc;
      while (slotStart.plus({ minutes: effectiveIncrement }) <= endUtc) {
        const slotEnd = slotStart.plus({ minutes: effectiveIncrement });
        const viewerSlot = slotStart.setZone(viewerTimezone);
        const isInRequestedMonth =
          viewerSlot >= viewerMonthRange.start &&
          viewerSlot < viewerMonthRange.end;

        if (!rollingMode && !isInRequestedMonth) {
          slotStart = slotEnd;
          continue;
        }

        const isFutureSlot = slotStart > effectiveNowUtc;
        const hasConflict = normalizedBookings.some(({ start, end }) => {
          const bufferedStart = start.minus({ minutes: bufferTimeBefore });
          const bufferedEnd = end.plus({ minutes: bufferTimeAfter });
          return slotStart < bufferedEnd && slotEnd > bufferedStart;
        });
        const satisfiesMinimumNotice =
          getMinimumNoticeDiff({
            slotStart,
            now: effectiveNowUtc,
            minimumNoticeType,
          }) >= minimumNotice;
        const isWithinBookingWindow = isWithinFutureBookingWindow({
          viewerSlot,
          futureBookingWindow,
        });

        if (
          isFutureSlot &&
          !hasConflict &&
          satisfiesMinimumNotice &&
          isWithinBookingWindow
        ) {
          const nextSlot = {
            formattedTime: slotStart.toUTC().toFormat("HH:mm:ss"),
            utcTime: slotStart.toUTC().toISO(),
            originalDate: cursor.toISODate(),
            user: slot.user || fallbackUserId,
          };

          if (rollingMode) {
            const viewerDateISO = viewerSlot.toISODate();
            if (viewerDateISO) {
              allRollingSlotsByDate[viewerDateISO] =
                allRollingSlotsByDate[viewerDateISO] ?? [];
              allRollingSlotsByDate[viewerDateISO].push(nextSlot);
            }
          } else if (isInRequestedMonth) {
            const dayKey = String(viewerSlot.day);
            groupedSlots[dayKey] = groupedSlots[dayKey] ?? [];
            groupedSlots[dayKey].push(nextSlot);
          }
        }

        slotStart = slotEnd;
      }
    }

    cursor = cursor.plus({ days: 1 });
  }

  if (futureBookingWindow?.mode === "rolling") {
    const maxOpenDates = Number(futureBookingWindow.rollingMaxOpenDates || 0);
    const selectedDateKeys = Object.keys(allRollingSlotsByDate)
      .sort((left, right) => left.localeCompare(right))
      .slice(0, maxOpenDates);
    const rollingGroupedSlots = {};

    selectedDateKeys.forEach((viewerDateISO) => {
      if (
        !isViewerDateInRequestedMonth({
          viewerDateISO,
          viewerMonthRange,
          viewerTimezone,
        })
      ) {
        return;
      }

      const dayKey = String(
        DateTime.fromISO(viewerDateISO, { zone: viewerTimezone }).day,
      );
      rollingGroupedSlots[dayKey] = rollingGroupedSlots[dayKey] ?? [];
      rollingGroupedSlots[dayKey].push(
        ...(allRollingSlotsByDate[viewerDateISO] || []),
      );
    });

    return rollingGroupedSlots;
  }

  return groupedSlots;
};

export const buildManagedAvailabilityResponse = async ({
  orgId,
  eventTypeId,
  userId,
  year,
  month,
  incrementStep,
  viewerTimezone,
}) => {
  const nowUtc = DateTime.utc();
  const effectiveIncrement = Number(incrementStep ?? 60);

  const [bookings, allAvailability, rawEventTypeSetting] = await Promise.all([
    db.collection("bookings").getFullList({
      filter: `user = "${userId}" && startTime >= "${nowUtc.toISO()}" && status != "cancelled" && status != "unconfirmed"`,
    }),
    db.collection("availability").getFullList({
      filter: `user = "${userId}" && organization = "${orgId}"`,
    }),
    getUserEventSetting(eventTypeId, userId),
  ]);

  const expandedUser = rawEventTypeSetting?.user ?? null;

  const eventTypeSetting = rawEventTypeSetting?.eventSetting;
  const allNormalizedAvailability = allAvailability.map(
    normalizeAvailabilityRecord,
  );
  const linkedAvailability = allNormalizedAvailability.find(
    (entry) => entry.id === eventTypeSetting?.settings?.availability,
  );
  const defaultAvailability = allNormalizedAvailability.find(
    (entry) => entry.isDefault === true,
  );
  const availability =
    linkedAvailability ?? defaultAvailability ?? allNormalizedAvailability[0];

  if (!availability) {
    return {
      status: 200,
      body: {
        availableDates: [],
        slots: {},
        eventTypeSetting,
        availability: null,
        currentDate: nowUtc.toISO(),
        userName: expandedUser?.name,
      },
    };
  }

  const bufferTimeAfter = Number(
    eventTypeSetting?.settings?.bufferTimeAfter || 0,
  );
  const bufferTimeBefore = Number(
    eventTypeSetting?.settings?.bufferTimeBefore || 0,
  );
  const minimumNotice = Number(eventTypeSetting?.settings?.minimumNotice || 0);
  const minimumNoticeType = eventTypeSetting?.settings?.minimumNoticeType;
  const futureBookingWindowSettings = {
    limitFutureBookingsEnabled: Boolean(
      eventTypeSetting?.settings?.limitFutureBookingsEnabled,
    ),
    limitFutureBookingsMode:
      eventTypeSetting?.settings?.limitFutureBookingsMode || "rolling",
    limitFutureBookingsValue:
      eventTypeSetting?.settings?.limitFutureBookingsValue,
    limitFutureBookingsUnit:
      eventTypeSetting?.settings?.limitFutureBookingsUnit || "business_days",
    limitFutureBookingsAlwaysAvailable: Boolean(
      eventTypeSetting?.settings?.limitFutureBookingsAlwaysAvailable,
    ),
    businessWeekStartDay: eventTypeSetting?.settings?.businessWeekStartDay,
    businessWeekEndDay: eventTypeSetting?.settings?.businessWeekEndDay,
    limitFutureBookingsStartDate:
      eventTypeSetting?.settings?.limitFutureBookingsStartDate,
    limitFutureBookingsEndDate:
      eventTypeSetting?.settings?.limitFutureBookingsEndDate,
  };
  const groupedSlots = mergeGroupedSlots(
    buildGroupedSlotsForAvailability({
      availability,
      bookings,
      bufferTimeAfter,
      bufferTimeBefore,
      minimumNotice,
      minimumNoticeType,
      effectiveIncrement,
      viewerTimezone,
      year,
      month,
      fallbackUserId: userId,
      futureBookingWindowSettings,
    }),
  );

  return {
    status: 200,
    body: buildNormalizedResponse({
      availability: {
        ...availability,
        availability: safeParseJSON(availability.availability, EMPTY_WEEK),
        dateOverrides: safeParseJSON(availability.dateOverrides, []),
      },
      eventTypeSetting,
      groupedSlots,
      viewerTimezone,
      user: expandedUser,
    }),
  };
};

export const buildRoundRobinAvailabilityResponse = async ({
  orgId,
  eventTypeId,
  year,
  month,
  incrementStep,
  viewerTimezone,
  members,
}) => {
  const effectiveIncrement = Number(incrementStep ?? 30);
  const memberUserIds = Array.from(
    new Set((members || []).map((member) => member?.user).filter(Boolean)),
  );

  const [rawEventTypeSetting, allAvailability, allBookings] = await Promise.all(
    [
      getUserEventSetting(
        eventTypeId,
        null,
        true, // roundRobin
      ),
      memberUserIds.length
        ? db.collection("availability").getFullList({
            filter: `(${memberUserIds
              .map((userId) => `user = "${userId}"`)
              .join(" || ")}) && organization = "${orgId}"`,
          })
        : Promise.resolve([]),
      Promise.all(
        memberUserIds.map((userId) =>
          db.collection("bookings").getFullList({
            filter: `user = "${userId}" && startTime >= "${DateTime.utc().toISO()}" && status != "cancelled" && status != "unconfirmed"`,
          }),
        ),
      ),
    ],
  );
  console.log("EEEEEEEEE", rawEventTypeSetting, orgId);
  if (!rawEventTypeSetting) {
    return { status: 404, body: { error: "Event type not found" } };
  }
  console.log("RawEventTypeSetting", rawEventTypeSetting);
  if (rawEventTypeSetting?.eventSetting?.settings?.organization?.id !== orgId) {
    return {
      status: 400,
      body: {
        error: "Event type does not belong to the specified organization",
      },
    };
  }

  const eventTypeSetting = rawEventTypeSetting.eventSetting;
  const allNormalizedAvailability = allAvailability
    .map(normalizeAvailabilityRecord)
    .filter((entry) => entry.isDefault === true);
  const combinedAvailability = combineAvailabilityRecords(
    allNormalizedAvailability,
  );

  const bufferTimeAfter = Number(
    eventTypeSetting?.settings?.bufferTimeAfter || 0,
  );
  const bufferTimeBefore = Number(
    eventTypeSetting?.settings?.bufferTimeBefore || 0,
  );
  const minimumNotice = Number(eventTypeSetting?.settings?.minimumNotice || 0);
  const minimumNoticeType = eventTypeSetting?.settings?.minimumNoticeType;
  const futureBookingWindowSettings = {
    limitFutureBookingsEnabled: Boolean(
      eventTypeSetting?.settings?.limitFutureBookingsEnabled,
    ),
    limitFutureBookingsMode:
      eventTypeSetting?.settings?.limitFutureBookingsMode || "rolling",
    limitFutureBookingsValue:
      eventTypeSetting?.settings?.limitFutureBookingsValue,
    limitFutureBookingsUnit:
      eventTypeSetting?.settings?.limitFutureBookingsUnit || "business_days",
    limitFutureBookingsAlwaysAvailable: Boolean(
      eventTypeSetting?.settings?.limitFutureBookingsAlwaysAvailable,
    ),
    businessWeekStartDay: eventTypeSetting?.settings?.businessWeekStartDay,
    businessWeekEndDay: eventTypeSetting?.settings?.businessWeekEndDay,
    limitFutureBookingsStartDate:
      eventTypeSetting?.settings?.limitFutureBookingsStartDate,
    limitFutureBookingsEndDate:
      eventTypeSetting?.settings?.limitFutureBookingsEndDate,
  };

  const groupedSlots = mergeGroupedSlots(
    ...allNormalizedAvailability.map((availability) => {
      const userBookings =
        allBookings[
          memberUserIds.findIndex((userId) => userId === availability.user)
        ] || [];

      return buildGroupedSlotsForAvailability({
        availability,
        bookings: userBookings,
        bufferTimeAfter,
        bufferTimeBefore,
        minimumNotice,
        minimumNoticeType,
        effectiveIncrement,
        viewerTimezone,
        year,
        month,
        fallbackUserId: availability.user,
        futureBookingWindowSettings,
      });
    }),
  );

  return {
    status: 200,
    body: {
      availableDates: Object.keys(groupedSlots)
        .map(Number)
        .sort((left, right) => left - right),
      slots: groupedSlots,
      eventTypeSetting,
      availability: combinedAvailability,
      currentDate: DateTime.now().setZone(viewerTimezone).toISO(),
      userName: null,
    },
  };
};

export const __testables = {
  EMPTY_WEEK,
  safeParseJSON,
  parseClockToMinutes,
  normalizeWeekday,
  buildBusinessWeekdaySet,
  addBusinessDays,
  isViewerDateInRequestedMonth,
  buildFutureBookingWindow,
  isWithinFutureBookingWindow,
  getAvailabilityWeekday,
  getAvailabilityForLocalDate,
  resolveStoredUtcDateTime,
  decodeStoredUtcClockToLocalMinutes,
  buildUtcDateTimeFromStoredClock,
  getMinimumNoticeDiff,
  filterSlotsAndAddUsers,
  mergeGroupedSlots,
  combineAvailabilityRecords,
  getRequestedViewerMonthRange,
  getHostIterationRange,
  buildGroupedSlotsForAvailability,
};
