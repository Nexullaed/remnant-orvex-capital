const africastalking = require("africastalking");

let smsClient = null;
if (process.env.AT_API_KEY && process.env.AT_USERNAME) {
  const at = africastalking({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
  smsClient = at.SMS;
}

async function sendSMS(to, message) {
  if (!smsClient || !to) {
    console.log("smsService: skipped (missing client or recipient)");
    return;
  }
  await smsClient.send({ to, message, from: process.env.AT_SENDER_ID });
}

async function sendLoanNotification(loan) {
  const to = process.env.LOAN_NOTIFY_PHONE;
  const msg = `New loan request: ${loan.principal} from user ${loan.user_id || 'N/A'} (rate ${loan.rate}%, duration ${loan.duration_days}d, id ${loan.loanId || loan.loan_id || 'N/A'})`;
  await sendSMS(to, msg);
}

async function sendBorrowerApprovalSMS(loan) {
  if (!loan?.phone) return;
  const msg = `Loan Approved:\nAmount: MWK ${loan.principal}\nTotal Repay: MWK ${loan.total_amount}\nDue Date: ${loan.due_date}\n- Remnant Orvex Capital`;
  await sendSMS(loan.phone, msg);
}

module.exports = { sendSMS, sendLoanNotification, sendBorrowerApprovalSMS };
