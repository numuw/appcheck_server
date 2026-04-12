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

const normalizeBookingRecord = (record) => ({
  ...record,
  start: DateTime.fromISO(record.startTime, { zone: "utc" }),
  end: DateTime.fromISO(record.endTime, { zone: "utc" }),
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
}) => {
  const nowUtc = DateTime.utc();
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

  const normalizedBookings = bookings.map(normalizeBookingRecord);
  const groupedSlots = {};
  let cursor = hostRange.start;

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

        if (!isInRequestedMonth) {
          slotStart = slotEnd;
          continue;
        }

        const isFutureSlot = slotStart > nowUtc;
        const hasConflict = normalizedBookings.some(({ start, end }) => {
          const bufferedStart = start.minus({ minutes: bufferTimeBefore });
          const bufferedEnd = end.plus({ minutes: bufferTimeAfter });
          return slotStart < bufferedEnd && slotEnd > bufferedStart;
        });
        const satisfiesMinimumNotice =
          getMinimumNoticeDiff({
            slotStart,
            now: nowUtc,
            minimumNoticeType,
          }) >= minimumNotice;

        if (isFutureSlot && !hasConflict && satisfiesMinimumNotice) {
          const dayKey = String(viewerSlot.day);
          groupedSlots[dayKey] = groupedSlots[dayKey] ?? [];
          groupedSlots[dayKey].push({
            formattedTime: slotStart.toUTC().toFormat("HH:mm:ss"),
            utcTime: slotStart.toUTC().toISO(),
            originalDate: cursor.toISODate(),
            user: slot.user || fallbackUserId,
          });
        }

        slotStart = slotEnd;
      }
    }

    cursor = cursor.plus({ days: 1 });
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
