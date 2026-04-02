const authMiddleware = require("./authMiddleware");

function requireAdmin(req, res, next) {
  const enforceAdmin = () => {
    if ((req.user?.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admins only" });
    }
    return next();
  };

  if (req.user) {
    return enforceAdmin();
  }

  return authMiddleware(req, res, enforceAdmin);
}

module.exports = { requireAdmin };
