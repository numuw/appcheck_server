import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/integrations/google-callback" // Redirect URI
);

// Generate auth URL for user consent
export const getAuthUrl = () => {
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ];

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });
};

// Exchange authorization code for tokens
export const getTokens = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

// Set credentials for API calls
export const setCredentials = (tokens) => {
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

// Check for conflicts in user's calendar
export const checkCalendarConflicts = async (
  accessToken,
  startTime,
  endTime
) => {
  try {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: "v3", auth });

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime,
        timeMax: endTime,
        items: [{ id: "primary" }],
      },
    });

    const busyTimes = response.data.calendars.primary.busy || [];
    return busyTimes.length > 0;
  } catch (error) {
    console.error("Error checking calendar conflicts:", error);
    throw new Error("Failed to check calendar availability");
  }
};

// Create calendar event with Google Meet link
export const createCalendarEvent = async (accessToken, eventDetails) => {
  try {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: "v3", auth });

    const event = {
      summary: eventDetails.title,
      description: eventDetails.description,
      start: {
        dateTime: eventDetails.startTime,
        timeZone: eventDetails.timeZone || "UTC",
      },
      end: {
        dateTime: eventDetails.endTime,
        timeZone: eventDetails.timeZone || "UTC",
      },
      attendees: eventDetails.attendees?.map((email) => ({ email })) || [],
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 10 },
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: "all",
    });

    return {
      eventId: response.data.id,
      meetLink: response.data.conferenceData?.entryPoints?.[0]?.uri,
      htmlLink: response.data.htmlLink,
    };
  } catch (error) {
    console.error("Error creating calendar event:", error);
    throw new Error("Failed to create calendar event");
  }
};

// Get user's calendar events for a date range
export const getUserEvents = async (accessToken, startTime, endTime) => {
  try {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: "v3", auth });

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: startTime,
      timeMax: endTime,
      singleEvents: true,
      orderBy: "startTime",
    });

    return response.data.items || [];
  } catch (error) {
    console.error("Error fetching user events:", error);
    throw new Error("Failed to fetch calendar events");
  }
};
