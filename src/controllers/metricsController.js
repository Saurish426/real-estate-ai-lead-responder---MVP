const { getPrismaClient } = require("../db");
const { getAgentIdFromRequest, getAgentOrDefault } = require("../services/agentService");
const { getStartupMetrics } = require("../services/metricsService");

async function listMetrics(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const metrics = await getStartupMetrics(prisma, agent.id);

    return res.json({
      agent,
      metrics
    });
  } catch (error) {
    console.error("Error listing startup metrics:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to list metrics."
    });
  }
}

module.exports = {
  listMetrics
};
