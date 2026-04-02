// Provider-agnostic KYC facade (Onfido / Sumsub / Jumio placeholders)

async function createCheck({ userId, provider, documentType, documentImages, selfie }) {
  // TODO: call chosen provider SDK/API here
  return { check_id: `mock-${Date.now()}`, status: "pending", provider: provider || "mock" };
}

async function pollCheck({ checkId, provider }) {
  // TODO: poll provider for real status
  return { check_id: checkId, status: "pending", provider: provider || "mock" };
}

module.exports = { createCheck, pollCheck };
