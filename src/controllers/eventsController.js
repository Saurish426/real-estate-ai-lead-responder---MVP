const { getPrismaClient } = require("../db");
const { listRecentEvents } = require("../services/eventLogService");

async function listEvents(req, res) {
  try {
    const prisma = getPrismaClient();
    const events = await listRecentEvents(prisma);

    return res.json({
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
