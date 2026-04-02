import { useContext, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../components/ProtectedRoute";
import TransactionList from "../components/TransactionList";
import { AuthContext } from "../context/AuthContext";
import api from "../utils/api";
import { formatCurrency, formatDate } from "../utils/format";

function StatCard({ label, tone = "default", value }) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function BorrowerDashboard() {
  const [data, setData] = useState({ ledger: [], loans: [], profile: null });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [profileRes, loansRes] = await Promise.all([api.get("/api/borrower/profile"), api.get("/api/borrower/loans")]);
        const loans = Array.isArray(loansRes.data) ? loansRes.data : [];
        const primaryLoan = loans.find((loan) => loan.status !== "COMPLETED") || loans[0] || null;
        const ledgerRes = primaryLoan ? await api.get(`/api/borrower/loans/${primaryLoan.id}/ledger`) : { data: [] };

        if (!cancelled) {
          setData({
            ledger: Array.isArray(ledgerRes.data) ? ledgerRes.data : [],
            loans,
            profile: profileRes.data || null,
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load your dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const outstanding = data.loans.reduce((total, loan) => total + Number(loan.total_amount || 0), 0);
    const activeCount = data.loans.filter((loan) => ["ACTIVE", "APPROVED", "DEFAULTED"].includes(String(loan.status || "").toUpperCase())).length;
    const completedCount = data.loans.filter((loan) => String(loan.status || "").toUpperCase() === "COMPLETED").length;
    return { activeCount, completedCount, outstanding };
  }, [data.loans]);

  if (loading) {
    return <div className="banner banner-muted">Loading borrower dashboard...</div>;
  }

  if (error) {
    return <div className="banner banner-error">{error}</div>;
  }

  return (
    <div className="stack-xl">
      <div className="card-grid">
        <StatCard label="Outstanding balance" value={formatCurrency(summary.outstanding)} tone="gold" />
        <StatCard label="Active loans" value={String(summary.activeCount)} />
        <StatCard label="Completed loans" value={String(summary.completedCount)} />
        <StatCard label="Verification level" value={String(data.profile?.verification_level ?? 0)} tone="emerald" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Your loans</h2>
          <p>Server-authorized balances and due dates.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Loan</th>
                <th>Status</th>
                <th>Principal</th>
                <th>Total</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {data.loans.length ? (
                data.loans.map((loan) => (
                  <tr key={loan.id}>
                    <td>#{loan.id}</td>
                    <td>{loan.status}</td>
                    <td>{formatCurrency(loan.principal)}</td>
                    <td>{formatCurrency(loan.total_amount)}</td>
                    <td>{formatDate(loan.due_date)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">No loans found for this account.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <TransactionList entries={data.ledger} title="Recent ledger activity" />
    </div>
  );
}

function AdminDashboard() {
  const [data, setData] = useState({ dashboard: null, loans: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [dashboardRes, loansRes] = await Promise.all([api.get("/api/admin/dashboard"), api.get("/api/admin/loans")]);
        if (!cancelled) {
          setData({
            dashboard: dashboardRes.data || null,
            loans: Array.isArray(loansRes.data) ? loansRes.data.slice(0, 8) : [],
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load the admin dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="banner banner-muted">Loading admin dashboard...</div>;
  }

  if (error) {
    return <div className="banner banner-error">{error}</div>;
  }

  const dashboard = data.dashboard || {};

  return (
    <div className="stack-xl">
      <div className="card-grid">
        <StatCard label="Active loan book" value={formatCurrency(dashboard.total_active_loans)} tone="gold" />
        <StatCard label="Overdue exposure" value={formatCurrency(dashboard.total_overdue)} tone="rose" />
        <StatCard label="Collected capital" value={formatCurrency(dashboard.total_collected)} tone="emerald" />
        <StatCard label="Available capital" value={formatCurrency(dashboard.available_capital)} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Portfolio overview</h2>
          <p>Trusted metrics backed by the secure backend.</p>
        </div>
        <div className="metrics-grid">
          <div className="metric-line"><span>Active loans</span><strong>{dashboard.active_count ?? 0}</strong></div>
          <div className="metric-line"><span>Completed loans</span><strong>{dashboard.completed_count ?? 0}</strong></div>
          <div className="metric-line"><span>Overdue count</span><strong>{dashboard.overdue_count ?? 0}</strong></div>
          <div className="metric-line"><span>Overdue rate</span><strong>{dashboard.overdue_rate ? `${(dashboard.overdue_rate * 100).toFixed(1)}%` : "0.0%"}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent loan queue</h2>
          <p>Admin-only portfolio visibility.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Loan</th>
                <th>User</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.loans.length ? (
                data.loans.map((loan) => (
                  <tr key={loan.id}>
                    <td>#{loan.id}</td>
                    <td>{loan.user_id}</td>
                    <td>{loan.status}</td>
                    <td>{formatCurrency(loan.total_amount)}</td>
                    <td>{formatDate(loan.created_at, true)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">No loan records are available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DashboardContent() {
  const { authClaims, user } = useContext(AuthContext);
  const effectiveRole = String(authClaims?.role || user?.role || "").toLowerCase();

  return (
    <div className="dashboard-page">
      <div className="dashboard-shell">
        {effectiveRole === "admin" ? <AdminDashboard /> : <BorrowerDashboard />}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

