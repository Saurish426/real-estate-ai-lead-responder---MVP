const AI_RESPONSE_EVENT = "ai_response_generated";
const EMAIL_SENT_EVENT = "email_auto_reply_sent";
const EMAIL_FAILED_EVENT = "email_auto_reply_failed";
const LEAD_CREATED_EVENT = "lead_created";
const QUALIFIED_INTENTS = new Set(["buyer", "seller", "showing_request"]);

function startOfDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function getWeekStart(date) {
  const day = startOfDay(date);
  const dayOfWeek = day.getDay();
  day.setDate(day.getDate() - dayOfWeek);
  return day;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function getAiConfidence(aiExtraction) {
  const confidence = Number(aiExtraction && aiExtraction.confidence);
  return Number.isFinite(confidence) ? confidence : null;
}

function isQualifiedLead(lead) {
  const intent = lead.aiExtraction && lead.aiExtraction.intent;
  const confidence = getAiConfidence(lead.aiExtraction);
  const leadScore = Number(lead.leadScore || (lead.aiIntelligence && lead.aiIntelligence.leadScore));

  if (Number.isFinite(leadScore) && leadScore >= 75) {
    return true;
  }

  return QUALIFIED_INTENTS.has(intent) && confidence !== null && confidence >= 0.5;
}

function wantsShowing(lead, conversation) {
  return Boolean(
    (lead.aiExtraction && lead.aiExtraction.wants_showing === true) ||
      (conversation && (conversation.bookingRequested === true || conversation.status === "showing_requested"))
  );
}

function isBooked(conversation) {
  return Boolean(conversation && (conversation.bookingStatus === "booked" || conversation.status === "booked"));
}

function buildConversationMap(conversations) {
  return conversations.reduce((map, conversation) => {
    if (!map.has(conversation.leadId)) {
      map.set(conversation.leadId, conversation);
    }

    return map;
  }, new Map());
}

function getFirstEventTimes(events, eventType) {
  return events
    .filter((event) => event.eventType === eventType && event.leadId)
    .reduce((map, event) => {
      const currentTime = map.get(event.leadId);
      const eventTime = new Date(event.createdAt).getTime();

      if (!currentTime || eventTime < currentTime) {
        map.set(event.leadId, eventTime);
      }

      return map;
    }, new Map());
}

function calculateAverageResponseTime({ leads, events }) {
  const createdTimesByLeadId = getFirstEventTimes(events, LEAD_CREATED_EVENT);
  const sentTimesByLeadId = getFirstEventTimes(events, EMAIL_SENT_EVENT);
  const responseTimes = [];

  leads.forEach((lead) => {
    const leadCreatedAt = new Date(lead.createdAt).getTime();
    const createdAt = createdTimesByLeadId.get(lead.id) || leadCreatedAt;
    const sentAt = sentTimesByLeadId.get(lead.id);

    if (sentAt && sentAt >= createdAt) {
      responseTimes.push(sentAt - createdAt);
    }
  });

  if (responseTimes.length === 0) {
    return null;
  }

  return Math.round(responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length);
}

function formatDuration(milliseconds) {
  if (milliseconds === null || milliseconds === undefined) {
    return "N/A";
  }

  const seconds = Math.max(1, Math.round(milliseconds / 1000));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function buildDailyUsage(leads, now = new Date()) {
  const startDate = addDays(startOfDay(now), -6);
  const counts = new Map();

  leads.forEach((lead) => {
    const key = toDateKey(startOfDay(lead.createdAt));
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(startDate, index);
    const key = toDateKey(date);

    return {
      date: key,
      label: formatShortDate(date),
      count: counts.get(key) || 0
    };
  });
}

function buildWeeklyUsage(leads, now = new Date()) {
  const currentWeekStart = getWeekStart(now);
  const startDate = addDays(currentWeekStart, -21);
  const counts = new Map();

  leads.forEach((lead) => {
    const key = toDateKey(getWeekStart(lead.createdAt));
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from({ length: 4 }, (_, index) => {
    const date = addDays(startDate, index * 7);
    const key = toDateKey(date);

    return {
      weekStart: key,
      label: `Week of ${formatShortDate(date)}`,
      count: counts.get(key) || 0
    };
  });
}

function calculateResponseSuccessRate({ leads, events }) {
  const sentCount = events.filter((event) => event.eventType === EMAIL_SENT_EVENT).length;
  const failedCount = events.filter((event) => event.eventType === EMAIL_FAILED_EVENT).length;
  const eventAttempts = sentCount + failedCount;

  if (eventAttempts > 0) {
    return {
      emailAttempts: eventAttempts,
      emailSent: sentCount,
      emailFailed: failedCount,
      responseSuccessRate: Math.round((sentCount / eventAttempts) * 100)
    };
  }

  const savedSentCount = leads.filter((lead) => lead.emailSent === true).length;
  const savedAttempts = leads.length;

  return {
    emailAttempts: savedAttempts,
    emailSent: savedSentCount,
    emailFailed: Math.max(savedAttempts - savedSentCount, 0),
    responseSuccessRate: savedAttempts > 0 ? Math.round((savedSentCount / savedAttempts) * 100) : 0
  };
}

async function getStartupMetrics(prisma, agentId) {
  const [leads, conversations, events] = await Promise.all([
    prisma.lead.findMany({
      where: {
        agentId
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.conversation.findMany({
      where: {
        agentId
      },
      orderBy: {
        id: "desc"
      }
    }),
    prisma.eventLog.findMany({
      where: {
        agentId
      },
      orderBy: {
        createdAt: "asc"
      }
    })
  ]);
  const conversationByLeadId = buildConversationMap(conversations);
  const totalAiResponseEvents = events.filter((event) => event.eventType === AI_RESPONSE_EVENT).length;
  const fallbackAiResponses = conversations.filter((conversation) => conversation.lastMessage).length;
  const totalAiResponses = totalAiResponseEvents || fallbackAiResponses;
  const qualifiedLeads = leads.filter(isQualifiedLead).length;
  const showingRequests = leads.filter((lead) => wantsShowing(lead, conversationByLeadId.get(lead.id))).length;
  const bookedLeads = leads.filter((lead) => isBooked(conversationByLeadId.get(lead.id))).length;
  const averageResponseTimeMs = calculateAverageResponseTime({
    leads,
    events
  });
  const responseStats = calculateResponseSuccessRate({
    leads,
    events
  });

  return {
    totals: {
      totalLeads: leads.length,
      totalAiResponses,
      qualifiedLeads,
      showingRequests,
      bookedLeads
    },
    performance: {
      averageResponseTimeMs,
      averageResponseTimeLabel: formatDuration(averageResponseTimeMs),
      responseSuccessRate: responseStats.responseSuccessRate,
      responseSuccessRateLabel: `${responseStats.responseSuccessRate}%`,
      emailAttempts: responseStats.emailAttempts,
      emailSent: responseStats.emailSent,
      emailFailed: responseStats.emailFailed
    },
    usage: {
      daily: buildDailyUsage(leads),
      weekly: buildWeeklyUsage(leads)
    }
  };
}

module.exports = {
  getStartupMetrics
};
