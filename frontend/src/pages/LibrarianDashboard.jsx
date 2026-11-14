import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { inr } from '../utils/fmt';
import { BookOpen, BookCopy, IndianRupee, Bookmark, Users, AlertTriangle } from '../components/Icons';

export default function LibrarianDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/librarian')
      .then(r => setStats(r.data.stats))
      .catch(() => setError('Could not load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="book-loader"><div className="book"/></div></div>;
  if (error)   return <div className="page"><div className="alert alert-error">{error}</div></div>;

  const statItems = [
    { label: 'Total Books',          value: stats.total_books,                                         cls: '' },
    { label: 'Available Copies',     value: stats.available_copies,                                    cls: 'stat-ok' },
    { label: 'Active Loans',         value: stats.active_loans,                                        cls: 'stat-info' },
    { label: 'Overdue Loans',        value: stats.overdue_loans,                                       cls: stats.overdue_loans > 0 ? 'stat-warn' : '' },
    { label: 'Members',              value: stats.registered_members,                                  cls: '' },
    { label: 'Pending Reservations', value: stats.pending_reservations,                               cls: '' },
    { label: 'Active Holds',         value: stats.active_holds,                                        cls: stats.active_holds > 0 ? 'stat-info' : '' },
    { label: 'Outstanding Fines',    value: inr(stats.total_outstanding_fines),                       cls: stats.total_outstanding_fines > 0 ? 'stat-warn' : 'stat-ok' },
  ];

  return (
    <div className="page">
      <div className="welcome-strip">
        <div className="welcome-text">
          <h2>Welcome back, {user?.name?.split(' ')[0]}.</h2>
          <p>Library operations overview.</p>
        </div>
        <Link to="/books/new" className="btn btn-primary">+ Add Book</Link>
      </div>

      <div className="stat-grid">
        {statItems.map((s, i) => (
          <div key={i} className={`stat-card ${s.cls}`}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="quick-links mb-3">
        {[
          { to:'/books',        icon:<BookOpen size={18}/>,    label:'Book Catalogue' },
          { to:'/loans',        icon:<BookCopy size={18}/>,    label:'Loan Management' },
          { to:'/fines',        icon:<IndianRupee size={18}/>, label:'Fine Management' },
          { to:'/reservations', icon:<Bookmark size={18}/>,    label:'Reservations' },
          { to:'/settings',     icon:<Users size={18}/>,       label:'Library Settings' },
        ].map(q => (
          <Link key={q.to} to={q.to} className="quick-link-card">
            <div className="ql-icon">{q.icon}</div>
            <span className="ql-label">{q.label}</span>
          </Link>
        ))}
      </div>

      {stats.overdue_loans > 0 && (
        <div className="alert alert-warn mb-2">
          <AlertTriangle size={15}/>{' '}
          There {stats.overdue_loans === 1 ? 'is' : 'are'} <strong>{stats.overdue_loans}</strong> overdue loan{stats.overdue_loans > 1 ? 's' : ''}.
          {' '}<Link to="/loans?status=overdue" style={{fontWeight:600}}>Review now &rarr;</Link>
        </div>
      )}

      {stats.total_outstanding_fines > 0 && (
        <div className="alert alert-info">
          <IndianRupee size={15}/>{' '}
          <strong>{inr(stats.total_outstanding_fines)}</strong> in outstanding fines across all members.
          {' '}<Link to="/fines?payment_status=unpaid" style={{fontWeight:600}}>Manage fines &rarr;</Link>
        </div>
      )}
    </div>
  );
}