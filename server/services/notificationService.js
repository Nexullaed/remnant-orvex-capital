const africastalking = require("africastalking");
const nodemailer = require("nodemailer");

// Africa's Talking SMS client (still used for OTP / approval flows)
let atSms = null;
if (process.env.AT_API_KEY && process.env.AT_USERNAME) {
  const at = africastalking({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
  atSms = at.SMS;
}

function isSmsConfigured() {
  return Boolean(atSms);
}

// Email transporter (optional)
let mailer = null;
const emailDebug = String(process.env.EMAIL_DEBUG || "").toLowerCase() === "true";
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpSecure = (() => {
  const normalized = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
  if (!normalized) return smtpPort === 465;
  return ["true", "1", "yes", "on"].includes(normalized);
})();

if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: !smtpSecure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: {
      rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || "true").trim().toLowerCase() !== "false",
    },
  });
}

function isEmailConfigured() {
  return Boolean(mailer);
}

async function sendSMS(to, message) {
  if (!atSms || !to) {
    console.log("SMS send skipped: missing Africa's Talking config or recipient", { to });
    throw new Error("SMS delivery is not configured");
  }
  await atSms.send({ to, message, from: process.env.AT_SENDER_ID });
}

// Placeholder WhatsApp sender (actual provider integration can be added later)
async function sendWhatsApp(to, message) {
  if (!to) {
    console.log("WhatsApp send skipped: missing recipient");
    return;
  }
  console.log(`(WhatsApp placeholder) to ${to}: ${message}`);
}

async function sendEmail(to, subject, text) {
  if (!mailer || !to) {
    console.log("Email send skipped: missing SMTP config or recipient", { to });
    throw new Error("Email delivery is not configured");
  }
  try {
    const info = await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    if (emailDebug) {
      console.log("Email sent", { to, messageId: info.messageId, response: info.response });
    }
  } catch (err) {
    console.error("Email send error", err?.message || err);
    throw err;
  }
}

async function sendReminder({ whatsappTo, emailTo, message }) {
  const subject = "Loan overdue reminder";
  try {
    const tasks = [];
    if (whatsappTo) {
      tasks.push(sendWhatsApp(whatsappTo, message));
    }
    if (emailTo && isEmailConfigured()) {
      tasks.push(sendEmail(emailTo, subject, message));
    }
    await Promise.all(tasks);
  } catch (err) {
    console.error("Reminder send error", err);
  }
}

module.exports = { isEmailConfigured, isSmsConfigured, sendSMS, sendEmail, sendReminder, sendWhatsApp };
