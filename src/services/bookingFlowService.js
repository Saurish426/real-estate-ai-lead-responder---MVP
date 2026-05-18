const BOOKING_QUESTION = "Would you like to schedule a showing?";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getCalendarLink(agentSettings) {
  return cleanString(agentSettings && agentSettings.calendarLink);
}

function wantsShowing(aiExtraction) {
  return aiExtraction && aiExtraction.wants_showing === true;
}

function messageSuggestsBooked(message) {
  return /\b(booked|scheduled|confirmed)\b.{0,40}\b(showing|tour|appointment)\b|\b(showing|tour|appointment)\b.{0,40}\b(booked|scheduled|confirmed)\b/i.test(
    cleanString(message)
  );
}

function hasBookingQuestion(response) {
  return /would you like to schedule a showing\?/i.test(cleanString(response));
}

function hasBookingLink(response, calendarLink) {
  return calendarLink && cleanString(response).includes(`Book here: ${calendarLink}`);
}

function applyBookingFlow(response, { lead, aiExtraction, agentSettings } = {}) {
  const calendarLink = getCalendarLink(agentSettings);
  const bookingRequested = wantsShowing(aiExtraction);
  const bookingLinkSent = bookingRequested && Boolean(calendarLink);
  const bookingStatus = messageSuggestsBooked(lead && lead.message)
    ? "booked"
    : bookingRequested
      ? "showing_requested"
      : "none";

  if (!bookingRequested || typeof response !== "string" || response.trim() === "") {
    return {
      response,
      bookingRequested,
      bookingLinkSent,
      bookingStatus,
      calendarLink: bookingLinkSent ? calendarLink : null
    };
  }

  const additions = [];

  if (!hasBookingQuestion(response)) {
    additions.push(BOOKING_QUESTION);
  }

  if (bookingLinkSent && !hasBookingLink(response, calendarLink)) {
    additions.push(`Book here: ${calendarLink}`);
  }

  return {
    response: additions.length > 0 ? `${response} ${additions.join(" ")}`.trim() : response,
    bookingRequested,
    bookingLinkSent,
    bookingStatus,
    calendarLink: bookingLinkSent ? calendarLink : null
  };
}

module.exports = {
  BOOKING_QUESTION,
  applyBookingFlow
};
