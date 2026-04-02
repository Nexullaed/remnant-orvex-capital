const { extractSessionToken } = require("../config/auth");
const { verifySessionToken } = require("../services/authSessionService");

const authMiddleware = async (req, res, next) => {
  const token = extractSessionToken(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const session = await verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ message: "Invalid or expired session" });
    }

    req.user = session.user;
    req.auth = session.session;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
};

module.exports = authMiddleware;
