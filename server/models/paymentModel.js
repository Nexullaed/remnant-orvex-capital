const db = require("../config/db");

const Payment = {
  create: ({ loan_id, amount, method, reference }, cb) => {
    const sql = `INSERT INTO payments (loan_id, amount, method, reference, created_at) VALUES (?, ?, ?, ?, NOW())`;
    db.query(sql, [loan_id, amount, method || null, reference || null], cb);
  },
  findById: (id, cb) => {
    db.query("SELECT * FROM payments WHERE id = ? LIMIT 1", [id], (err, rows) => cb(err, rows?.[0]));
  },
  findByIdForUser: (id, userId, cb) => {
    db.query(
      `
        SELECT p.*
        FROM payments p
        INNER JOIN loans l ON l.id = p.loan_id
        WHERE p.id = ?
          AND l.user_id = ?
        LIMIT 1
      `,
      [id, userId],
      (err, rows) => cb(err, rows?.[0])
    );
  },
};

module.exports = Payment;
