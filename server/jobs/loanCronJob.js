const cron = require("node-cron");
const db = require("../config/db");
const notify = require("../services/notificationService");
const { runJob } = require("./jobRunner");

async function recoverDefaultLoans() {
  const [loans] = await db.promise().query(
    `SELECT id, recovery_alert_sent FROM loans
     WHERE status = 'DEFAULTED'
       AND rollover_count >=
       CASE
          WHEN duration_days = 7 THEN 3
          WHEN duration_days = 14 THEN 2
          WHEN duration_days = 30 THEN 2
          ELSE 0
       END`
  );

  let alertsSent = 0;
  for (const loan of loans) {
    await db.promise().query("UPDATE loans SET status = 'DEFAULTED' WHERE id = ?", [loan.id]);

    if (Number(loan.recovery_alert_sent || 0) === 0) {
      console.log(`[loanCronJob] ALERT: Loan ${loan.id} moved to DEFAULTED state`);
      await db.promise().query("UPDATE loans SET recovery_alert_sent = 1 WHERE id = ?", [loan.id]);
      alertsSent += 1;
    }
  }

  return { recovered: loans.length, alerts_sent: alertsSent };
}

cron.schedule("0 0 * * *", () =>
  runJob("loan_cron", async () => {
    console.log("[loanCronJob] Running DEFAULTED and rollover check...");

    const today = new Date().toISOString().split("T")[0];
    const [defaultResult] = await db.promise().query(
      "UPDATE loans SET status = 'DEFAULTED' WHERE due_date < ? AND status = 'ACTIVE'",
      [today]
    );

    const [rows] = await db.promise().query(`
      SELECT id,
             principal,
             rate,
             total_amount,
             duration_days,
             last_interest_applied,
             rollover_count,
             due_date
      FROM loans
      WHERE status = 'DEFAULTED'
    `);

    const todayDate = new Date(today);
    let rolloversApplied = 0;
    let rolloversFailed = 0;

    for (const loan of rows) {
      const { id, principal, rate, total_amount, duration_days, last_interest_applied, rollover_count, due_date } = loan;
      const p = Number(principal);
      const r = Number(rate);
      const d = Number(duration_days);

      if (!Number.isFinite(p) || !Number.isFinite(r) || !Number.isFinite(d) || d <= 0) {
        console.warn(`[loanCronJob] Skipping loan ${id}: invalid principal/rate/duration`);
        continue;
      }

      let extensionDays = null;
      if (d === 7 && (rollover_count || 0) < 3) {
        extensionDays = 7;
      } else if (d === 14 && (rollover_count || 0) < 2) {
        extensionDays = 7;
      } else if (d === 30 && (rollover_count || 0) < 2) {
        extensionDays = 14;
      }

      if (!extensionDays) {
        continue;
      }

      const baseDate = last_interest_applied ? new Date(last_interest_applied) : due_date ? new Date(due_date) : null;
      if (!baseDate || Number.isNaN(baseDate.getTime())) {
        console.warn(`[loanCronJob] Loan ${id}: missing date anchors; skipping rollover`);
        continue;
      }

      const nextAllowed = new Date(baseDate.getTime() + extensionDays * 24 * 60 * 60 * 1000);
      if (todayDate < nextAllowed) {
        continue;
      }

      const interest = p * (r / 100);
      const newTotal = Number(total_amount || p) + interest;
      const newRollover = (rollover_count || 0) + 1;
      const newDueDate = new Date(nextAllowed);
      newDueDate.setDate(newDueDate.getDate() + extensionDays);

      try {
        await db.promise().query(
          `UPDATE loans
           SET total_amount = ?,
               last_interest_applied = ?,
               rollover_count = ?,
               due_date = ?
           WHERE id = ?`,
          [newTotal, today, newRollover, newDueDate.toISOString().split("T")[0], id]
        );
        rolloversApplied += 1;

        console.log(
          `[loanCronJob] Loan ${id}: rollover applied. +${interest} added; total=${newTotal}; rollover_count=${newRollover}`
        );

        notify.sendReminder({
          whatsappTo: process.env.REMINDER_WHATSAPP_TO || null,
          emailTo: process.env.REMINDER_EMAIL_TO || null,
          message: `Reminder: Your loan of ${p} is DEFAULTED. If unpaid, another ${r}% interest will be added in ${d} days.`,
        });
      } catch (err) {
        rolloversFailed += 1;
        console.error(`[loanCronJob] Rollover update error for loan ${id}:`, err);
      }
    }

    const recovery = await recoverDefaultLoans();
    return {
      defaulted_marked: Number(defaultResult.affectedRows || 0),
      recovery,
      rollovers_applied: rolloversApplied,
      rollovers_failed: rolloversFailed,
    };
  }).catch(() => {})
);
