import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { inr } from '../utils/fmt';
import { CheckCircle } from '../components/Icons';

export default function FineManagementPage() {
  const [fines, setFines]       = useState([]);
  const [filter, setFilter]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [msg, setMsg]           = useState('');
  const [payState, setPayState] = useState({});

  async function fetchFines(status = '') {
    setLoading(true); setError('');
    try { const { data } = await api.get('/fines', { params: status ? { payment_status: status } : {} }); setFines(data.fines); }
    catch { setError('Failed to load fines.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { fetchFines(filter); }, [filter]);

  async function handlePay(fineId) {
    const amount = parseFloat(payState[fineId]);
    if (!amount || amount <= 0) { setError('Enter a valid payment amount.'); return; }
    setMsg(''); setError('');
    try {
      await api.post(`/fines/${fineId}/pay`, { amount });
      setMsg(`Payment of ${inr(amount)} recorded.`);
      setPayState(prev => ({ ...prev, [fineId]: '' }));
      fetchFines(filter);
    } catch (err) { setError(err.response?.data?.error || 'Payment failed.'); }
  }

  function statusBadge(status) {
    if (status === 'paid')    return <span className="badge badge-sage">Paid</span>;
    if (status === 'partial') return <span className="badge badge-amber">Partial</span>;
    return <span className="badge badge-red">Unpaid</span>;
  }

  const filters = ['', 'unpaid', 'partial', 'paid'];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Fine Management</h1>
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
      {loading ? <div className="spinner"/> : fines.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon"><CheckCircle size={40} style={{opacity:.4}}/></div>
          <p>No fines found.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Book</th><th>Fine</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Payment</th></tr></thead>
            <tbody>
              {fines.map(fine => (
                <tr key={fine.id}>
                  <td>{fine.member_name}<br/><small className="text-muted">{fine.member_email}</small></td>
                  <td><strong>{fine.book_title}</strong></td>
                  <td>{inr(fine.fine_amount)}</td>
                  <td>{inr(fine.paid_amount)}</td>
                  <td style={{color:'#991b1b',fontWeight:600}}>{inr(fine.outstanding)}</td>
                  <td>{statusBadge(fine.payment_status)}</td>
                  <td>
                    {fine.payment_status !== 'paid' && (
                      <div style={{display:'flex',gap:'.4rem'}}>
                        <input type="number" min="1" step="1" placeholder="Amount" value={payState[fine.id]||''}
                          onChange={e => setPayState(prev => ({ ...prev, [fine.id]: e.target.value }))}
                          style={{width:80,padding:'.3rem .5rem',borderRadius:'var(--radius)',border:'1px solid var(--border)',fontSize:'.8rem'}}/>
                        <button className="btn btn-primary btn-sm" onClick={() => handlePay(fine.id)}>Pay</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}