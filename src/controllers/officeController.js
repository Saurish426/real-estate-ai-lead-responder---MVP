const { getPrismaClient } = require("../db");
const { getAgentIdFromRequest, getAgentOrDefault } = require("../services/agentService");
const { getOfficeIdFromRequest, getOfficeOrDefault, saveOfficeSettings } = require("../services/officeService");

async function getOffice(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));

    return res.json({
      office
    });
  } catch (error) {
    console.error("Error loading office settings:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to load office settings."
    });
  }
}

async function updateOffice(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const savedOffice = await saveOfficeSettings(prisma, req.body, office.id);

    return res.json({
      office: savedOffice
    });
  } catch (error) {
    console.error("Error saving office settings:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to save office settings."
    });
  }
}

module.exports = {
  getOffice,
  updateOffice
};
