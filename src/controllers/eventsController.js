const { getPrismaClient } = require("../db");
const { getAgentIdFromRequest, getAgentOrDefault } = require("../services/agentService");
const { listRecentEvents } = require("../services/eventLogService");

async function listEvents(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const events = await listRecentEvents(prisma, {
      agentId: agent.id
    });

    return res.json({
      agent,
      events
    });
  } catch (error) {
    console.error("Error listing events:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to list events."
    });
  }
}

module.exports = {
  listEvents
};
