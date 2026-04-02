const db = require("../config/db");

exports.calculateCapital = async () => {
  // Sum principal for deployed capital (active or defaulted loans)
  const [capitalLoans] = await db.promise().query(
    "SELECT SUM(principal) AS deployed FROM loans WHERE status IN ('ACTIVE','DEFAULTED')"
  );

  const [payments] = await db.promise().query(
    "SELECT SUM(amount) AS returned FROM payments"
  );

  const totalCapital = payments[0].returned || 0;
  const deployed = capitalLoans[0].deployed || 0;

  const reserve = totalCapital * 0.30;
  const available = totalCapital - reserve - deployed;

  return {
    totalCapital,
    reserve,
    availableCapital: available,
  };
};
