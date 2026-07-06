const express = require("express");
const { listMetrics } = require("../controllers/metricsController");
const { requireApiAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireApiAuth);

// GET /api/metrics returns startup traction metrics for the selected agent.
router.get("/", listMetrics);

module.exports = router;
