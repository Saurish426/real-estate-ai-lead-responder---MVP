const nodemailer = require("nodemailer");

let transporter;
let transporterProvider;

const EMAIL_PROVIDERS = {
  GMAIL: "gmail",
  OUTLOOK: "outlook",
  SMTP: "smtp"
};

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getEmailProvider() {
  const provider = cleanString(process.env.EMAIL_PROVIDER).toLowerCase();

  if (provider === EMAIL_PROVIDERS.OUTLOOK || provider === EMAIL_PROVIDERS.SMTP) {
    return provider;
  }

  return EMAIL_PROVIDERS.GMAIL;
}

function getPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function getBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

function requireEmailCredentials(provider) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error(`EMAIL_USER and EMAIL_APP_PASSWORD are required to send ${provider} emails.`);
  }
}

function buildTransportOptions(provider) {
  requireEmailCredentials(provider);

  if (provider === EMAIL_PROVIDERS.OUTLOOK) {
    return {
      host: process.env.OUTLOOK_SMTP_HOST || "smtp.office365.com",
      port: getPort(process.env.OUTLOOK_SMTP_PORT, 587),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    };
  }

  if (provider === EMAIL_PROVIDERS.SMTP) {
    if (!process.env.SMTP_HOST) {
      throw new Error("SMTP_HOST is required when EMAIL_PROVIDER=smtp.");
    }

    return {
      host: process.env.SMTP_HOST,
      port: getPort(process.env.SMTP_PORT, 587),
      secure: getBooleanEnv(process.env.SMTP_SECURE, false),
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    };
  }

  return {
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  };
}

function getTransporter() {
  const provider = getEmailProvider();

  if (!transporter || transporterProvider !== provider) {
    transporter = nodemailer.createTransport(buildTransportOptions(provider));
    transporterProvider = provider;
  }

  return transporter;
}

function getEmailArchitectureStatus() {
  const provider = getEmailProvider();

  return {
    provider,
    outlookReady: true,
    smtpReady: provider === EMAIL_PROVIDERS.SMTP || provider === EMAIL_PROVIDERS.OUTLOOK,
    gmailReady: provider === EMAIL_PROVIDERS.GMAIL
  };
}

function cleanValue(value) {
  return value === undefined || value === null || value === "" ? "Not available" : value;
}

function formatAiExtractionSummary(aiExtraction) {
  if (!aiExtraction) {
    return "Not available";
  }

  return [
    `Intent: ${aiExtraction.intent || "unknown"}`,
    `Wants showing: ${aiExtraction.wants_showing === true ? "yes" : "no"}`,
    `Timeline: ${aiExtraction.timeline || "unknown"}`,
    `Budget: ${aiExtraction.budget || "unknown"}`,
    `Confidence: ${aiExtraction.confidence ?? "unknown"}`
  ].join("\n");
}

function formatCreatedAt(createdAt) {
  if (!createdAt) {
    return "Not available";
  }

  return new Date(createdAt).toISOString();
}

function formatCalendarIntegration(calendarIntegration) {
  if (!calendarIntegration) {
    return "Not available";
  }

  if (calendarIntegration.eventCreated) {
    return [
      "Event created: yes",
      `Provider: ${calendarIntegration.provider || "google_calendar"}`,
      `Event link: ${calendarIntegration.eventLink || "not available"}`,
      `Scheduled for: ${calendarIntegration.scheduledFor ? formatCreatedAt(calendarIntegration.scheduledFor) : "not available"}`
    ].join("\n");
  }

  return [
    "Event created: no",
    `Provider: ${calendarIntegration.provider || "google_calendar"}`,
    `Skipped reason: ${calendarIntegration.skippedReason || calendarIntegration.error || "not available"}`
  ].join("\n");
}

