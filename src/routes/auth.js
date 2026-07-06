const express = require("express");
const { login, logout, me, signUp } = require("../controllers/authController");

const router = express.Router();

// POST /api/auth/signup creates a user, agent, and session.
router.post("/signup", signUp);

// POST /api/auth/login creates a new session for an existing user.
router.post("/login", login);

// POST /api/auth/logout clears the current session when one exists.
router.post("/logout", logout);

// GET /api/auth/me lets pages check whether a user is signed in.
router.get("/me", me);

module.exports = router;
