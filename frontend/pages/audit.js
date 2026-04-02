import RoleProtectedRoute from "../components/RoleProtectedRoute";

export default function AuditPage() {
  return (
    <RoleProtectedRoute allowedRoles={["auditor"]}>
      <div className="dashboard-page">
        <div className="dashboard-shell stack-xl">
          <section className="panel">
            <div className="panel-head">
              <h2>Audit Logs</h2>
              <p>Only users with the auditor role can view this route.</p>
            </div>
            <div className="banner banner-muted">
              This page is guarded on the client before any protected audit content is rendered.
            </div>
          </section>
        </div>
      </div>
    </RoleProtectedRoute>
  );
}
