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
const leadsRoutes = require("./routes/leads");

const app = express();
const PORT = process.env.PORT || 3000;

// This lets Express read JSON request bodies like req.body.
app.use(express.json());

// Each route file owns one small part of the API.
app.use("/api/test", testRoutes);
app.use("/api/leads", leadsRoutes);

// Show the simple website lead form at the home page.
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

// Show the lightweight internal lead dashboard.
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(process.cwd(), "dashboard.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
