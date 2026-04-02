const cron = require("node-cron");
const db = require("../config/db");
const Ledger = require("../models/ledgerModel");
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

cron.schedule("0 1 * * *", () =>
  runJob("interest_accrual", async () => {
    console.log("[interestAccrualJob] Running daily interest accrual...");

    const [rows] = await db.promise().query(`
      SELECT id, principal, rate, duration_days, total_amount, last_interest_applied
      FROM loans
      WHERE status = 'ACTIVE'
    `);

    const today = new Date().toISOString().split("T")[0];
    let accrued = 0;
    let failed = 0;

    for (const loan of rows) {
      const p = Number(loan.principal);
      const r = Number(loan.rate);
      const d = Number(loan.duration_days);

      if (!Number.isFinite(p) || !Number.isFinite(r) || !Number.isFinite(d) || d <= 0) {
        console.warn(`[interestAccrualJob] skipping loan ${loan.id}: invalid numbers`);
        continue;
      }

      const dailyInterest = p * (r / 100) / d;
      const newTotal = Number(loan.total_amount || p) + dailyInterest;

      try {
        await db.promise().query(
          "UPDATE loans SET total_amount = ?, last_interest_applied = ? WHERE id = ?",
          [newTotal, today, loan.id]
        );
        await recordLedger({
          loan_id: loan.id,
          amount: dailyInterest,
          type: "interest_added",
          metadata: { accrual: "daily", base: "principal" },
        });
        accrued += 1;
      } catch (err) {
        failed += 1;
        console.error(`[interestAccrualJob] update error loan ${loan.id}`, err);
      }
    }

    return {
      accrued,
      failed,
      processed: rows.length,
    };
  }).catch(() => {})
);
