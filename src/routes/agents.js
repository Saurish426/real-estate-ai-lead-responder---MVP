const express = require("express");
const { getAgents, postAgent } = require("../controllers/agentsController");

const router = express.Router();

// GET /api/agents returns available agents for the dashboard filter.
router.get("/", getAgents);

// POST /api/agents creates a simple demo agent while auth is not available yet.
router.post("/", postAgent);

module.exports = router;
