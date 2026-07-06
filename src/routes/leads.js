const express = require("express");
const {
  addLeadNote,
  archiveLead,
  createLead,
  deleteLead,
  listLeads,
  updateLead
} = require("../controllers/leadsController");
const { requireApiAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// POST /api/leads receives a new lead from the frontend or another service.
router.post("/", createLead);

// GET /api/leads returns recent leads for the dashboard.
router.get("/", requireApiAuth, listLeads);

// PATCH /api/leads/:id edits lead CRM fields like status, contact info, and archived state.
router.patch("/:id", requireApiAuth, updateLead);

// POST /api/leads/:id/archive archives a lead without deleting it.
router.post("/:id/archive", requireApiAuth, archiveLead);

// POST /api/leads/:id/notes adds an agent note to a lead.
router.post("/:id/notes", requireApiAuth, addLeadNote);

// DELETE /api/leads/:id permanently deletes a lead and its CRM notes.
router.delete("/:id", requireApiAuth, deleteLead);

module.exports = router;
