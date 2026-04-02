import RoleProtectedRoute from "../components/RoleProtectedRoute";

export default function AdminPage() {
  return (
    <RoleProtectedRoute allowedRoles={["admin"]}>
      <div className="dashboard-page">
        <div className="dashboard-shell stack-xl">
          <section className="panel">
            <div className="panel-head">
              <h2>Admin Panel</h2>
              <p>Only signed-in administrators can open this route directly.</p>
            </div>
            <div className="banner banner-success">
              Role protection is active for this page. Unauthorized visitors are redirected away automatically.
            </div>
          </section>
        </div>
      </div>
    </RoleProtectedRoute>
  );
}
