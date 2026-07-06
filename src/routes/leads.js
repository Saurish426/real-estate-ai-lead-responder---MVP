const express = require("express");
const { createLead, listLeads } = require("../controllers/leadsController");
const { requireApiAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// POST /api/leads receives a new lead from the frontend or another service.
router.post("/", createLead);

// GET /api/leads returns recent leads for the dashboard.
router.get("/", requireApiAuth, listLeads);

module.exports = router;
