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

test("makePayment returns receipt_url and forwards the idempotency key", async () => {
  const controllerPath = path.resolve(__dirname, "../server/controllers/paymentController.js");
  const serviceCalls = [];
  const paymentController = loadWithMocks(controllerPath, {
    [resolveFrom(controllerPath, "../services/accessControlService")]: {
      loadPayment: async () => null,
      normalizeId: (value) => Number(value),
    },
    [resolveFrom(controllerPath, "../services/paymentService")]: {
      processLoanPayment: async (payload) => {
        serviceCalls.push(payload);
        return {
          paymentId: 44,
          balance: 0,
          status: "COMPLETED",
          receiptUrl: "/api/payments/44/receipt",
          replayed: false,
        };
      },
      getPaymentReceiptFilePath: () => "X:\\receipts\\44.pdf",
    },
  });

  const req = {
    user: { id: 10, role: "borrower" },
    body: {
      loan_id: 9,
      amount: 15000,
      method: "bank",
      reference: "bank-ref-1",
      receipt: "receipt-placeholder",
    },
    get(name) {
      return name === "Idempotency-Key" ? "idem-1234567890" : undefined;
    },
  };
  const res = createResponse();

  await paymentController.makePayment(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].idempotencyKey, "idem-1234567890");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    message: "Payment recorded",
    payment_id: 44,
    balance: 0,
    status: "COMPLETED",
    receipt_url: "/api/payments/44/receipt",
    replayed: false,
  });
  assert.equal("receipt_path" in res.body, false);
});
