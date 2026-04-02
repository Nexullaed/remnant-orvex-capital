const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function safePdfText(value, fallback = "N/A") {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 200);
}

function renderPdf(filePath, renderDocument) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    let settled = false;

    const fail = (err) => {
      if (settled) {
        return;
      }
      settled = true;
      fs.unlink(filePath, () => reject(err));
    };

    stream.on("finish", () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ filePath, filename: path.basename(filePath) });
    });
    stream.on("error", fail);
    doc.on("error", fail);

    doc.pipe(stream);
    renderDocument(doc);
    doc.end();
  });
}

async function generateLoanAgreement({ loanId, user, principal, rate, duration_days, interest, total }) {
  const baseDir = path.resolve(__dirname, "..", "..", "uploads", "contracts");
  ensureDir(baseDir);

  const filename = `loan-${loanId || Date.now()}.pdf`;
  const filePath = path.join(baseDir, filename);

  return renderPdf(filePath, (doc) => {
    doc.fontSize(18).text("Loan Agreement", { align: "center" }).moveDown();
    doc.fontSize(12).text(`Loan ID: ${safePdfText(loanId)}`);
    doc.text(`Borrower: ${safePdfText(user?.email || user?.name)}`);
    doc.text(`Principal: ${safePdfText(principal)}`);
    doc.text(`Rate: ${safePdfText(rate)}%`);
    doc.text(`Duration: ${safePdfText(duration_days)} days`);
    doc.text(`Interest: ${safePdfText(interest)}`);
    doc.text(`Total Payable: ${safePdfText(total)}`);
    doc.moveDown();
    doc.text("By accepting this loan, the borrower agrees to the terms and repayment schedule provided by Remnant Orvex Capital.");
    doc.moveDown();
    doc.text(`Date: ${new Date().toISOString()}`);
  });
}

async function generatePaymentReceipt({ paymentId, loanId, user, amount, balanceAfter }) {
  const baseDir = path.resolve(__dirname, "..", "..", "uploads", "contracts");
  ensureDir(baseDir);

  const filename = `receipt-${paymentId || loanId || Date.now()}.pdf`;
  const filePath = path.join(baseDir, filename);

  return renderPdf(filePath, (doc) => {
    doc.fontSize(18).text("Payment Receipt", { align: "center" }).moveDown();
    doc.fontSize(12).text(`Payment ID: ${safePdfText(paymentId)}`);
    doc.text(`Loan ID: ${safePdfText(loanId)}`);
    doc.text(`Payer: ${safePdfText(user?.email || user?.name)}`);
    doc.text(`Amount Paid: ${safePdfText(amount)}`);
    if (balanceAfter !== undefined) {
      doc.text(`Balance After Payment: ${safePdfText(balanceAfter)}`);
    }
    doc.moveDown();
    doc.text(`Date: ${new Date().toISOString()}`);
  });
}

module.exports = { generateLoanAgreement, generatePaymentReceipt };
