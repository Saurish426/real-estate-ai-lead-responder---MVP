const { getPrismaClient } = require("../db");
const { getAgentSettings, saveAgentSettings } = require("../services/settingsService");

async function getSettings(req, res) {
  try {
    const prisma = getPrismaClient();
    const settings = await getAgentSettings(prisma);

    return res.json({
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
    const settings = await saveAgentSettings(prisma, req.body);

    return res.json({
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
