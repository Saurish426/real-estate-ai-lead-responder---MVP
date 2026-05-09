const express = require("express");
const { getSettings, updateSettings } = require("../controllers/settingsController");

const router = express.Router();

// GET /api/settings returns the saved agent profile for the settings page.
router.get("/", getSettings);

// POST /api/settings creates or updates the one settings record used by the MVP.
router.post("/", updateSettings);

module.exports = router;
