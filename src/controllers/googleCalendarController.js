import {
  getAuthUrl,
  getTokens,
  checkCalendarConflicts,
  createCalendarEvent,
  getUserEvents,
} from "../utils/googleCalendar.js";
import { pocketbaseRequest } from "../utils/utils.js";

// Initiate Google OAuth flow
export const initiateGoogleAuth = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const authUrl = getAuthUrl();

    // Store the state with userId for later reference
    const state = Buffer.from(JSON.stringify({ userId })).toString("base64");
    const authUrlWithState = `${authUrl}&state=${state}`;

    return res.status(200).json({
      authUrl: authUrlWithState,
      message: "Please visit the URL to authorize Google Calendar access",
    });
  } catch (error) {
    console.error("Error initiating Google auth:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Handle Google OAuth callback
export const handleGoogleCallback = async (req, res) => {
  try {
    const { code, state } = req.body;
    // get user from token from request header (Authentication)
    const pbUserId = req.userId;

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    // Decode state to get userId
    const { userId } = JSON.parse(Buffer.from(state, "base64").toString());

    const tokens = await getTokens(code);

    // Store tokens in your database (via PocketBase)
    await pocketbaseRequest({
      url: "/users/google-tokens",
      method: "POST",
      data: {
        pbUserId,
        googleUserId: userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        scope: tokens.scope,
        tokenType: tokens.token_type,
      },
    });

    return res.status(200).json({
      message: "Google Calendar connected successfully",
      userId,
    });
  } catch (error) {
    console.error("Error handling Google callback:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Check availability and prevent double booking
export const checkAvailability = async (req, res) => {
  try {
    const { userId, startTime, endTime } = req.body;

    if (!userId || !startTime || !endTime) {
      return res.status(400).json({
        error: "User ID, start time, and end time are required",
      });
    }

    // Get user's Google Calendar tokens from database
    const tokenResponse = await pocketbaseRequest({
      url: "/users/google-tokens/single",
      method: "POST",
      data: { userId },
    });

    if (!tokenResponse.data.accessToken) {
      return res.status(400).json({
        error: "User has not connected Google Calendar",
      });
    }

    // Check for conflicts in Google Calendar
    const hasConflicts = await checkCalendarConflicts(
      tokenResponse.data.accessToken,
      startTime,
      endTime
    );

    // Also check conflicts in your local booking system
    const localConflicts = await pocketbaseRequest({
      url: "/bookings/check-conflicts",
      method: "POST",
      data: { userId, startTime, endTime },
    });

    const isAvailable = !hasConflicts && !localConflicts.data.hasConflicts;

    return res.status(200).json({
      available: isAvailable,
      conflicts: {
        googleCalendar: hasConflicts,
        localBookings: localConflicts.data.hasConflicts,
      },
    });
  } catch (error) {
    console.error("Error checking availability:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Create meeting with Google Meet link
export const createMeeting = async (req, res) => {
  try {
    const {
      userId,
      title,
      description,
      startTime,
      endTime,
      attendees,
      timeZone,
    } = req.body;

    if (!userId || !title || !startTime || !endTime) {
      return res.status(400).json({
        error: "User ID, title, start time, and end time are required",
      });
    }

    // Get user's Google Calendar tokens
    const tokenResponse = await pocketbaseRequest({
      url: "/users/google-tokens/single",
      method: "POST",
      data: { userId },
    });

    if (!tokenResponse.data.accessToken) {
      return res.status(400).json({
        error: "User has not connected Google Calendar",
      });
    }

    // Check availability first
    const hasConflicts = await checkCalendarConflicts(
      tokenResponse.data.accessToken,
      startTime,
      endTime
    );

    if (hasConflicts) {
      return res.status(409).json({
        error: "Time slot conflicts with existing calendar events",
      });
    }

    // Create calendar event with Google Meet
    const eventDetails = {
      title,
      description,
      startTime,
      endTime,
      attendees,
      timeZone,
    };

    const calendarEvent = await createCalendarEvent(
      tokenResponse.data.accessToken,
      eventDetails
    );

    // Save booking to your local database
    const bookingData = {
      userId,
      title,
      description,
      startTime,
      endTime,
      attendees,
      googleEventId: calendarEvent.eventId,
      meetLink: calendarEvent.meetLink,
      calendarLink: calendarEvent.htmlLink,
      status: "confirmed",
    };

    const bookingResponse = await pocketbaseRequest({
      url: "/bookings/create",
      method: "POST",
      data: bookingData,
    });

    return res.status(201).json({
      message: "Meeting created successfully",
      booking: bookingResponse.data,
      meetLink: calendarEvent.meetLink,
      calendarLink: calendarEvent.htmlLink,
    });
  } catch (error) {
    console.error("Error creating meeting:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Get user's calendar events
export const getUserCalendarEvents = async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.body;

    if (!userId || !startDate || !endDate) {
      return res.status(400).json({
        error: "User ID, start date, and end date are required",
      });
    }

    // Get user's Google Calendar tokens
    const tokenResponse = await pocketbaseRequest({
      url: "/users/google-tokens/single",
      method: "POST",
      data: { userId },
    });

    if (!tokenResponse.data.accessToken) {
      return res.status(400).json({
        error: "User has not connected Google Calendar",
      });
    }

    const events = await getUserEvents(
      tokenResponse.data.accessToken,
      startDate,
      endDate
    );

    return res.status(200).json({
      events: events.map((event) => ({
        id: event.id,
        title: event.summary,
        description: event.description,
        startTime: event.start.dateTime || event.start.date,
        endTime: event.end.dateTime || event.end.date,
        meetLink: event.conferenceData?.entryPoints?.[0]?.uri,
        htmlLink: event.htmlLink,
      })),
    });
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const googleConnectionStatus = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get user's Google Calendar tokens
    const tokenResponse = await pocketbaseRequest({
      url: "/users/google-tokens/single",
      method: "POST",
      data: { userId },
    });

    return res.status(200).json(tokenResponse.data);
  } catch (error) {
    console.error("Error fetching Google connection status:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const disconnectGoogleCalendar = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Remove user's Google Calendar tokens from database
    const deleteResponse = await pocketbaseRequest({
      url: "/users/google-tokens/delete",
      method: "DELETE",
      data: { userId },
    });

    return res.status(200).json({
      message: "Google Calendar disconnected successfully",
    });
  } catch (error) {
    console.error("Error disconnecting Google Calendar:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const handleUpdateTokens = async (req, res) => {
  try {
    const { id, autoCreateMeetingLink } = req.body;

    // Update user's Google Calendar settings in the database
    const updateResponse = await pocketbaseRequest({
      url: "/users/google-tokens/update",
      method: "PUT",
      data: { id, autoCreateMeetingLink },
    });

    return res.status(200).json({
      message: "Google Calendar settings updated successfully",
      data: updateResponse.data,
    });
  } catch (error) {
    console.error("Error updating Google Calendar settings:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const updateMemberData = async (req, res) => {
  try {
    const data = req.body;
    const authorization = req.headers.authorization;
    console.log(data);
    const response = await pocketbaseRequest({
      url: `/update-member-data`,
      method: "POST",
      data,
      headers: {
        Authorization: authorization,
      },
    });
    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const impersonation = async (req, res) => {
  try {
    const authorization = req.headers.authorization;
    const body = req.body;
    const response = await pocketbaseRequest({
      url: `/custom-impersonate`,
      method: "POST",
      data: body,
      headers: {
        Authorization: authorization,
      },
    });
    console.log(response.data);
    return res.status(200).json(response.data);
  } catch (error) {
    console.error("Error in impersonation:", error);
    return res.status(500).json({ error: error.message });
  }
};
