const cron = require("node-cron");
const db = require("../config/db");
const notify = require("../services/notificationService");

// Runs every day at midnight
cron.schedule("0 0 * * *", () => {
    console.log("Running overdue loan check...");

    const today = new Date().toISOString().split("T")[0];

    // 1) Mark newly defaulted loans (past due while active)
    db.query(
        "UPDATE loans SET status = 'DEFAULTED' WHERE due_date < ? AND status = 'ACTIVE'",
        [today],
        (err, result) => {
            if (err) {
                console.error("Overdue update error:", err);
            } else {
                console.log(`${result.affectedRows} loans marked as DEFAULTED`);
            }
        }
    );

    // 2) Apply rollover interest to defaulted loans that have exceeded their duration since last interest
    const selectSql = `
        SELECT id, principal, rate, total_amount, duration_days, last_interest_applied, rollover_count
        FROM loans
        WHERE status = 'DEFAULTED'
    `;

    db.query(selectSql, (err, rows) => {
        if (err) {
            console.error("Overdue select error:", err);
            return;
        }

        const todayDate = new Date(today);

        rows.forEach((loan) => {
            const {
                id,
                principal,
                rate,
                total_amount,
                duration_days,
                last_interest_applied,
                rollover_count,
            } = loan;

            // Validate required numeric fields
            const p = Number(principal);
            const r = Number(rate);
            const d = Number(duration_days);

            if (!Number.isFinite(p) || !Number.isFinite(r) || !Number.isFinite(d) || d <= 0) {
                console.warn(`Skipping loan ${id}: invalid principal/rate/duration`);
                return;
            }

            // Determine if we should apply additional interest
            const lastAppliedDate = last_interest_applied ? new Date(last_interest_applied) : null;
            const dueForRollover =
                !lastAppliedDate ||
                todayDate >= new Date(lastAppliedDate.getTime() + d * 24 * 60 * 60 * 1000);

            if (!dueForRollover) {
                return;
            }

            // Interest is always calculated on principal (non-compounding)
            const interest = p * (r / 100);
            const newTotal = Number(total_amount || p) + interest;
            const newRollover = (rollover_count || 0) + 1;

            const updateSql = `
                UPDATE loans
                SET total_amount = ?, last_interest_applied = ?, rollover_count = ?
                WHERE id = ?
            `;

            db.query(
                updateSql,
                [newTotal, today, newRollover, id],
                (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error(`Rollover update error for loan ${id}:`, updateErr);
                        return;
                    }

                    console.log(
                        `Loan ${id}: rollover applied. +${interest} added; total=${newTotal}; rollover_count=${newRollover}`
                    );

                    // WhatsApp + Email reminder (contacts optional; configure env fallbacks)
                    const whatsappTo = process.env.REMINDER_WHATSAPP_TO || null;
                    const emailTo = process.env.REMINDER_EMAIL_TO || null;
                    const message = `Reminder: Your loan of ${p} is overdue. If unpaid, another ${r}% interest will be added in ${d} days.`;
                    notify.sendReminder({ whatsappTo, emailTo, message });
                }
            );
        });
    });
});
