const { getPrismaClient } = require("../db");
const { getAgentIdFromRequest, getAgentOrDefault } = require("../services/agentService");
const { getOfficeIdFromRequest, getOfficeOrDefault, saveOfficeSettings } = require("../services/officeService");
const { getAgentSettings, saveAgentSettings } = require("../services/settingsService");

const OFFICE_SETTING_FIELDS = [
  "name",
  "officeEmail",
  "phone",
  "brandName",
  "logoUrl",
  "primaryColor",
  "secondaryColor",
  "websiteUrl"
];

function hasOfficeSettings(input = {}) {
  if (input.office && typeof input.office === "object") {
    return true;
  }

  return OFFICE_SETTING_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(input, field));
}

async function getSettings(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const settings = await getAgentSettings(prisma, agent.id);

    return res.json({
      agent,
      office,
      settings
    });
  } catch (error) {
    console.error("Error loading agent settings:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to load agent settings."
    });
  }
}

async function updateSettings(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const settings = await saveAgentSettings(prisma, req.body, agent.id, office.id);
    const officeSettings = hasOfficeSettings(req.body)
      ? await saveOfficeSettings(prisma, req.body.office || req.body, office.id)
      : office;

    return res.json({
      agent,
      office: officeSettings,
      settings
    });
  } catch (error) {
    console.error("Error saving agent settings:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to save agent settings."
    });
  }
}

module.exports = {
  getSettings,
  updateSettings
};
