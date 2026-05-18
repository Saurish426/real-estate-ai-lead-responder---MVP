const { getPrismaClient } = require("../db");
const { createAgent, listAgents } = require("../services/agentService");

async function getAgents(req, res) {
  try {
    const prisma = getPrismaClient();
    const agents = await listAgents(prisma);

    return res.json({
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
    const agent = await createAgent(prisma, req.body);

    return res.status(201).json({
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
