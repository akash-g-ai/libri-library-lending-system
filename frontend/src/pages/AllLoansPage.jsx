import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { inr } from '../utils/fmt';
import { BookCopy } from '../components/Icons';

export default function AllLoansPage() {
  const [loans, setLoans]     = useState([]);
  const [filter, setFilter]   = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [msg, setMsg]         = useState('');

  async function fetchLoans(status = '') {
    setLoading(true); setError('');
    try { const { data } = await api.get('/loans', { params: status ? { status } : {} }); setLoans(data.loans); }
    catch { setError('Failed to load loans.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { fetchLoans(filter); }, [filter]);

  async function handleReturn(loanId) {
    if (!window.confirm('Process return for this loan?')) return;
    setMsg(''); setError('');
    try {
      const { data } = await api.post(`/loans/${loanId}/return`);
      setMsg(data.fine ? `Returned. Fine: ${inr(data.fine.fine_amount)} (${data.overdue_days} overdue days).` : 'Returned successfully.');
      fetchLoans(filter);
    } catch (err) { setError(err.response?.data?.error || 'Return failed.'); }
  }

  function statusBadge(loan) {
    if (loan.status === 'returned') return <span className="badge badge-sage">Returned</span>;
    const overdue = loan.due_date < new Date().toISOString().slice(0, 10);
    return <span className={`badge ${overdue ? 'badge-red' : 'badge-blue'}`}>{overdue ? 'Overdue' : 'Active'}</span>;
  }

  const filters = ['', 'active', 'returned', 'overdue'];

  return (
    <div className="page">
      <div className="page-header">
        <h1>All Loans</h1>
        <div className="filter-bar">
          {filters.map(s => (
            <button key={s} className={`btn btn-sm ${filter===s?'btn-primary':'btn-secondary'}`} onClick={() => setFilter(s)}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>
      {msg   && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="spinner"/> : loans.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon"><BookCopy size={40} style={{opacity:.4}}/></div>
          <p>No loans found.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Book</th><th>Checkout</th><th>Due</th><th>Returned</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {loans.map(loan => (
                <tr key={loan.id}>
                  <td>{loan.member_name}<br/><small className="text-muted">{loan.member_email}</small></td>
                  <td><strong>{loan.book_title}</strong></td>
                  <td className="text-sm">{loan.checkout_date}</td>
                  <td className="text-sm">{loan.due_date}</td>
                  <td className="text-sm">{loan.return_date || '—'}</td>
                  <td>{statusBadge(loan)}</td>
                  <td>{loan.status === 'active' && <button className="btn btn-secondary btn-sm" onClick={() => handleReturn(loan.id)}>Return</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}