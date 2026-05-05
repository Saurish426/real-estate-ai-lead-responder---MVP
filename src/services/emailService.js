const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error("EMAIL_USER and EMAIL_APP_PASSWORD are required to send lead reply emails.");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    });
  }

  return transporter;
}

async function sendLeadReplyEmail(lead) {
  const mailer = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  const info = await mailer.sendMail({
    from,
    to: lead.email,
    subject: "Thanks for reaching out",
    text: `Hi ${lead.name}, thanks for reaching out! Are you looking to schedule a showing or get more information?`
  });

  return info;
}

module.exports = {
  sendLeadReplyEmail
};
