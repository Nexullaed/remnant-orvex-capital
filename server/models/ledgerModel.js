const db = require("../config/db");

const allowedTypes = [
  "loan_disbursement",
  "payment_received",
  "interest_added",
  "rollover_extension",
  "default_marking"
];

const Ledger = {
  record: (data, cb) => {
    const { loan_id, amount, type, metadata } = data;
    if (!allowedTypes.includes(type)) {
      return cb(new Error(`Invalid ledger type: ${type}`));
    }
    const sql = `
      INSERT INTO ledger_transactions (loan_id, amount, type, metadata, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `;
    db.query(sql, [loan_id, amount ?? 0, type, JSON.stringify(metadata || {})], cb);
  },

  findByLoan: (loan_id, cb) => {
    db.query(
      "SELECT * FROM ledger_transactions WHERE loan_id = ? ORDER BY created_at ASC, id ASC",
      [loan_id],
      cb
    );
  },
};

module.exports = Ledger;
