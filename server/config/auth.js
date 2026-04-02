function getPositiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER, name = "value" } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  const normalized = Math.floor(parsed);
  if (normalized < min || normalized > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }

  return normalized;
}

function getBooleanEnv(name, fallback = false) {
  const normalized = String(process.env[name] || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be a boolean value.`);
}

function isLocalHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch (_) {
    return false;
  }
}

function getCanonicalUrl(name, { required = false } = {}) {
  const value = String(process.env[name] || "").trim().replace(/\/+$/, "");
  if (!value) {
    if (required) {
      throw new Error(`${name} must be configured.`);
    }
    return "";
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${name} must use http or https.`);
  }

  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:" && !isLocalHttpUrl(value)) {
    throw new Error(`${name} must use https in production.`);
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long.");
  }
  return secret;
}

function getBcryptRounds() {
  return getPositiveInteger(process.env.BCRYPT_ROUNDS, 12, {
    min: 10,
    max: 15,
    name: "BCRYPT_ROUNDS",
  });
}

function getSessionTtlMs() {
  return getPositiveInteger(process.env.SESSION_TTL_MINUTES, 60, {
    min: 15,
    max: 24 * 60,
    name: "SESSION_TTL_MINUTES",
  }) * 60 * 1000;
}

function getEmailVerificationTtlMs() {
  return getPositiveInteger(process.env.EMAIL_VERIFICATION_TTL_MINUTES, 15, {
    min: 5,
    max: 15,
    name: "EMAIL_VERIFICATION_TTL_MINUTES",
  }) * 60 * 1000;
}

function getPasswordResetTtlMs() {
  return getPositiveInteger(process.env.PASSWORD_RESET_TTL_MINUTES, 15, {
    min: 5,
    max: 15,
    name: "PASSWORD_RESET_TTL_MINUTES",
  }) * 60 * 1000;
}

function getCookieName() {
  return String(process.env.AUTH_COOKIE_NAME || "roc_session").trim() || "roc_session";
}

function getSameSite() {
  const sameSite = String(process.env.AUTH_COOKIE_SAME_SITE || "strict").trim().toLowerCase();
  if (["lax", "strict", "none"].includes(sameSite)) {
    return sameSite;
  }
  return "strict";
}

function shouldUseSecureCookies(req) {
  const override = String(process.env.AUTH_COOKIE_SECURE || "").trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;

  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  return process.env.NODE_ENV === "production" || req?.secure || forwardedProto === "https";
}

function getSessionCookieOptions(req) {
  const sameSite = getSameSite();
  const secure = sameSite === "none" ? true : shouldUseSecureCookies(req);

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: "/",
    maxAge: getSessionTtlMs(),
  };
}

function getClearedSessionCookieOptions(req) {
  const { httpOnly, sameSite, secure, path } = getSessionCookieOptions(req);
  return { httpOnly, sameSite, secure, path };
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, pair) => {
    const trimmed = pair.trim();
    if (!trimmed) return cookies;

    const separatorIndex = trimmed.indexOf("=");
    const name = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? "" : trimmed.slice(separatorIndex + 1);

    if (!name) return cookies;

    cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function extractSessionToken(req) {
  const cookies = parseCookies(req?.headers?.cookie || "");
  const cookieToken = cookies[getCookieName()];
  if (cookieToken) return cookieToken;

  const authHeader = String(req?.headers?.authorization || "");
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return null;
}

function appendTokenHashUrl(baseUrl, path, token) {
  const normalizedBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  const normalizedPath = String(path || "").trim();
  if (!normalizedBase || !normalizedPath) {
    throw new Error("A canonical public URL is required to build auth links.");
  }

  const url = new URL(normalizedPath, `${normalizedBase}/`);
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

function getPublicApiUrl() {
  return getCanonicalUrl("PUBLIC_API_URL", { required: false });
}

function buildVerificationUrl(_req, token) {
  return appendTokenHashUrl(getCanonicalUrl("PUBLIC_API_URL", { required: true }), "/client/verify-email.html", token);
}

function buildPasswordResetUrl(_req, token) {
  return appendTokenHashUrl(getCanonicalUrl("PUBLIC_API_URL", { required: true }), "/client/reset-password.html", token);
}

function assertAuthConfiguration() {
  getJwtSecret();
  getSessionTtlMs();
  getEmailVerificationTtlMs();
  getPasswordResetTtlMs();

  const sameSite = getSameSite();
  const secureCookies = shouldUseSecureCookies();
  if (sameSite === "none" && !secureCookies) {
    throw new Error("AUTH_COOKIE_SAME_SITE=none requires secure cookies.");
  }

  const smtpConfigured = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"].some((name) =>
    String(process.env[name] || "").trim()
  );
  if (smtpConfigured) {
    ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"].forEach((name) => {
      if (!String(process.env[name] || "").trim()) {
        throw new Error(`${name} must be configured when SMTP is enabled.`);
      }
    });
    getCanonicalUrl("PUBLIC_API_URL", { required: true });
    getBooleanEnv("SMTP_SECURE", Number(process.env.SMTP_PORT || 0) === 465);
  }

  if (String(process.env.PUBLIC_API_URL || "").trim()) {
    getCanonicalUrl("PUBLIC_API_URL", { required: true });
  }
}

module.exports = {
  assertAuthConfiguration,
  buildPasswordResetUrl,
  buildVerificationUrl,
  extractSessionToken,
  getBcryptRounds,
  getClearedSessionCookieOptions,
  getCookieName,
  getEmailVerificationTtlMs,
  getJwtSecret,
  getPasswordResetTtlMs,
  getPublicApiUrl,
  getSessionCookieOptions,
  getSessionTtlMs,
};
