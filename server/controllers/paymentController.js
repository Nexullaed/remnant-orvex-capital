const fs = require("fs");
const { loadPayment, normalizeId } = require("../services/accessControlService");
const { processLoanPayment, getPaymentReceiptFilePath } = require("../services/paymentService");

const makePayment = async (req, res) => {
  try {
    const result = await processLoanPayment({
      actor: req.user,
      loanId: req.body?.loan_id,
      amount: req.body?.amount,
      method: req.body?.method,
      reference: req.body?.reference,
      receipt: req.body?.receipt,
      idempotencyKey: req.get("Idempotency-Key"),
    });

    return res.json({
      message: "Payment recorded",
      payment_id: result.paymentId,
      balance: result.balance,
      status: result.status,
      receipt_url: result.receiptUrl,
      replayed: Boolean(result.replayed),
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }

    return res.status(500).json({ error: err.message || err });
  }
};

const downloadReceipt = async (req, res) => {
  const paymentId = normalizeId(req.params?.id);
  if (!paymentId) {
    return res.status(400).json({ message: "Invalid payment id" });
  }

  try {
    const payment = await loadPayment(paymentId, req.user);
    if (!payment) {
      return res.status(404).json({ message: "Not found" });
    }

    const receiptPath = getPaymentReceiptFilePath(paymentId);
    if (!fs.existsSync(receiptPath)) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    return res.sendFile(receiptPath, (sendErr) => {
      if (sendErr) {
        return res.status(500).json({ error: sendErr.message || sendErr });
      }
      return undefined;
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || err });
  }
};

module.exports = { downloadReceipt, makePayment };
