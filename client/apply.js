function setStatus(message, tone = "muted") {
  const status = document.getElementById("form-status");
  status.textContent = message;
  status.setAttribute("data-tone", tone);
}

document.getElementById("loan-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = document.getElementById("submit-button");
  const principalValue = Number(document.getElementById("principal").value);
  const durationValue = Number(document.getElementById("duration_days").value);

  if (!Number.isFinite(principalValue) || principalValue < 10000) {
    setStatus("Enter a valid loan amount of at least 10,000 MWK.", "error");
    return;
  }

  if (![7, 14, 21, 30].includes(durationValue)) {
    setStatus("Select one of the allowed repayment durations.", "error");
    return;
  }

  submitButton.disabled = true;
  setStatus("Submitting your request...", "muted");

  try {
    const response = await fetch("/api/loans/create", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        principal: principalValue,
        duration_days: durationValue,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.message || payload.error || `Request failed with status ${response.status}`;
      setStatus(message, "error");
      return;
    }

    setStatus(`Loan request submitted successfully. Loan ID: ${payload.loan_id}.`, "success");
    event.target.reset();
  } catch (error) {
    setStatus(error.message || "Unable to reach the server.", "error");
  } finally {
    submitButton.disabled = false;
  }
});
