import { useContext, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { AuthContext } from "../context/AuthContext";

export default function RoleProtectedRoute({ allowedRoles = [], children }) {
  const { authClaims, loading, user } = useContext(AuthContext);
  const router = useRouter();
  const normalizedRoles = useMemo(
    () => allowedRoles.map((role) => String(role || "").toLowerCase()),
    [allowedRoles]
  );
  const effectiveRole = String(authClaims?.role || user?.role || "").toLowerCase();
  const isAllowed = normalizedRoles.includes(effectiveRole);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
      return;
    }

    if (!isAllowed) {
      router.replace("/dashboard");
    }
  }, [isAllowed, loading, router, user]);

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="guard-card">
          <h1>Checking access...</h1>
          <p>We are verifying your role before showing this page.</p>
        </div>
      </div>
    );
  }

  if (!user || !isAllowed) {
    return null;
  }

  return children;
}
