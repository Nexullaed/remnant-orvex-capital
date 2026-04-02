const fs = require("fs");
const { z } = require("zod");

function removeControlCharacters(value) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ");
}

function normalizeSingleLineText(value) {
  return removeControlCharacters(value).replace(/\s+/g, " ").trim();
}

function hasUnsafeMarkup(value) {
  return /[<>]/.test(value) || /\bjavascript\s*:/i.test(value);
}

function toOptionalString(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = normalizeSingleLineText(value);
  return normalized === "" ? undefined : normalized;
}

function cleanupUploadedFiles(req) {
  const filePaths = new Set();

  if (req.file?.path) {
    filePaths.add(req.file.path);
  }

  if (Array.isArray(req.files)) {
    for (const file of req.files) {
      if (file?.path) filePaths.add(file.path);
    }
  } else if (req.files && typeof req.files === "object") {
    for (const value of Object.values(req.files)) {
      const items = Array.isArray(value) ? value : [value];
      for (const file of items) {
        if (file?.path) filePaths.add(file.path);
      }
    }
  }

  for (const filePath of filePaths) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }
  }
}

function safeTextSchema({ field, min = 1, max = 100, pattern }) {
  return z
    .string()
    .transform(normalizeSingleLineText)
    .refine((value) => value.length >= min, `${field} is required`)
    .refine((value) => value.length <= max, `${field} must be at most ${max} characters`)
    .refine((value) => !hasUnsafeMarkup(value), `${field} contains unsafe characters`)
    .refine((value) => !pattern || pattern.test(value), `${field} format is invalid`);
}

function optionalSafeTextSchema(options) {
  return z.preprocess(
    toOptionalString,
    safeTextSchema(options).optional()
  );
}

const safeEmailSchema = z.preprocess(
  (value) => normalizeSingleLineText(value).toLowerCase(),
  z.string().max(254, "Email must be at most 254 characters").email("Email format is invalid")
);

const safePhoneSchema = z.preprocess(
  normalizeSingleLineText,
  z.string().regex(/^\+?[0-9]{6,20}$/, "Phone format is invalid")
);

const strongPasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters long")
  .max(128, "Password must not exceed 128 characters")
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), "Password contains invalid control characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/\d/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

const strictPositiveIntSchema = z.coerce.number().int().positive();
const moneyAmountSchema = z
  .coerce
  .number()
  .finite("Amount must be a valid number")
  .positive("Amount must be greater than zero")
  .max(1000000000, "Amount exceeds the allowed maximum")
  .refine((value) => Number.isInteger(value * 100), "Amount must have at most 2 decimal places");

const optionalBooleanSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = normalizeSingleLineText(value).toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return value;
}, z.boolean().optional());

const secureHexTokenSchema = z.preprocess(
  (value) => normalizeSingleLineText(value).toLowerCase(),
  z.string().regex(/^[a-f0-9]{64}$/, "Token format is invalid")
);

const registerSchema = z.object({
  name: safeTextSchema({
    field: "Name",
    min: 1,
    max: 100,
    pattern: /^[A-Za-z][A-Za-z .'-]{0,99}$/,
  }),
  email: safeEmailSchema,
  phone: safePhoneSchema,
  password: strongPasswordSchema,
}).strict();

const loginSchema = z.object({
  email: safeEmailSchema,
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password must not exceed 128 characters")
    .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), "Password contains invalid control characters"),
}).strict();

const otpRequestSchema = z.object({
  phone: safePhoneSchema,
}).strict();

const otpVerifySchema = z.object({
  phone: safePhoneSchema,
  code: z.preprocess(
    normalizeSingleLineText,
    z.string().regex(/^[0-9]{4,10}$/, "OTP code format is invalid")
  ),
}).strict();

const passwordResetRequestSchema = z.object({
  email: safeEmailSchema,
}).strict();

const passwordResetConfirmSchema = z.object({
  token: secureHexTokenSchema,
  password: strongPasswordSchema,
}).strict();

