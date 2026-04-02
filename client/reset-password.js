function extractResetToken() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("token") || "";
}

function setResetStatus(message, tone = "muted") {
  const status = document.getElementById("reset-status");
  status.textContent = message;
  status.setAttribute("data-tone", tone);
}

document.getElementById("reset-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const resetButton = document.getElementById("reset-button");
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirm_password").value;
  const token = extractResetToken();

  if (!token) {
    setResetStatus("Reset token is missing.", "error");
    return;
  }

  if (password !== confirmPassword) {
    setResetStatus("Passwords do not match.", "error");
    return;
  }

  resetButton.disabled = true;
  setResetStatus("Submitting password reset...", "muted");

  try {
    const response = await fetch("/api/auth/reset/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, password }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setResetStatus(payload.message || "Password reset failed.", "error");
      return;
    }

    setResetStatus(payload.message || "Password updated successfully.", "success");
    history.replaceState(null, "", window.location.pathname);
    event.target.reset();
  } catch (error) {
    setResetStatus(error.message || "Unable to reset password right now.", "error");
  } finally {
    resetButton.disabled = false;
  }
});
