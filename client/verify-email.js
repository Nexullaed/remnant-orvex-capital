function extractTokenFromHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("token") || "";
}

async function verifyEmail() {
  const status = document.getElementById("verify-status");
  const token = extractTokenFromHash();

  if (!token) {
    status.textContent = "Verification token is missing.";
    status.setAttribute("data-tone", "error");
    return;
  }

  try {
    const response = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      status.textContent = payload.message || "Verification failed.";
      status.setAttribute("data-tone", "error");
      return;
    }

    status.textContent = payload.message || "Email verified successfully.";
    status.setAttribute("data-tone", "success");
    history.replaceState(null, "", window.location.pathname);
  } catch (error) {
    status.textContent = error.message || "Unable to verify email right now.";
    status.setAttribute("data-tone", "error");
  }
}

verifyEmail();
