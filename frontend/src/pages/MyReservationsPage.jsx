import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { Link } from 'react-router-dom';
import { Bookmark } from '../components/Icons';

export default function MyReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [msg, setMsg]         = useState('');

  async function load() {
    setLoading(true);
    try { const { data } = await api.get('/reservations/my-reservations'); setReservations(data.reservations); }
    catch { setError('Failed to load reservations.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleCancel(id) {
    if (!window.confirm('Cancel this reservation?')) return;
    setMsg(''); setError('');
    try { await api.delete(`/reservations/${id}`); setMsg('Reservation cancelled.'); load(); }
    catch (err) { setError(err.response?.data?.error || 'Cancel failed.'); }
  }

  async function handleCollect(id) {
    setMsg(''); setError('');
    try { const { data } = await api.post(`/reservations/${id}/collect`); setMsg(`Book collected! Due: ${data.loan.due_date}`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Collect failed.'); }
  }

  function statusBadge(r) {
    const cls = { waiting:'badge-blue', held:'badge-green', fulfilled:'badge-sage', expired:'badge-red', cancelled:'badge-muted' };
    return <span className={`badge ${cls[r.status]||'badge-blue'}`}>{r.status}</span>;
  }

  return (
    <div className="page">
      <div className="page-header"><h1>My Reservations</h1></div>
      {msg   && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="spinner"/> : reservations.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon"><Bookmark size={40} style={{opacity:.4}}/></div>
          <p>No reservations.</p>
          <Link to="/books" className="btn btn-primary mt-2">Browse Books</Link>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Book</th><th>Queue #</th><th>Status</th><th>Hold Expires</th><th>Actions</th></tr></thead>
            <tbody>
              {reservations.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.book_title}</strong></td>
                  <td>#{r.queue_position}</td>
                  <td>{statusBadge(r)}</td>
                  <td className="text-sm text-muted">{r.hold_expires_at ? new Date(r.hold_expires_at).toLocaleString() : '—'}</td>
                  <td style={{display:'flex',gap:'.4rem'}}>
                    {r.status === 'held' && <button className="btn btn-primary btn-sm" onClick={() => handleCollect(r.id)}>Collect</button>}
                    {['waiting','held'].includes(r.status) && <button className="btn btn-danger btn-sm" onClick={() => handleCancel(r.id)}>Cancel</button>}
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