function formatFollowUpReminder(followUpReminder) {
  if (!followUpReminder) {
    return "Not available";
  }

  if (followUpReminder.reminderScheduled && followUpReminder.reminder) {
    return [
      "Reminder scheduled: yes",
      `Message: ${followUpReminder.reminder.message}`,
      `Scheduled for: ${formatCreatedAt(followUpReminder.reminder.scheduledFor)}`,
      `Status: ${followUpReminder.reminder.status}`
    ].join("\n");
  }

  return [
    "Reminder scheduled: no",
    `Reason: ${followUpReminder.skippedReason || followUpReminder.error || "not available"}`
  ].join("\n");
}

function formatAiIntelligence(aiIntelligence) {
  if (!aiIntelligence) {
    return "Not available";
  }

  return [
    `Lead score: ${cleanValue(aiIntelligence.leadScore)}`,
    `Score label: ${cleanValue(aiIntelligence.leadScoreLabel)}`,
    `Sentiment: ${cleanValue(aiIntelligence.sentiment)}`,
    `Urgency: ${cleanValue(aiIntelligence.urgency)}`,
    `Preferred language: ${cleanValue(aiIntelligence.preferredLanguage)}`,
    `Recommendation: ${cleanValue(aiIntelligence.followUpRecommendation)}`,
    `Next action: ${cleanValue(aiIntelligence.recommendedNextAction)}`
  ].join("\n");
}

function getAgentNotificationRecipient(agentSettings) {
  const settingsEmail = agentSettings && typeof agentSettings.agentEmail === "string" ? agentSettings.agentEmail.trim() : "";
  const fallbackEmail = process.env.EMAIL_FROM || "";
  return settingsEmail || fallbackEmail;
}

function buildAgentNotificationBody({
  lead,
  aiExtraction,
  aiIntelligence,
  aiResponse,
  conversation,
  calendarIntegration,
  followUpReminder
}) {
  return [
    "New real estate lead received.",
    "",
    `Lead name: ${cleanValue(lead.name)}`,
    `Lead email: ${cleanValue(lead.email)}`,
    `Lead phone: ${cleanValue(lead.phone)}`,
    `Source: ${cleanValue(lead.source)}`,
    `Created at: ${formatCreatedAt(lead.createdAt)}`,
    "",
    "Original message:",
    cleanValue(lead.message),
    "",
    "AI extraction summary:",
    formatAiExtractionSummary(aiExtraction),
    "",
    "AI intelligence:",
    formatAiIntelligence(aiIntelligence),
    "",
    "AI generated response:",
    cleanValue(aiResponse),
    "",
    `Conversation status: ${cleanValue(conversation && conversation.status)}`,
    "",
    "Calendar integration:",
    formatCalendarIntegration(calendarIntegration),
    "",
    "Follow-up reminder:",
    formatFollowUpReminder(followUpReminder)
  ].join("\n");
}

async function sendLeadReplyEmail(lead, aiResponse = null) {
  const mailer = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const text = cleanString(aiResponse) || `Hi ${lead.name}, thanks for reaching out! Are you looking to schedule a showing or get more information?`;

  const info = await mailer.sendMail({
    from,
    to: lead.email,
    subject: "Thanks for reaching out",
    text
  });

  return info;
}

async function sendAgentLeadNotificationEmail({
  lead,
  aiExtraction,
  aiIntelligence,
  aiResponse,
  conversation,
  agentSettings,
  calendarIntegration,
  followUpReminder
}) {
  const mailer = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const to = getAgentNotificationRecipient(agentSettings);

  if (!to) {
    throw new Error("Agent notification recipient is missing. Set agentEmail in settings or EMAIL_FROM.");
  }

  const info = await mailer.sendMail({
    from,
    to,
    subject: "New Real Estate Lead Summary",
    text: buildAgentNotificationBody({
      lead,
      aiExtraction,
      aiIntelligence,
      aiResponse,
      conversation,
      calendarIntegration,
      followUpReminder
    })
  });

  return info;
}

module.exports = {
  EMAIL_PROVIDERS,
  getEmailArchitectureStatus,
  sendAgentLeadNotificationEmail,
  sendLeadReplyEmail
};
