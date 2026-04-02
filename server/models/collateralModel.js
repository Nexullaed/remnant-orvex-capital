const db = require("../config/db");

const Collateral = {
  create: ({ loan_id, item_type, description, file_path }, cb) => {
    const sql = `
      INSERT INTO collateral (loan_id, item_type, description, file_path, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `;
    db.query(sql, [loan_id, item_type, description || null, file_path], cb);
  },

  listByLoan: (loanId, cb) => {
    db.query(
      "SELECT id, loan_id, item_type, description, created_at FROM collateral WHERE loan_id = ? ORDER BY id DESC",
      [loanId],
      cb
    );
  },
  listByLoanForUser: (loanId, userId, cb) => {
    db.query(
      `
        SELECT c.id, c.loan_id, c.item_type, c.description, c.created_at
        FROM collateral c
        INNER JOIN loans l ON l.id = c.loan_id
        WHERE c.loan_id = ?
          AND l.user_id = ?
        ORDER BY c.id DESC
      `,
      [loanId, userId],
      cb
    );
  },

  findById: (id, cb) => {
    db.query("SELECT * FROM collateral WHERE id = ?", [id], (err, rows) => cb(err, rows?.[0]));
  },
  findByIdForUser: (id, userId, cb) => {
    db.query(
      `
        SELECT c.*
        FROM collateral c
        INNER JOIN loans l ON l.id = c.loan_id
        WHERE c.id = ?
          AND l.user_id = ?
        LIMIT 1
      `,
      [id, userId],
      (err, rows) => cb(err, rows?.[0])
    );
  },
};

module.exports = Collateral;
