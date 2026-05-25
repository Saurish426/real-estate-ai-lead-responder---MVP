const express = require("express");
const { listMetrics } = require("../controllers/metricsController");

const router = express.Router();

// GET /api/metrics returns startup traction metrics for the selected agent.
router.get("/", listMetrics);

module.exports = router;
