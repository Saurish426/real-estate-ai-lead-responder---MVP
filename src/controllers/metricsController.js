const { getPrismaClient } = require("../db");
const { getAgentIdFromRequest, getAgentOrDefault } = require("../services/agentService");
const { getOfficeIdFromRequest, getOfficeOrDefault } = require("../services/officeService");
const { getStartupMetrics } = require("../services/metricsService");

function getOptionalAgentId(req) {
  const value = req.query && req.query.agentId;

  if (!value || value === "all") {
    return null;
  }

  const agentId = Number(value);
  return Number.isInteger(agentId) && agentId > 0 ? agentId : null;
}

async function listMetrics(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const metrics = await getStartupMetrics(prisma, {
      officeId: office.id,
      agentId: getOptionalAgentId(req)
    });

    return res.json({
      agent,
      office,
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
