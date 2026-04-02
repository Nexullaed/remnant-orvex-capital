// Simple credit scoring service stub
// Inputs: user profile and loan request; Output: score and decision guidance.
function scoreLoan({ user, loan }) {
  // Basic heuristic: start score at 50
  let score = 50;

  // Boost for verification level
  const level = Number(user?.verification_level || 0);
  score += Math.min(30, level * 10); // up to +30

  // Penalize for high principal relative to heuristic threshold
  const principal = Number(loan?.principal || 0);
  if (principal > 0) {
    const ratioPenalty = Math.min(30, Math.max(0, (principal - 20000) / 1000));
    score -= ratioPenalty;
  }

  // Penalize high rate requests
  const rate = Number(loan?.rate || 0);
  if (rate > 0) {
    score -= Math.min(10, rate / 2);
  }

  // Ensure bounds
  score = Math.max(0, Math.min(100, score));

  // Decision guidance
  const decision = score >= 60 ? "approve" : score >= 45 ? "review" : "reject";

  return { score, decision };
}

module.exports = { scoreLoan };
