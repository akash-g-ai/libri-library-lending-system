import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BookIcon from './BookIcon';

const icons = {
  home:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  book:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>,
  loan:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>,
  fine:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  reserve:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 012-2z"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  logout:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

function NavItem({ to, icon, label }) {
  return (
    <li>
      <NavLink to={to} className={({ isActive }) => isActive ? 'active' : ''}>
        <span className="nav-icon">{icons[icon]}</span>
        {label}
      </NavLink>
    </li>
  );
}

export default function Sidebar() {
  const { user, logout, isLibrarian, isMember } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'none', position: 'fixed', top: 12, left: 12, zIndex: 200,
          background: 'var(--warm-white)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '.4rem .6rem', cursor: 'pointer',
        }}
        aria-label="Toggle menu"
        className="sidebar-toggle"
      >☰</button>

      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <BookIcon size={22} color="var(--sage-dark)" />
          <div>
            <span className="brand-name">Libri</span>
            <span className="brand-sub">Library System</span>
          </div>
        </div>

        <span className="sidebar-section-label">Menu</span>
        <ul className="sidebar-nav">
          <NavItem to="/dashboard"        icon="home"     label="Dashboard" />
          <NavItem to="/books"            icon="book"     label="Books" />
          {isMember && <NavItem to="/my-loans"        icon="loan"    label="My Loans" />}
          {isMember && <NavItem to="/my-fines"        icon="fine"    label="My Fines" />}
          {isMember && <NavItem to="/my-reservations" icon="reserve" label="Reservations" />}
          {isLibrarian && <NavItem to="/loans"        icon="loan"    label="All Loans" />}
          {isLibrarian && <NavItem to="/fines"        icon="fine"    label="Fines" />}
          {isLibrarian && <NavItem to="/reservations" icon="reserve" label="Reservations" />}
          {isLibrarian && <NavItem to="/settings"     icon="settings" label="Settings" />}
        </ul>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
          </div>
          <ul className="sidebar-nav">
            <li>
              <button onClick={handleLogout} style={{ color: '#991b1b' }}>
                <span className="nav-icon" style={{ color: '#991b1b' }}>{icons.logout}</span>
                Sign out
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </>
  );
}