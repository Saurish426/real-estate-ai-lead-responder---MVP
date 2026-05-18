const express = require("express");
const { listEvents } = require("../controllers/eventsController");

const router = express.Router();

// GET /api/events returns recent non-secret tracking events for the dashboard.
router.get("/", listEvents);

module.exports = router;
