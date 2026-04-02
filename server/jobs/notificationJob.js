const cron = require("node-cron");
const db = require("../config/db");
const notify = require("../services/notificationService");
const { runJob } = require("./jobRunner");

const sentToday = new Set();
let sentDate = null;

cron.schedule("0 * * * *", () =>
  runJob("notification_dispatch", async () => {
    const today = new Date().toISOString().split("T")[0];

    if (sentDate !== today) {
      sentToday.clear();
      sentDate = today;
    }

    console.log("[notificationJob] Running hourly soft reminders...");

    const [rows] = await db.promise().query(`
      SELECT id, user_id, principal, due_date
      FROM loans
      WHERE due_date < CURDATE() AND status IN ('ACTIVE','APPROVED')
    `);

    let remindersAttempted = 0;

    for (const loan of rows) {
      const key = `${loan.id}-${today}`;
      if (sentToday.has(key)) {
        continue;
      }
      sentToday.add(key);

      await notify.sendReminder({
        whatsappTo: process.env.REMINDER_WHATSAPP_TO || null,
        emailTo: process.env.REMINDER_EMAIL_TO || null,
        message: `Friendly reminder: Loan ${loan.id} amount ${loan.principal} is overdue. Please make a payment to avoid extra interest.`,
      });
      remindersAttempted += 1;
    }

    return {
      processed: rows.length,
      reminders_attempted: remindersAttempted,
    };
  }).catch(() => {})
);
