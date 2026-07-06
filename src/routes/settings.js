const express = require("express");
const { getSettings, updateSettings } = require("../controllers/settingsController");
const { requireApiAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireApiAuth);

// GET /api/settings returns the saved agent profile for the settings page.
router.get("/", getSettings);

// POST /api/settings creates or updates the one settings record used by the MVP.
router.post("/", updateSettings);

module.exports = router;
