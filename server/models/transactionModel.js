const db = require("../config/db");

const allowedTypes = ["loan_disbursement", "repayment", "interest_added"];

const Transaction = {
  create: (data, cb) => {
    const { loan_id, amount, type } = data;
    if (!allowedTypes.includes(type)) {
      return cb(new Error(`Invalid transaction type: ${type}`));
    }
    const sql = `INSERT INTO transactions (loan_id, amount, type, created_at) VALUES (?, ?, ?, NOW())`;
    db.query(sql, [loan_id, amount, type], cb);
  },
  findByLoan: (loan_id, cb) => {
    db.query("SELECT * FROM transactions WHERE loan_id = ? ORDER BY created_at ASC", [loan_id], cb);
  },
};

module.exports = Transaction;
