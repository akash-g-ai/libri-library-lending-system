import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { inr } from '../utils/fmt';
import { CheckCircle, IndianRupee } from '../components/Icons';

export default function MyFinesPage() {
  const [fines, setFines]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/fines/my-fines')
      .then(({ data }) => setFines(data.fines))
      .catch(() => setError('Failed to load fines.'))
      .finally(() => setLoading(false));
  }, []);

  const totalOutstanding = fines.reduce((s, f) => s + parseFloat(f.outstanding || 0), 0);

  function statusBadge(status) {
    if (status === 'paid')    return <span className="badge badge-sage">Paid</span>;
    if (status === 'partial') return <span className="badge badge-amber">Partial</span>;
    return <span className="badge badge-red">Unpaid</span>;
  }

  return (
    <div className="page">
      <div className="page-header"><h1>My Fines</h1></div>
      {error && <div className="alert alert-error">{error}</div>}
      {fines.length > 0 && (
        <div className="card mb-2" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span className="text-sm text-muted">Total outstanding balance</span>
          <strong style={{fontSize:'1.3rem',color: totalOutstanding > 0 ? '#991b1b' : 'var(--sage-dark)'}}>
            {inr(totalOutstanding)}
          </strong>
        </div>
      )}
      {loading ? <div className="spinner"/> : fines.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon"><CheckCircle size={40} style={{opacity:.4}}/></div>
          <p>You have no outstanding fines.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Book</th><th>Fine</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {fines.map(f => (
                <tr key={f.id}>
                  <td><strong>{f.book_title}</strong></td>
                  <td>{inr(f.fine_amount)}</td>
                  <td>{inr(f.paid_amount)}</td>
                  <td style={{color:'#991b1b',fontWeight:600}}>{inr(f.outstanding)}</td>
                  <td>{statusBadge(f.payment_status)}</td>
                  <td className="text-sm text-muted">{f.created_at?.slice(0,10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}