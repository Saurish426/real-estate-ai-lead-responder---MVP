const fs = require("fs");
const path = require("path");
const express = require("express");

// Load simple KEY=value pairs from a local .env file when one exists.
// This keeps the MVP easy to run without adding extra config packages yet.
function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const envFile = fs.readFileSync(envPath, "utf8");

  envFile.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return;
    }

    const equalsIndex = trimmedLine.indexOf("=");

    if (equalsIndex === -1) {
      return;
    }

    const key = trimmedLine.slice(0, equalsIndex).trim();
    let value = trimmedLine.slice(equalsIndex + 1).trim();

    // Support common .env style values like DATABASE_URL="postgresql://..."
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const testRoutes = require("./routes/test");
const authRoutes = require("./routes/auth");
const leadsRoutes = require("./routes/leads");
const settingsRoutes = require("./routes/settings");
const eventsRoutes = require("./routes/events");
const agentsRoutes = require("./routes/agents");
const metricsRoutes = require("./routes/metrics");
const officeRoutes = require("./routes/office");
const { getPrismaClient } = require("./db");
const { loadAuth, redirectIfAuthenticated, requirePageAuth } = require("./middleware/authMiddleware");
const { rateLimiter, requestLogger, securityHeaders } = require("./middleware/productionMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;
const REQUIRED_PRODUCTION_ENV_VARS = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "EMAIL_USER",
  "EMAIL_APP_PASSWORD",
  "EMAIL_FROM"
];

function getMissingProductionEnvVars() {
  return REQUIRED_PRODUCTION_ENV_VARS.filter((key) => !process.env[key]);
}

function validateStartupConfiguration() {
  const missing = getMissingProductionEnvVars();

  if (process.env.NODE_ENV === "production" && missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  if (missing.length > 0) {
    console.warn("Production environment variables are not fully configured yet:", {
      missing
    });
  }
}

validateStartupConfiguration();

// Render/Railway sit behind a proxy. Trust one proxy hop so req.ip and secure cookies behave correctly.
app.set("trust proxy", 1);

app.disable("x-powered-by");

app.use(securityHeaders);
app.use(requestLogger);
app.use(rateLimiter);

// This lets Express read JSON request bodies like req.body, with a small limit for safety.
app.use(express.json({
  limit: "100kb"
}));

// Deployment platforms can call this route to confirm the Node process is alive.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    uptimeSeconds: Math.round(process.uptime())
  });
});

// Readiness checks configuration and database connectivity before production traffic is routed here.
app.get("/ready", async (req, res) => {
  const missing = getMissingProductionEnvVars();

  if (process.env.NODE_ENV === "production" && missing.length > 0) {
    return res.status(503).json({
      status: "not_ready",
      checks: {
        environment: "failed",
        database: "skipped"
      },
      missing
    });
  }

  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;

    return res.json({
      status: "ready",
      checks: {
        environment: missing.length > 0 ? "warning" : "ok",
        database: "ok"
      },
      missing
    });
  } catch (error) {
    console.error("Readiness check failed:", {
      message: error.message,
      code: error.code
    });

    return res.status(503).json({
      status: "not_ready",
      checks: {
        environment: missing.length > 0 ? "warning" : "ok",
        database: "failed"
      }
    });
  }
});

app.use(loadAuth);

// Each route file owns one small part of the API.
app.use("/api/test", testRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/agents", agentsRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/office", officeRoutes);

// Show the simple website lead form at the home page.
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

// Show authentication pages for account access.
app.get("/login", redirectIfAuthenticated, (req, res) => {
  res.sendFile(path.join(process.cwd(), "login.html"));
});

app.get("/signup", redirectIfAuthenticated, (req, res) => {
  res.sendFile(path.join(process.cwd(), "signup.html"));
});

// Show the lightweight internal lead dashboard.
app.get("/dashboard", requirePageAuth, (req, res) => {
  res.sendFile(path.join(process.cwd(), "dashboard.html"));
});

// Show the basic agent settings form.
app.get("/settings", requirePageAuth, (req, res) => {
  res.sendFile(path.join(process.cwd(), "settings.html"));
});

// Show a guided demo for real estate agents.
app.get("/demo", (req, res) => {
  res.sendFile(path.join(process.cwd(), "demo.html"));
});

// Return a small JSON 404 instead of the default HTML error page for unknown routes.
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found."
  });
});

// Keep production error responses generic while still logging useful details.
app.use((error, req, res, next) => {
  const statusCode = error.status || error.statusCode || 500;
  const safeStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;

  console.error("Unhandled server error:", {
    method: req.method,
    path: req.path,
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack
  });

  res.status(safeStatusCode).json({
    error: safeStatusCode === 400 ? "Invalid request body." : "Internal server error."
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
