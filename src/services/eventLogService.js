const SENSITIVE_KEY_PATTERN = /(password|secret|token|api[-_]?key|authorization|credential|cookie|session)/i;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 25;
const MAX_DEPTH = 5;

function truncateString(value) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

function sanitizeMetadata(value, depth = 0) {
  if (value === undefined) {
    return null;
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (depth >= MAX_DEPTH) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((safeObject, [key, item]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        safeObject[key] = "[REDACTED]";
        return safeObject;
      }

      safeObject[key] = sanitizeMetadata(item, depth + 1);
      return safeObject;
    }, {});
  }

  return String(value);
}

function cleanEventMessage(message) {
  if (typeof message !== "string" || message.trim() === "") {
    return "Event recorded.";
  }

  return truncateString(message.trim());
}

async function logEvent(prisma, { eventType, agentId = null, officeId = null, leadId = null, message, metadata = null }) {
  try {
    return await prisma.eventLog.create({
      data: {
        eventType,
        agentId,
        officeId,
        leadId,
        message: cleanEventMessage(message),
        metadata: sanitizeMetadata(metadata)
      }
    });
  } catch (error) {
    console.warn("Event logging failed:", {
      eventType,
      agentId,
      officeId,
      leadId,
      message: error.message,
      code: error.code
    });

    return null;
  }
}

async function listRecentEvents(prisma, { agentId = null, officeId = null, take = 50 } = {}) {
  return prisma.eventLog.findMany({
    where: {
      ...(officeId ? { officeId } : {}),
      ...(agentId ? { agentId } : {})
    },
    orderBy: {
      createdAt: "desc"
    },
    take
  });
}

module.exports = {
  listRecentEvents,
  logEvent,
  sanitizeMetadata
};
