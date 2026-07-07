const { getPrismaClient } = require("../db");
const { createAgent, listAgents } = require("../services/agentService");
const { getOfficeIdFromRequest, getOfficeOrDefault } = require("../services/officeService");

async function getAgents(req, res) {
  try {
    const prisma = getPrismaClient();
    const office = await getOfficeOrDefault(prisma, getOfficeIdFromRequest(req));
    const agents = await listAgents(prisma, {
      officeId: office.id
    });

    return res.json({
      office,
      agents
    });
  } catch (error) {
    console.error("Error listing agents:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to list agents."
    });
  }
}

async function postAgent(req, res) {
  try {
    const prisma = getPrismaClient();
    const office = await getOfficeOrDefault(prisma, getOfficeIdFromRequest(req));
    const agent = await createAgent(prisma, req.body, office.id);

    return res.status(201).json({
      office,
      agent
    });
  } catch (error) {
    console.error("Error creating agent:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to create agent."
    });
  }
}

module.exports = {
  getAgents,
  postAgent
};
