import { formatCurrency, formatDate } from "../utils/format";

export default function TransactionList({ entries, title = "Transactions" }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <p>Server-authorized transaction and ledger records.</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Amount</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {entries?.length ? (
              entries.map((entry) => (
                <tr key={entry.id || `${entry.type}-${entry.created_at}`}>
                  <td>{entry.type}</td>
                  <td>{formatCurrency(entry.amount)}</td>
                  <td>{formatDate(entry.created_at, true)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3">No transaction records are available yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
