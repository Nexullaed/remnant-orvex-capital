const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");
const { loadWithMocks, resolveFrom } = require("./helpers/loadWithMocks");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function loadLoanController(overrides = {}) {
  const controllerPath = path.resolve(__dirname, "../server/controllers/loanController.js");

  return loadWithMocks(controllerPath, {
    [resolveFrom(controllerPath, "../services/creditScoringService")]: {
      scoreLoan: () => ({ decision: "approve", score: 720 }),
      ...(overrides.creditScoringService || {}),
    },
    [resolveFrom(controllerPath, "../models/interestRuleModel")]: {
      findByDuration: async () => ({ rate: 10 }),
      ...(overrides.interestRuleModel || {}),
    },
    [resolveFrom(controllerPath, "../models/loanModel")]: {
      countActiveByUser: async () => 0,
      create: (payload, callback) => callback(null, { insertId: 101 }),
      ...(overrides.loanModel || {}),
    },
    [resolveFrom(controllerPath, "../services/accessControlService")]: {
      loadLoan: async () => null,
      ...(overrides.accessControlService || {}),
    },
  });
}

test("createLoan rejects users outside the required email domain", async () => {
  const originalDomain = process.env.LOAN_EMAIL_DOMAIN;
  process.env.LOAN_EMAIL_DOMAIN = "my.mzuni.ac.mw";

  try {
    const loanController = loadLoanController();
    const req = {
      body: { principal: 12000, duration_days: 7 },
      user: {
        id: 1,
        email: "borrower@example.com",
        verification_level: 3,
        phone: "+265991234567",
      },
    };
    const res = createResponse();

    await loanController.createLoan(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      message: "A @my.mzuni.ac.mw email is required to apply for a loan",
    });
  } finally {
    if (originalDomain === undefined) {
      delete process.env.LOAN_EMAIL_DOMAIN;
    } else {
      process.env.LOAN_EMAIL_DOMAIN = originalDomain;
    }
  }
});

test("createLoan rejects lookalike subdomains that only end with the allowed suffix", async () => {
  const originalDomain = process.env.LOAN_EMAIL_DOMAIN;
  process.env.LOAN_EMAIL_DOMAIN = "my.mzuni.ac.mw";

  try {
    const loanController = loadLoanController();
    const req = {
      body: { principal: 12000, duration_days: 7 },
      user: {
        id: 1,
        email: "borrower@notmy.mzuni.ac.mw",
        verification_level: 3,
        phone: "+265991234567",
      },
    };
    const res = createResponse();

    await loanController.createLoan(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      message: "A @my.mzuni.ac.mw email is required to apply for a loan",
    });
  } finally {
    if (originalDomain === undefined) {
      delete process.env.LOAN_EMAIL_DOMAIN;
    } else {
      process.env.LOAN_EMAIL_DOMAIN = originalDomain;
    }
  }
});

test("createLoan rejects users below the minimum verification level", async () => {
  const originalDomain = process.env.LOAN_EMAIL_DOMAIN;
  const originalMinLevel = process.env.MIN_VERIFICATION_LEVEL;
  process.env.LOAN_EMAIL_DOMAIN = "my.mzuni.ac.mw";
  process.env.MIN_VERIFICATION_LEVEL = "2";

  try {
    const loanController = loadLoanController();
    const req = {
      body: { principal: 12000, duration_days: 7 },
      user: {
        id: 1,
        email: "borrower@my.mzuni.ac.mw",
        verification_level: 1,
        phone: "+265991234567",
      },
    };
    const res = createResponse();

    await loanController.createLoan(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, {
      message: "Verification level 2 required to request a loan",
    });
  } finally {
    if (originalDomain === undefined) {
      delete process.env.LOAN_EMAIL_DOMAIN;
    } else {
      process.env.LOAN_EMAIL_DOMAIN = originalDomain;
    }

    if (originalMinLevel === undefined) {
      delete process.env.MIN_VERIFICATION_LEVEL;
    } else {
      process.env.MIN_VERIFICATION_LEVEL = originalMinLevel;
    }
  }
});

test("createLoan records a valid loan request for eligible borrowers", async () => {
  const originalDomain = process.env.LOAN_EMAIL_DOMAIN;
  const originalMinLevel = process.env.MIN_VERIFICATION_LEVEL;
  process.env.LOAN_EMAIL_DOMAIN = "my.mzuni.ac.mw";
  process.env.MIN_VERIFICATION_LEVEL = "2";

  try {
    let createdPayload = null;
    const loanController = loadLoanController({
      interestRuleModel: {
        findByDuration: async () => ({ rate: 15 }),
      },
      loanModel: {
        countActiveByUser: async () => 0,
        create: (payload, callback) => {
          createdPayload = payload;
          callback(null, { insertId: 501 });
        },
      },
    });
    const req = {
      body: { principal: 15000, duration_days: 7 },
      user: {
        id: 7,
        email: "borrower@my.mzuni.ac.mw",
        verification_level: 3,
        phone: "+265991234567",
      },
    };
    const res = createResponse();

    await loanController.createLoan(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.user_id, 7);
    assert.equal(createdPayload.total_amount, 17250);
    assert.deepEqual(res.body, {
      message: "Loan request recorded (pending approval)",
      loan_id: 501,
      principal: 15000,
      rate: 15,
      interest: 2250,
      total: 17250,
      duration_days: 7,
      status: "PENDING",
      due_date: createdPayload.due_date,
      score: 720,
      decision: "approve",
    });
  } finally {
    if (originalDomain === undefined) {
      delete process.env.LOAN_EMAIL_DOMAIN;
    } else {
      process.env.LOAN_EMAIL_DOMAIN = originalDomain;
    }

    if (originalMinLevel === undefined) {
      delete process.env.MIN_VERIFICATION_LEVEL;
    } else {
      process.env.MIN_VERIFICATION_LEVEL = originalMinLevel;
    }
  }
});
