// Simple risk stub
function assessRisk(loan) {
  // Placeholder scoring: higher principal and rate => higher score
  const p = Number(loan?.principal || 0);
  const r = Number(loan?.rate || 0);
  const score = Math.min(100, Math.max(0, (p / 1000) + r));
  return { score, level: score > 70 ? "high" : score > 40 ? "medium" : "low" };
}

module.exports = { assessRisk };
