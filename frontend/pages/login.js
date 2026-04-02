import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthContext } from "../context/AuthContext";
import { loginSchema } from "../utils/schemas";

export default function LoginPage() {
  const { loading, login, user } = useContext(AuthContext);
  const router = useRouter();
  const [submitError, setSubmitError] = useState("");
  const nextPath = typeof router.query.next === "string" ? router.query.next : "/dashboard";

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (!loading && user) {
      router.replace(nextPath);
    }
  }, [loading, nextPath, router, user]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError("");
    try {
      await login(values);
      router.replace(nextPath);
    } catch (error) {
      setSubmitError(error.message || "Unable to sign in right now.");
    }
  });

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">Secure Session</div>
        <h1>Sign in to your workspace.</h1>
        <p className="lede">This frontend uses server-backed cookies only. Tokens are never stored in local storage.</p>

        <form className="stack-lg" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span>Email</span>
            <input type="email" placeholder="name@my.mzuni.ac.mw" {...register("email")} />
            {errors.email ? <small className="field-error">{errors.email.message}</small> : null}
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" placeholder="Enter your password" {...register("password")} />
            {errors.password ? <small className="field-error">{errors.password.message}</small> : null}
          </label>

          {submitError ? <div className="banner banner-error">{submitError}</div> : null}

          <button className="primary-button" type="submit" disabled={isSubmitting || loading}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
