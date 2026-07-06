const express = require("express");
const { getAgents, postAgent } = require("../controllers/agentsController");
const { requireApiAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireApiAuth);

// GET /api/agents returns available agents for the dashboard filter.
router.get("/", getAgents);

// POST /api/agents creates a simple demo agent while auth is not available yet.
router.post("/", postAgent);

module.exports = router;
