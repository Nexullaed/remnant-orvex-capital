const express = require("express");
const authController = require("../controllers/authController");
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");
const { issueOtp, verifyOtp } = require("../services/otpService");
const notification = require("../services/notificationService");
const User = require("../models/userModel");
const {
  loginLimiter,
  otpLimiter,
  passwordResetConfirmLimiter,
  passwordResetRequestLimiter,
  registerLimiter,
  verificationLimiter,
} = require("../middleware/rateLimitMiddleware");
const {
  campusVerificationSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  resendVerificationSchema,
  userIdParamSchema,
  validate,
  validateParams,
  validateQuery,
  verifyEmailBodySchema,
  verifyEmailQuerySchema,
} = require("../middleware/validationSchemas");
const { requireAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/register", registerLimiter, validate(registerSchema), authController.register);
router.post("/login", loginLimiter, validate(loginSchema), authController.login);
router.post("/logout", authMiddleware, authController.logout);
router.get("/me", authMiddleware, authController.me);
router.post(
  "/reset/request",
  passwordResetRequestLimiter,
  validate(passwordResetRequestSchema),
  authController.requestPasswordReset
);
router.post(
  "/reset/confirm",
  passwordResetConfirmLimiter,
  validate(passwordResetConfirmSchema),
  authController.resetPassword
);
router.post("/verify-email", verificationLimiter, validate(verifyEmailBodySchema), authController.verifyEmail);
router.get("/verify-email", verificationLimiter, validateQuery(verifyEmailQuerySchema), authController.verifyEmail);
router.post(
  "/verify-email/resend",
  verificationLimiter,
  validate(resendVerificationSchema),
  authController.resendVerificationEmail
);

router.post("/otp/request", otpLimiter, validate(otpRequestSchema), async (req, res) => {
  const { phone } = req.validated;
  if (!notification.isSmsConfigured()) {
    return res.status(503).json({ message: "OTP delivery is currently unavailable" });
  }
  try {
    const code = await issueOtp(phone);
    await notification.sendSMS(phone, `Your verification code is ${code}`);
    return res.json({ message: "OTP sent" });
  } catch (err) {
    return res.status(500).json({ message: "Unable to send OTP right now" });
  }
});

router.post("/otp/verify", otpLimiter, validate(otpVerifySchema), async (req, res) => {
  const { phone, code } = req.validated;
  const ok = await verifyOtp(phone, code);
  if (!ok) return res.status(400).json({ message: "Invalid or expired code" });

  User.markPhoneVerified(phone, 1, (err) => {
    if (err) return res.status(500).json({ error: err.message || err });
    res.json({ message: "Phone verified", verification_level: 1 });
  });
});

router.post(
  "/campus-verify/:userId",
  authMiddleware,
  requireAdmin,
  validateParams(userIdParamSchema),
  validate(campusVerificationSchema),
  adminController.updateCampusVerification
);

router.get("/status", (req, res) => {
  res.json({ status: "ok" });
});

module.exports = router;
