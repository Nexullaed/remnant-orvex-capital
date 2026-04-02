const cron = require("node-cron");
const db = require("../config/db");
const Ledger = require("../models/ledgerModel");
const notify = require("../services/notificationService");
const { runJob } = require("./jobRunner");

function recordLedger(entry) {
  return new Promise((resolve, reject) => {
    Ledger.record(entry, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

cron.schedule("0 2 * * *", () =>
  runJob("loan_recovery", async () => {
    console.log("[loanRecoveryJob] Running recovery/default processing...");

    const [loans] = await db.promise().query(`
      SELECT * FROM loans
      WHERE status = 'DEFAULTED'
        AND rollover_count >= CASE
            WHEN duration_days = 7 THEN 3
            WHEN duration_days = 14 THEN 2
            WHEN duration_days = 30 THEN 2
            ELSE 0
        END
    `);

    let updated = 0;
    let failed = 0;

    for (const loan of loans) {
      try {
        await db.promise().query("UPDATE loans SET status = 'DEFAULTED' WHERE id = ?", [loan.id]);
        await recordLedger({
          loan_id: loan.id,
          amount: 0,
          type: "default_marking",
          metadata: { reason: "rollover cap reached" },
        });
        await notify.sendReminder({
          whatsappTo: process.env.REMINDER_WHATSAPP_TO || null,
          emailTo: process.env.REMINDER_EMAIL_TO || null,
          message: `Loan ${loan.id} has been marked as defaulted due to rollover limits.`,
        });
        updated += 1;
      } catch (err) {
        failed += 1;
        console.error(`[loanRecoveryJob] update error loan ${loan.id}`, err);
      }
    }

    return {
      failed,
      processed: loans.length,
      updated,
    };
  }).catch(() => {})
);
