const SETTINGS_ID = 1;

const DEFAULT_AGENT_SETTINGS = {
  agentName: "AI Lead Responder",
  agentEmail: "",
  agentPhone: "",
  businessName: "Real Estate Team",
  calendarLink: "",
  preferredReplyTone: "friendly and professional"
};

function cleanSetting(value) {
  return typeof value === "string" ? value.trim() : "";
}

function withSafeDefaults(settings = {}) {
  return {
    id: settings.id || SETTINGS_ID,
    agentName: cleanSetting(settings.agentName) || DEFAULT_AGENT_SETTINGS.agentName,
    agentEmail: cleanSetting(settings.agentEmail) || DEFAULT_AGENT_SETTINGS.agentEmail,
    agentPhone: cleanSetting(settings.agentPhone) || DEFAULT_AGENT_SETTINGS.agentPhone,
    businessName: cleanSetting(settings.businessName) || DEFAULT_AGENT_SETTINGS.businessName,
    calendarLink: cleanSetting(settings.calendarLink) || DEFAULT_AGENT_SETTINGS.calendarLink,
    preferredReplyTone: cleanSetting(settings.preferredReplyTone) || DEFAULT_AGENT_SETTINGS.preferredReplyTone,
    createdAt: settings.createdAt || null,
    updatedAt: settings.updatedAt || null
  };
}

function normalizeSettingsInput(input = {}) {
  const settings = withSafeDefaults(input);

  return {
    agentName: settings.agentName,
    agentEmail: settings.agentEmail,
    agentPhone: settings.agentPhone,
    businessName: settings.businessName,
    calendarLink: settings.calendarLink,
    preferredReplyTone: settings.preferredReplyTone
  };
}

async function getAgentSettings(prisma) {
  const settings = await prisma.agentSettings.findUnique({
    where: {
      id: SETTINGS_ID
    }
  });

  return withSafeDefaults(settings || {});
}

async function saveAgentSettings(prisma, input) {
  const data = normalizeSettingsInput(input);
  const settings = await prisma.agentSettings.upsert({
    where: {
      id: SETTINGS_ID
    },
    update: data,
    create: {
      id: SETTINGS_ID,
      ...data
    }
  });

  return withSafeDefaults(settings);
}

function formatAgentSettingsForPrompt(settings) {
  const safeSettings = withSafeDefaults(settings || {});
  const lines = [
    `Agent name: ${safeSettings.agentName}`,
    `Agent email: ${safeSettings.agentEmail || "not provided"}`,
    `Agent phone: ${safeSettings.agentPhone || "not provided"}`,
    `Business name: ${safeSettings.businessName}`,
    `Calendar link: ${safeSettings.calendarLink || "not provided"}`,
    `Preferred reply tone: ${safeSettings.preferredReplyTone}`
  ];

  return lines.join("\n");
}

module.exports = {
  DEFAULT_AGENT_SETTINGS,
  formatAgentSettingsForPrompt,
  getAgentSettings,
  saveAgentSettings,
  withSafeDefaults
};
