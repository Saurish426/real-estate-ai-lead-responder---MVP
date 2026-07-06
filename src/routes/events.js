const express = require("express");
const { listEvents } = require("../controllers/eventsController");
const { requireApiAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireApiAuth);

// GET /api/events returns recent non-secret tracking events for the dashboard.
router.get("/", listEvents);

module.exports = router;
