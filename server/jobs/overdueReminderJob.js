const cron = require("node-cron");
const Loan = require("../models/loanModel");
const notify = require("../services/notificationService");
const { runJob } = require("./jobRunner");

cron.schedule("0 9 * * *", () =>
  runJob("overdue_reminders", async () => {
    console.log("[overdueReminderJob] Sending soft reminders...");

    const overdueLoans = await Loan.getOverdueLoans();
    let remindersAttempted = 0;

    for (const loan of overdueLoans) {
      if (!loan.phone) {
        continue;
      }

      await notify.sendReminder({
        whatsappTo: loan.phone,
        emailTo: process.env.REMINDER_EMAIL_TO || null,
        message: `Reminder:\nYour loan of MWK ${loan.total_amount} was due on ${loan.due_date}.\nPlease repay to avoid additional interest.`,
      });
      remindersAttempted += 1;
    }

    return {
      processed: overdueLoans.length,
      reminders_attempted: remindersAttempted,
    };
  }).catch(() => {})
);
