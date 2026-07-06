const DEFAULT_REMINDER_DELAY_HOURS = 24;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isDisabled(value) {
  return String(value || "").toLowerCase() === "false";
}

function getDelayHours() {
  const delayHours = Number(process.env.FOLLOW_UP_REMINDER_DELAY_HOURS);
  return Number.isFinite(delayHours) && delayHours > 0 ? delayHours : DEFAULT_REMINDER_DELAY_HOURS;
}

function getScheduledFor() {
  return new Date(Date.now() + getDelayHours() * 60 * 60 * 1000);
}

function buildReminderMessage({ lead, bookingFlow }) {
  if (bookingFlow && bookingFlow.bookingRequested) {
    return `Follow up with ${lead.name} about scheduling a showing.`;
  }

  return `Follow up with ${lead.name} about their real estate inquiry.`;
}

function getReminderType({ bookingFlow }) {
  return bookingFlow && bookingFlow.bookingRequested ? "showing_follow_up" : "lead_follow_up";
}

async function scheduleFollowUpReminder(prisma, { lead, conversation = null, bookingFlow = null } = {}) {
  if (isDisabled(process.env.FOLLOW_UP_REMINDERS_ENABLED)) {
    return {
      reminderScheduled: false,
      skippedReason: "disabled"
    };
  }

  if (!lead || !lead.id) {
    return {
      reminderScheduled: false,
      skippedReason: "missing_lead"
    };
  }

  const scheduledFor = getScheduledFor();
  const reminder = await prisma.followUpReminder.create({
    data: {
      agentId: lead.agentId || 1,
      leadId: lead.id,
      conversationId: conversation && conversation.id ? conversation.id : null,
      reminderType: getReminderType({
        bookingFlow
      }),
      status: "scheduled",
      message: buildReminderMessage({
        lead,
        bookingFlow
      }),
      scheduledFor
    }
  });

  return {
    reminderScheduled: true,
    reminder,
    scheduledFor,
    delayHours: getDelayHours()
  };
}

function formatReminderForEmail(reminderResult) {
  if (!reminderResult || !reminderResult.reminderScheduled || !reminderResult.reminder) {
    return "No follow-up reminder scheduled.";
  }

  const message = cleanString(reminderResult.reminder.message);
  const scheduledFor = reminderResult.reminder.scheduledFor
    ? new Date(reminderResult.reminder.scheduledFor).toISOString()
    : "not available";

  return `${message} Scheduled for: ${scheduledFor}`;
}

module.exports = {
  formatReminderForEmail,
  scheduleFollowUpReminder
};
