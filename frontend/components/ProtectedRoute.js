import { useContext, useEffect } from "react";
import { useRouter } from "next/router";
import { AuthContext } from "../context/AuthContext";

export default function ProtectedRoute({ allowedRoles, children }) {
  const { authClaims, loading, user } = useContext(AuthContext);
  const router = useRouter();
  const effectiveRole = String(authClaims?.role || user?.role || "").toLowerCase();
  const normalizedAllowedRoles = allowedRoles?.map((role) => String(role || "").toLowerCase()) || null;

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
    }
  }, [loading, router, user]);

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="guard-card">
          <h1>Loading secure session...</h1>
          <p>We are checking your authenticated session before showing this page.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (normalizedAllowedRoles?.length && !normalizedAllowedRoles.includes(effectiveRole)) {
    return (
      <div className="dashboard-page">
        <div className="guard-card">
          <h1>Access denied</h1>
          <p>Your role does not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