const resendVerificationSchema = z.object({
  email: safeEmailSchema,
}).strict();

const verifyEmailQuerySchema = z.object({
  token: secureHexTokenSchema,
}).strict();

const verifyEmailBodySchema = z.object({
  token: secureHexTokenSchema,
}).strict();

const loanCreateSchema = z.object({
  principal: moneyAmountSchema,
  duration_days: z.coerce.number().int().min(1, "Duration must be at least 1 day").max(365, "Duration is too long"),
}).strict();

const paymentSchema = z.object({
  loan_id: strictPositiveIntSchema,
  amount: moneyAmountSchema,
  method: optionalSafeTextSchema({
    field: "Payment method",
    min: 2,
    max: 40,
    pattern: /^[A-Za-z0-9 _.-]+$/,
  }),
  reference: optionalSafeTextSchema({
    field: "Payment reference",
    min: 2,
    max: 100,
    pattern: /^[A-Za-z0-9 _.-]+$/,
  }),
  receipt: optionalBooleanSchema,
}).strict();

const collateralSchema = z.object({
  loan_id: strictPositiveIntSchema,
  item_type: safeTextSchema({
    field: "Collateral item type",
    min: 1,
    max: 60,
    pattern: /^[A-Za-z0-9 .,_-]+$/,
  }),
  description: optionalSafeTextSchema({
    field: "Collateral description",
    min: 2,
    max: 500,
    pattern: /^[A-Za-z0-9 .,_'"/()#&:+-]+$/,
  }),
}).strict();

const kycCreateCheckSchema = z.object({
  userId: strictPositiveIntSchema.optional(),
  provider: optionalSafeTextSchema({
    field: "KYC provider",
    min: 2,
    max: 50,
    pattern: /^[A-Za-z0-9 _.-]+$/,
  }),
  documentType: optionalSafeTextSchema({
    field: "Document type",
    min: 2,
    max: 50,
    pattern: /^[A-Za-z0-9 _.-]+$/,
  }),
}).strict();

const kycWebhookSchema = z.object({
  userId: strictPositiveIntSchema,
  provider: safeTextSchema({
    field: "Provider",
    min: 2,
    max: 50,
    pattern: /^[A-Za-z0-9 _.-]+$/,
  }),
  status: safeTextSchema({
    field: "Status",
    min: 2,
    max: 32,
    pattern: /^[A-Za-z0-9 _.-]+$/,
  }),
  check_id: optionalSafeTextSchema({
    field: "Check id",
    min: 2,
    max: 100,
    pattern: /^[A-Za-z0-9 _.:/-]+$/,
  }),
}).strict();

const idParamSchema = z.object({
  id: strictPositiveIntSchema,
}).strict();

const loanIdParamSchema = z.object({
  loanId: strictPositiveIntSchema,
}).strict();

const userIdParamSchema = z.object({
  userId: strictPositiveIntSchema,
}).strict();

const campusVerificationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
}).strict();

function validate(schema, source = "body", target = "validated") {
  return (req, res, next) => {
    const parseResult = schema.safeParse(req[source]);
    if (!parseResult.success) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        message: "Validation failed",
        errors: parseResult.error.issues,
      });
    }

    req[source] = parseResult.data;
    req[target] = parseResult.data;
    return next();
  };
}

function validateParams(schema) {
  return validate(schema, "params", "validatedParams");
}

function validateQuery(schema) {
  return validate(schema, "query", "validatedQuery");
}

module.exports = {
  campusVerificationSchema,
  collateralSchema,
  idParamSchema,
  kycCreateCheckSchema,
  kycWebhookSchema,
  loanCreateSchema,
  loanIdParamSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  paymentSchema,
  registerSchema,
  resendVerificationSchema,
  userIdParamSchema,
  validate,
  validateParams,
  validateQuery,
  verifyEmailBodySchema,
  verifyEmailQuerySchema,
};
