const fs = require("fs");
const path = require("path");
const express = require("express");

const testRoutes = require("./routes/test");
const leadsRoutes = require("./routes/leads");

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
    const value = trimmedLine.slice(equalsIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const app = express();
const PORT = process.env.PORT || 3000;

// This lets Express read JSON request bodies like req.body.
app.use(express.json());

// Each route file owns one small part of the API.
app.use("/api/test", testRoutes);
app.use("/api/leads", leadsRoutes);

// A small home route helps confirm the API is alive in a browser.
app.get("/", (req, res) => {
  res.json({
    message: "Real Estate AI Lead Responder API"
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
