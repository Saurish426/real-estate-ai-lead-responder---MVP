const fs = require("fs");
const path = require("path");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { getPrismaClient } = require("../db");
const { normalizeLead } = require("../utils/normalizeLead");

const TEST_SUBJECT = "TEST REAL ESTATE LEAD";

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

function createGmailClient() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error("EMAIL_USER and EMAIL_APP_PASSWORD are required for the manual Gmail test.");
  }

  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

function stripHtml(html) {
  if (!html) {
    return "";
  }

  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSenderEmail(parsedEmail, envelope) {
  const parsedSender = parsedEmail.from && parsedEmail.from.value && parsedEmail.from.value[0];

  if (parsedSender && parsedSender.address) {
    return parsedSender.address;
  }

  const envelopeSender = envelope && envelope.from && envelope.from[0];

  if (envelopeSender && envelopeSender.address) {
    return envelopeSender.address;
  }

  return "unknown";
}

async function findNewestExactSubjectUid(client) {
  const matchingUids = await client.search(
    {
      seen: false,
      subject: TEST_SUBJECT
    },
    {
      uid: true
    }
  );

  if (!matchingUids || matchingUids.length === 0) {
    return null;
  }

  let newestMatch = null;

  // Gmail subject search can be broad, so only choose an exact subject match.
  // This fetches envelopes only; the script reads the full body for one email later.
  for await (const message of client.fetch(
    matchingUids,
    { uid: true, envelope: true },
    { uid: true }
  )) {
    if (message.envelope && message.envelope.subject === TEST_SUBJECT) {
      if (!newestMatch || message.uid > newestMatch.uid) {
        newestMatch = {
          uid: message.uid,
          envelope: message.envelope
        };
      }
    }
  }

  return newestMatch;
}

async function fetchEmailByUid(client, uid) {
  for await (const message of client.fetch(
    String(uid),
    { uid: true, envelope: true, source: true },
    { uid: true }
  )) {
    return message;
  }

  return null;
}

async function captureOneTestLead() {
  loadEnvFile();

  const client = createGmailClient();
  let lock;
  let prisma;

  try {
    await client.connect();
    lock = await client.getMailboxLock("INBOX");

    const match = await findNewestExactSubjectUid(client);

    if (!match) {
      console.log(`No unread Gmail message found with exact subject "${TEST_SUBJECT}".`);
      return null;
    }

    const message = await fetchEmailByUid(client, match.uid);

    if (!message || !message.source) {
      throw new Error("Matching Gmail message could not be read.");
    }

    const parsedEmail = await simpleParser(message.source);
    const body = parsedEmail.text || stripHtml(parsedEmail.html) || "No message body.";
    const senderEmail = getSenderEmail(parsedEmail, message.envelope);
    const leadData = normalizeLead(
      {
        name: senderEmail,
        email: senderEmail,
        message: body,
        source: "email"
      },
      {
        defaultSource: "email"
      }
    );

    prisma = getPrismaClient();
    const savedLead = await prisma.lead.create({
      data: leadData
    });

    await client.messageFlagsAdd(match.uid, ["\\Seen"], { uid: true });

    console.log(`Created email lead ${savedLead.id} from newest unread test email.`);
    return savedLead;
  } finally {
    if (lock) {
      lock.release();
    }

    try {
      await client.logout();
    } catch (error) {
      // Ignore logout errors when the connection failed before login completed.
    }

    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

captureOneTestLead().catch((error) => {
  console.error("Manual Gmail lead capture failed:", {
    message: error.message,
    code: error.code
  });
  process.exitCode = 1;
});
