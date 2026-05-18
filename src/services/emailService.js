const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error("EMAIL_USER and EMAIL_APP_PASSWORD are required to send lead reply emails.");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    });
  }

  return transporter;
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

function getAgentNotificationRecipient(agentSettings) {
  const settingsEmail = agentSettings && typeof agentSettings.agentEmail === "string" ? agentSettings.agentEmail.trim() : "";
  const fallbackEmail = process.env.EMAIL_FROM || "";
  return settingsEmail || fallbackEmail;
}

function buildAgentNotificationBody({ lead, aiExtraction, aiResponse, conversation }) {
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
    "AI generated response:",
    cleanValue(aiResponse),
    "",
    `Conversation status: ${cleanValue(conversation && conversation.status)}`
  ].join("\n");
}

async function sendLeadReplyEmail(lead) {
  const mailer = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  const info = await mailer.sendMail({
    from,
    to: lead.email,
    subject: "Thanks for reaching out",
    text: `Hi ${lead.name}, thanks for reaching out! Are you looking to schedule a showing or get more information?`
  });

  return info;
}

async function sendAgentLeadNotificationEmail({ lead, aiExtraction, aiResponse, conversation, agentSettings }) {
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
      aiResponse,
      conversation
    })
  });

  return info;
}

module.exports = {
  sendAgentLeadNotificationEmail,
  sendLeadReplyEmail
};
