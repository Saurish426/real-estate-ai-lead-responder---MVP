const express = require("express");

const router = express.Router();

// GET /api/test confirms the backend is running.
router.get("/", (req, res) => {
  res.json({
    status: "working"
  });
});

module.exports = router;
