const express = require("express");
const { createLead } = require("../controllers/leadsController");

const router = express.Router();

// POST /api/leads receives a new lead from the frontend or another service.
router.post("/", createLead);

module.exports = router;
