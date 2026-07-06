const DEFAULT_TIME_ZONE = "America/New_York";
const DEFAULT_EVENT_DURATION_MINUTES = 30;
const DEFAULT_EVENT_START_HOURS = 24;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isEnabled(value) {
  return String(value || "").toLowerCase() === "true";
}

function getPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function shouldCreateCalendarEvent({ bookingFlow }) {
  return Boolean(bookingFlow && bookingFlow.bookingRequested === true);
}

function getCalendarConfig() {
  return {
    enabled: isEnabled(process.env.GOOGLE_CALENDAR_ENABLED),
    accessToken: cleanString(process.env.GOOGLE_CALENDAR_ACCESS_TOKEN),
    calendarId: cleanString(process.env.GOOGLE_CALENDAR_ID) || "primary",
    timeZone: cleanString(process.env.GOOGLE_CALENDAR_TIME_ZONE) || DEFAULT_TIME_ZONE,
    durationMinutes: getPositiveNumber(
      process.env.GOOGLE_CALENDAR_DEFAULT_EVENT_DURATION_MINUTES,
      DEFAULT_EVENT_DURATION_MINUTES
    ),
    startHoursFromNow: getPositiveNumber(
      process.env.GOOGLE_CALENDAR_DEFAULT_EVENT_START_HOURS,
      DEFAULT_EVENT_START_HOURS
    )
  };
}

function buildCalendarDescription({ lead, bookingFlow, agentSettings }) {
  return [
    "Tentative real estate lead follow-up.",
    "This is not a confirmed showing. The agent should confirm availability with the lead.",
    "",
    `Lead name: ${lead.name}`,
    `Lead email: ${lead.email}`,
    `Lead phone: ${lead.phone}`,
    `Lead source: ${lead.source}`,
    "",
    "Original message:",
    lead.message,
    "",
    `Booking link sent: ${bookingFlow && bookingFlow.bookingLinkSent ? "yes" : "no"}`,
    `Agent calendar link: ${agentSettings && agentSettings.calendarLink ? agentSettings.calendarLink : "not provided"}`
  ].join("\n");
}

function buildCalendarEvent({ lead, bookingFlow, agentSettings, config }) {
  const startsAt = addHours(new Date(), config.startHoursFromNow);
  const endsAt = addMinutes(startsAt, config.durationMinutes);

  return {
    scheduledFor: startsAt,
    payload: {
      summary: `Tentative follow-up: ${lead.name} showing request`,
      description: buildCalendarDescription({
        lead,
        bookingFlow,
        agentSettings
      }),
      start: {
        dateTime: startsAt.toISOString(),
        timeZone: config.timeZone
      },
      end: {
        dateTime: endsAt.toISOString(),
        timeZone: config.timeZone
      },
      reminders: {
        useDefault: true
      }
    }
  };
}

async function createGoogleCalendarEventForLead({ lead, bookingFlow, agentSettings }) {
  const config = getCalendarConfig();

  if (!shouldCreateCalendarEvent({ bookingFlow })) {
    return {
      provider: "google_calendar",
      enabled: config.enabled,
      eventCreated: false,
      skippedReason: "no_showing_request"
    };
  }

  if (!config.enabled) {
    return {
      provider: "google_calendar",
      enabled: false,
      eventCreated: false,
      skippedReason: "disabled"
    };
  }

  if (!config.accessToken) {
    return {
      provider: "google_calendar",
      enabled: true,
      eventCreated: false,
      skippedReason: "missing_access_token"
    };
  }

  const { scheduledFor, payload } = buildCalendarEvent({
    lead,
    bookingFlow,
    agentSettings,
    config
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?sendUpdates=none`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(`Google Calendar event creation failed with status ${response.status}.`);
    error.statusCode = response.status;
    error.provider = "google_calendar";
    error.responseBody = errorBody.slice(0, 500);
    throw error;
  }

  const calendarEvent = await response.json();

  return {
    provider: "google_calendar",
    enabled: true,
    eventCreated: true,
    calendarId: config.calendarId,
    eventId: calendarEvent.id || null,
    eventLink: calendarEvent.htmlLink || null,
    scheduledFor
  };
}

module.exports = {
  createGoogleCalendarEventForLead,
  getCalendarConfig
};
