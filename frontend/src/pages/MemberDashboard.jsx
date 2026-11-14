import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { inr } from '../utils/fmt';
import { BookOpen, BookCopy, IndianRupee, Bookmark, Pin } from '../components/Icons';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function MemberDashboard() {
  const { user } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/dashboard/member')
      .then(r => setData(r.data))
      .catch(() => setError('Could not load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  function loanStatus(loan) {
    if (loan.status === 'returned') return <span className="badge badge-sage">Returned</span>;
    if (loan.due_date < today)      return <span className="badge badge-red">Overdue</span>;
    return <span className="badge badge-blue">Active</span>;
  }

  function daysLeft(due) {
    const diff = Math.ceil((new Date(due + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
    if (diff < 0)  return <span style={{color:'#991b1b',fontSize:'.78rem'}}>{-diff} day{-diff!==1?'s':''} overdue</span>;
    if (diff === 0) return <span style={{color:'#92400e',fontSize:'.78rem'}}>Due today</span>;
    return <span style={{color:'var(--muted)',fontSize:'.78rem'}}>{diff} day{diff!==1?'s':''} left</span>;
  }

  if (loading) return <div className="page"><div className="book-loader"><div className="book"/></div></div>;
  if (error)   return <div className="page"><div className="alert alert-error">{error}</div></div>;

  const { summary, loans, fines, reservations } = data;
  const activeLoans = loans.filter(l => l.status === 'active');
  const heldRes     = reservations.filter(r => r.status === 'held');

  return (
    <div className="page">
      <div className="welcome-strip">
        <div className="welcome-text">
          <h2>{greeting()}, {user?.name?.split(' ')[0]}.</h2>
          <p>Here is your library account at a glance.</p>
        </div>
        <Link to="/books" className="btn btn-primary">Browse Books</Link>
      </div>

      <div className="stat-grid">
        <div className={`stat-card ${summary.overdue_loans > 0 ? 'stat-warn' : ''}`}>
          <div className="stat-value">{summary.active_loans}</div>
          <div className="stat-label">Active loans{summary.overdue_loans > 0 ? ` (${summary.overdue_loans} overdue)` : ''}</div>
        </div>
        <div className={`stat-card ${summary.total_outstanding > 0 ? 'stat-warn' : 'stat-ok'}`}>
          <div className="stat-value">{inr(summary.total_outstanding)}</div>
          <div className="stat-label">Outstanding fines</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{summary.active_reservations}</div>
          <div className="stat-label">Reservations</div>
        </div>
        {summary.held_reservations > 0 && (
          <div className="stat-card stat-info">
            <div className="stat-value">{summary.held_reservations}</div>
            <div className="stat-label">Books ready to collect</div>
          </div>
        )}
      </div>

      <div className="quick-links mb-3">
        {[
          { to:'/books',           icon:<BookOpen size={18}/>,     label:'Browse Books' },
          { to:'/my-loans',        icon:<BookCopy size={18}/>,     label:'My Loans' },
          { to:'/my-fines',        icon:<IndianRupee size={18}/>,  label:'My Fines' },
          { to:'/my-reservations', icon:<Bookmark size={18}/>,     label:'Reservations' },
        ].map(q => (
          <Link key={q.to} to={q.to} className="quick-link-card">
            <div className="ql-icon">{q.icon}</div>
            <span className="ql-label">{q.label}</span>
          </Link>
        ))}
      </div>

      {heldRes.length > 0 && (
        <div className="alert alert-info mb-2">
          <Pin size={15}/>{' '}You have {heldRes.length} book{heldRes.length > 1 ? 's' : ''} held for you.
          {' '}<Link to="/my-reservations" style={{fontWeight:600}}>Collect now &rarr;</Link>
        </div>
      )}

      {activeLoans.length > 0 && (
        <div className="card mb-2">
          <div className="section-title">Current Loans</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Book</th><th>Due Date</th><th>Status</th></tr></thead>
              <tbody>
                {activeLoans.map(loan => (
                  <tr key={loan.id}>
                    <td><strong>{loan.book_title}</strong></td>
                    <td>{loan.due_date}{' '}{daysLeft(loan.due_date)}</td>
                    <td>{loanStatus(loan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {fines.length > 0 && (
        <div className="card mb-2">
          <div className="section-title">Outstanding Fines</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Book</th><th>Fine</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead>
              <tbody>
                {fines.map(f => (
                  <tr key={f.id}>
                    <td><strong>{f.book_title}</strong></td>
                    <td>{inr(f.fine_amount)}</td>
                    <td>{inr(f.paid_amount)}</td>
                    <td style={{color:'#991b1b',fontWeight:600}}>{inr(f.outstanding)}</td>
                    <td><span className={`badge ${f.payment_status==='partial'?'badge-amber':'badge-red'}`}>{f.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1"><Link to="/my-fines" className="btn btn-secondary btn-sm">View all fines</Link></div>
        </div>
      )}

      {reservations.length > 0 && (
        <div className="card">
          <div className="section-title">Your Reservations</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Book</th><th>Queue</th><th>Status</th><th>Hold Expires</th></tr></thead>
              <tbody>
                {reservations.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.book_title}</strong></td>
                    <td>#{r.queue_position}</td>
                    <td><span className={`badge ${r.status==='held'?'badge-green':'badge-blue'}`}>{r.status}</span></td>
                    <td className="text-sm text-muted">{r.hold_expires_at ? new Date(r.hold_expires_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeLoans.length === 0 && fines.length === 0 && reservations.length === 0 && (
        <div className="card empty-state">
          <div className="empty-icon"><BookOpen size={40} style={{opacity:.4}}/></div>
          <p>Your account is all clear. Ready to discover your next book?</p>
          <Link to="/books" className="btn btn-primary mt-2">Browse the catalogue</Link>
        </div>
      )}
    </div>
  );
}