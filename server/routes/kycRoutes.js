const crypto = require("crypto");
const express = require("express");
const kycService = require("../services/kycService");
const User = require("../models/userModel");
const authMiddleware = require("../middleware/authMiddleware");
const { generalLimiter } = require("../middleware/rateLimitMiddleware");
const { kycCreateCheckSchema, kycWebhookSchema, validate } = require("../middleware/validationSchemas");
const { canAccessUser, normalizeId } = require("../services/accessControlService");

const router = express.Router();

function hasValidWebhookSecret(req) {
  const configuredSecret = String(process.env.KYC_WEBHOOK_SECRET || "");
  if (!configuredSecret) {
    return false;
  }

  const providedSecret = String(req.get("x-kyc-webhook-secret") || "");
  const configuredBuffer = Buffer.from(configuredSecret);
  const providedBuffer = Buffer.from(providedSecret);

  if (configuredBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(configuredBuffer, providedBuffer);
}

function verifyKycWebhookSecret(req, res, next) {
  if (!hasValidWebhookSecret(req)) {
    return res.sendStatus(401);
  }

  return next();
}

router.post("/webhook", verifyKycWebhookSecret, validate(kycWebhookSchema), async (req, res) => {
  try {
    const userId = normalizeId(req.body?.userId);
    const provider = String(req.body?.provider || "").trim();
    const status = String(req.body?.status || "").trim().toLowerCase();
    const check_id = String(req.body?.check_id || "").trim();

    if (!userId || !provider || !status) return res.sendStatus(400);

    const level = status === "approved" || status === "verified" ? 2 : 0;

    await new Promise((resolve, reject) =>
      User.updateVerification(
        userId,
        {
          providerRef: check_id || null,
          status,
          level,
          timestamp: new Date(),
        },
        (err) => (err ? reject(err) : resolve())
      )
    );

    return res.sendStatus(200);
  } catch (err) {
    console.error("KYC webhook error", err);
    return res.sendStatus(500);
  }
});

router.post(
  "/create-check",
  generalLimiter,
  authMiddleware,
  validate(kycCreateCheckSchema),
  async (req, res) => {
    const requestedUserId = normalizeId(req.validated?.userId ?? req.user?.id);
    if (!requestedUserId) {
      return res.status(400).json({ message: "Valid userId required" });
    }

    if (!canAccessUser(req.user, requestedUserId)) {
      return res.status(404).json({ message: "Not found" });
    }

    try {
      const result = await kycService.createCheck({
        userId: requestedUserId,
        provider: req.validated?.provider,
        documentType: req.validated?.documentType,
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
