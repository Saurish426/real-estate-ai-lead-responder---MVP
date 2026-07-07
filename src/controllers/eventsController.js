const { getPrismaClient } = require("../db");
const { getAgentIdFromRequest, getAgentOrDefault } = require("../services/agentService");
const { listRecentEvents } = require("../services/eventLogService");
const { getOfficeIdFromRequest, getOfficeOrDefault } = require("../services/officeService");

function getOptionalAgentId(req) {
  const value = req.query && req.query.agentId;

  if (!value || value === "all") {
    return null;
  }

  const agentId = Number(value);
  return Number.isInteger(agentId) && agentId > 0 ? agentId : null;
}

async function listEvents(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const events = await listRecentEvents(prisma, {
      officeId: office.id,
      agentId: getOptionalAgentId(req)
    });

    return res.json({
      agent,
      office,
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
