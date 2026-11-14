import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { Bookmark } from '../components/Icons';

export default function ReservationManagementPage() {
  const [reservations, setReservations] = useState([]);
  const [filter, setFilter]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [msg, setMsg]           = useState('');

  async function load(status = '') {
    setLoading(true); setError('');
    try { const { data } = await api.get('/reservations', { params: status ? { status } : {} }); setReservations(data.reservations); }
    catch { setError('Failed to load reservations.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(filter); }, [filter]);

  async function handleCancel(id) {
    if (!window.confirm('Cancel this reservation?')) return;
    setMsg(''); setError('');
    try { await api.delete(`/reservations/${id}`); setMsg('Reservation cancelled.'); load(filter); }
    catch (err) { setError(err.response?.data?.error || 'Cancel failed.'); }
  }

  function statusBadge(status) {
    const cls = { waiting:'badge-blue', held:'badge-green', fulfilled:'badge-sage', expired:'badge-red', cancelled:'badge-muted' };
    return <span className={`badge ${cls[status]||'badge-blue'}`}>{status}</span>;
  }

  const statuses = ['', 'waiting', 'held', 'fulfilled', 'expired', 'cancelled'];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Reservation Management</h1>
        <div className="filter-bar">
          {statuses.map(s => (
            <button key={s} className={`btn btn-sm ${filter===s?'btn-primary':'btn-secondary'}`} onClick={() => setFilter(s)}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>
      {msg   && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="spinner"/> : reservations.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon"><Bookmark size={40} style={{opacity:.4}}/></div>
          <p>No reservations found.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Book</th><th>Member</th><th>Queue #</th><th>Status</th><th>Created</th><th>Hold Expires</th><th>Action</th></tr></thead>
            <tbody>
              {reservations.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.book_title}</strong></td>
                  <td>{r.member_name}<br/><small className="text-muted">{r.member_email}</small></td>
                  <td>#{r.queue_position}</td>
                  <td>{statusBadge(r.status)}</td>
                  <td className="text-sm text-muted">{r.created_at?.slice(0,10)}</td>
                  <td className="text-sm text-muted">{r.hold_expires_at ? new Date(r.hold_expires_at).toLocaleString() : '—'}</td>
                  <td>{['waiting','held'].includes(r.status) && <button className="btn btn-danger btn-sm" onClick={() => handleCancel(r.id)}>Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}