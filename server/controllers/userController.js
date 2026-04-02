const db = require("../config/db");

const getUserProfile = (req, res) => {
  const userId = req.params.id;
  db.query(
    "SELECT id, name, email, phone, credit_score, successful_loans, defaulted_loans FROM users WHERE id = ?",
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message || err });
      if (!rows || !rows.length) return res.status(404).json({ message: "User not found" });
      return res.json(rows[0]);
    }
  );
};

module.exports = { getUserProfile };
