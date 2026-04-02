const db = require("../config/db");

const InterestRule = {
  findByDuration: (duration_days) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM interest_rules WHERE duration_days = ? LIMIT 1",
        [duration_days],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows && rows[0] ? rows[0] : null);
        }
      );
    });
  },
};

module.exports = InterestRule;
