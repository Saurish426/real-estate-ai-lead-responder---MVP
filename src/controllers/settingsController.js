const { getPrismaClient } = require("../db");
const { getAgentIdFromRequest, getAgentOrDefault } = require("../services/agentService");
const { getAgentSettings, saveAgentSettings } = require("../services/settingsService");

async function getSettings(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const settings = await getAgentSettings(prisma, agent.id);

    return res.json({
      agent,
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
    const settings = await saveAgentSettings(prisma, req.body, agent.id);

    return res.json({
      agent,
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
