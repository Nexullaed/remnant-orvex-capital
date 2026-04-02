import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ProtectedRoute from "../components/ProtectedRoute";
import api from "../utils/api";
import { loanApplicationSchema } from "../utils/schemas";

function ApplyContent() {
  const [submitResult, setSubmitResult] = useState({ message: "", tone: "muted" });
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm({
    defaultValues: {
      principal: "",
      duration_days: "7",
    },
    resolver: zodResolver(loanApplicationSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitResult({ message: "", tone: "muted" });
    try {
      const response = await api.post("/api/loans/create", {
        principal: Number(values.principal),
        duration_days: Number(values.duration_days),
      });
      setSubmitResult({
        message: `Loan request submitted successfully. Loan ID: ${response.data.loan_id}.`,
        tone: "success",
      });
      reset();
    } catch (error) {
      setSubmitResult({
        message: error.message || "Unable to submit the loan request.",
        tone: "error",
      });
    }
  });

  return (
    <div className="dashboard-page">
      <div className="dashboard-shell">
        <section className="panel form-panel">
          <div className="panel-head">
            <h2>Loan request</h2>
            <p>Client-side validation mirrors the API, while the backend remains the source of truth.</p>
          </div>

          <form className="stack-xl" onSubmit={onSubmit} noValidate>
            <div className="form-grid">
              <label className="field">
                <span>Principal amount (MWK)</span>
                <input type="number" inputMode="decimal" min="10000" step="0.01" {...register("principal")} />
                {errors.principal ? <small className="field-error">{errors.principal.message}</small> : null}
              </label>

              <label className="field">
                <span>Repayment duration</span>
                <select {...register("duration_days")}>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="21">21 days</option>
                  <option value="30">30 days</option>
                </select>
                {errors.duration_days ? <small className="field-error">{errors.duration_days.message}</small> : null}
              </label>
            </div>

            <div className="banner banner-muted">
              Server checks still enforce session ownership, verification level, and your allowed email domain.
            </div>

            {submitResult.message ? (
              <div className={`banner banner-${submitResult.tone}`} role="status" aria-live="polite">
                {submitResult.message}
              </div>
            ) : null}

            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit request"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <ProtectedRoute>
      <ApplyContent />
    </ProtectedRoute>
  );
}
