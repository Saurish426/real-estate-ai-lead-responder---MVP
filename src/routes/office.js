const express = require("express");
const { getOffice, updateOffice } = require("../controllers/officeController");
const { requireApiAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireApiAuth);

// GET /api/office returns office branding and shared team settings.
router.get("/", getOffice);

// POST /api/office saves office branding, office email, and shared team settings.
router.post("/", updateOffice);

module.exports = router;
