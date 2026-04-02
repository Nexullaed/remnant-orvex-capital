// Interest calculations centralized here
function calculateSimpleInterest(principal, rate) {
  const p = Number(principal);
  const r = Number(rate);
  if (!Number.isFinite(p) || !Number.isFinite(r)) {
    throw new Error("Invalid principal or rate");
  }
  const interest = p * (r / 100);
  const total = p + interest;
  return { interest, total };
}

module.exports = { calculateSimpleInterest };
