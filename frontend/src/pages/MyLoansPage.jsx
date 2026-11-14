import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { Link } from 'react-router-dom';
import { BookCopy } from '../components/Icons';

export default function MyLoansPage() {
  const [loans, setLoans]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/loans/my-loans')
      .then(({ data }) => setLoans(data.loans))
      .catch(() => setError('Failed to load your loans.'))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  function statusBadge(loan) {
    if (loan.status === 'active') {
      const isOverdue = loan.due_date < today;
      return <span className={`badge ${isOverdue ? 'badge-red' : 'badge-blue'}`}>{isOverdue ? 'Overdue' : 'Active'}</span>;
    }
    return <span className="badge badge-sage">Returned</span>;
  }

  return (
    <div className="page">
      <div className="page-header"><h1>My Loans</h1></div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="spinner"/> : loans.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon"><BookCopy size={40} style={{opacity:.4}}/></div>
          <p>You have no loans yet.</p>
          <Link to="/books" className="btn btn-primary mt-2">Browse Books</Link>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Book</th><th>Author</th><th>Checked Out</th><th>Due Date</th><th>Returned</th><th>Status</th></tr></thead>
            <tbody>
              {loans.map(loan => (
                <tr key={loan.id}>
                  <td><strong>{loan.book_title}</strong></td>
                  <td>{loan.book_author}</td>
                  <td className="text-sm">{loan.checkout_date}</td>
                  <td className="text-sm">{loan.due_date}</td>
                  <td className="text-sm">{loan.return_date || '—'}</td>
                  <td>{statusBadge(loan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}