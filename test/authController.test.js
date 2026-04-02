const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");
const { loadWithMocks, resolveFrom } = require("./helpers/loadWithMocks");

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
}

function loadAuthController(overrides = {}) {
  const controllerPath = path.resolve(__dirname, "../server/controllers/authController.js");
  const notificationMock = {
    isEmailConfigured: () => true,
    sendEmail: async () => {},
    ...overrides.notificationService,
  };

  const mocks = {
    [resolveFrom(controllerPath, "../models/userModel")]: {
      create: (name, email, phone, passwordHash, role, callback) => callback(null, { insertId: 1 }),
      createVerificationToken: (userId, callback) =>
        callback(null, { token: "verification-token", expires: new Date("2030-01-01T00:00:00Z") }),
      verifyEmail: (token, callback) => callback(null, { id: 1 }),
      ...(overrides.userModel || {}),
    },
    [resolveFrom(controllerPath, "../config/db")]: {
      promise: () => ({
        query: async () => [[], []],
      }),
      ...(overrides.db || {}),
    },
    [resolveFrom(controllerPath, "../services/notificationService")]: notificationMock,
    [resolveFrom(controllerPath, "../services/authAttemptService")]: {
      clearFailedLogins: async () => {},
      getThrottleStatus: async () => ({ blocked: false, remaining: 5 }),
      recordFailedLogin: async () => ({ blocked: false, remaining: 4 }),
      ...(overrides.authAttemptService || {}),
    },
    [resolveFrom(controllerPath, "../services/authSessionService")]: {
      attachSessionCookie: () => {},
      clearSessionCookie: () => {},
      createSession: async () => ({
        token: "session-token",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        claims: { id: 1, role: "borrower" },
      }),
      normalizeUser: (user) => user,
      revokeAllSessionsForUser: async () => {},
      revokeSession: async () => {},
      ...(overrides.authSessionService || {}),
    },
    [resolveFrom(controllerPath, "../services/passwordService")]: {
      assertStrongPassword: () => {},
      hashPassword: async () => "hashed-password",
      verifyPassword: async () => true,
      ...(overrides.passwordService || {}),
    },
    [resolveFrom(controllerPath, "../config/auth")]: {
      buildPasswordResetUrl: () => "https://example.com/reset#token=token",
      buildVerificationUrl: () => "https://example.com/verify#token=token",
      getPasswordResetTtlMs: () => 15 * 60 * 1000,
      ...(overrides.authConfig || {}),
    },
  };

  return loadWithMocks(controllerPath, mocks);
}

test("register fails closed when email delivery is unavailable", async () => {
  const authController = loadAuthController({
    notificationService: {
      isEmailConfigured: () => false,
    },
  });
  const req = {
    validated: {
      name: "Borrower Example",
      email: "borrower@example.com",
      phone: "+265991234567",
      password: "StrongPassword123!",
    },
    body: {},
  };
  const res = createResponse();

  await authController.register(req, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    message: "Email delivery is currently unavailable. Please try again later.",
  });
});

test("requestPasswordReset fails closed when email delivery is unavailable", async () => {
  const authController = loadAuthController({
    notificationService: {
      isEmailConfigured: () => false,
    },
  });
  const req = {
    validated: {
      email: "borrower@example.com",
    },
    body: {},
  };
  const res = createResponse();

  await authController.requestPasswordReset(req, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    message: "Email delivery is currently unavailable. Please try again later.",
  });
});

test("login returns verified auth claims alongside the normalized user", async () => {
  let attachedToken = null;
  const authController = loadAuthController({
    db: {
      promise: () => ({
        query: async (sql) => {
          if (String(sql).includes("SELECT * FROM users WHERE email = ? LIMIT 1")) {
            return [[{
              id: 7,
              name: "Admin Example",
              email: "admin@example.com",
              phone: "+265991234567",
              role: "admin",
              email_verified: 1,
              verification_level: 3,
              phone_verified: 1,
              campus_verified: 1,
              password: "hashed-password",
            }]];
          }
          return [[], []];
        },
      }),
    },
    authSessionService: {
      attachSessionCookie: (_res, token) => {
        attachedToken = token;
      },
      createSession: async () => ({
        token: "session-token",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        claims: { id: 7, role: "admin" },
      }),
      normalizeUser: (user) => ({
        id: user.id,
        role: user.role,
        email: user.email,
      }),
    },
  });
  const req = {
    validated: {
      email: "admin@example.com",
      password: "StrongPassword123!",
    },
    body: {},
    ip: "127.0.0.1",
    get(name) {
      return name === "user-agent" ? "node-test" : undefined;
    },
  };
  const res = createResponse();

  await authController.login(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(attachedToken, "session-token");
  assert.deepEqual(res.body, {
    message: "Login successful",
    auth_claims: { id: 7, role: "admin" },
    session_expires_at: "2030-01-01T00:00:00.000Z",
    user: {
      id: 7,
      role: "admin",
      email: "admin@example.com",
    },
  });
});

test("me returns server-verified auth claims from the active session", async () => {
  const authController = loadAuthController({
    authSessionService: {
      normalizeUser: (user) => ({
        id: user.id,
        role: user.role,
        email: user.email,
      }),
    },
  });
  const req = {
    auth: {
      expiresAt: "2030-01-01T00:00:00Z",
      claims: { id: 5, role: "borrower" },
    },
    user: {
      id: 5,
      role: "borrower",
      email: "borrower@example.com",
    },
  };
  const res = createResponse();

  await authController.me(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    authenticated: true,
    auth_claims: { id: 5, role: "borrower" },
    session_expires_at: "2030-01-01T00:00:00.000Z",
    user: {
      id: 5,
      role: "borrower",
      email: "borrower@example.com",
    },
  });
});
