import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import BookIcon from '../components/BookIcon';

export default function LoginPage() {
  const { login, logout } = useAuth();
  const navigate  = useNavigate();

  const [portal, setPortal] = useState(null);
  const [form, setForm]     = useState({ email: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function selectPortal(p) {
    setPortal(p);
    setError('');
    setForm({ email: '', password: '' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);

      // Validate backend role against selected portal — both directions
      if (portal === 'member' && data.user.role !== 'member') {
        // Librarian tried the member portal — reject and clear any stale session
        logout();
        setError('This is a librarian account. Please use the Librarian Portal.');
        setLoading(false);
        return;
      }
      if (portal === 'librarian' && data.user.role !== 'librarian') {
        // Member tried the librarian portal — reject and clear any stale session
        logout();
        setError('This account does not have librarian access. Please use the Member Portal.');
        setLoading(false);
        return;
      }

      login(data.token, data.user);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  if (!portal) {
    return (
      <div className="auth-wrapper">
        <div className="auth-panel">
          <div className="auth-brand">
            <BookIcon size={36} color="var(--sage-dark)" />
            <h1>Libri</h1>
            <p>Your digital library</p>
          </div>

          <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Welcome back</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              className="btn portal-btn portal-btn-member"
              onClick={() => selectPortal('member')}
            >
              <span className="portal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <span>
                <strong>Member Portal</strong>
                <span className="portal-desc">Sign in or register as a library member</span>
              </span>
            </button>

            <button
              className="btn portal-btn portal-btn-librarian"
              onClick={() => selectPortal('librarian')}
            >
              <span className="portal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              </span>
              <span>
                <strong>Librarian Portal</strong>
                <span className="portal-desc">Staff sign-in only</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isMemberPortal = portal === 'member';

  return (
    <div className="auth-wrapper">
      <div className="auth-panel">
        <div className="auth-brand">
          <BookIcon size={36} color="var(--sage-dark)" />
          <h1>Libri</h1>
          <p>{isMemberPortal ? 'Member Portal' : 'Librarian Portal'}</p>
        </div>

        <h2>{isMemberPortal ? 'Member Sign In' : 'Librarian Sign In'}</h2>
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email" name="email" type="email"
              value={form.email} onChange={handleChange}
              placeholder="you@example.com" required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password" name="password" type="password"
              value={form.password} onChange={handleChange}
              placeholder="Your password" required
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in\u2026' : 'Log in'}
          </button>
        </form>

        {isMemberPortal && (
          <p className="auth-footer">
            New member?{' '}
            <button
              style={{ background: 'none', border: 'none', color: 'var(--sage-dark)', fontWeight: 500, cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
              onClick={() => navigate('/register')}
            >
              Create an account
            </button>
          </p>
        )}

        <button
          onClick={() => setPortal(null)}
          style={{ display: 'block', margin: '1rem auto 0', background: 'none', border: 'none', color: 'var(--muted)', fontSize: '.82rem', cursor: 'pointer', textDecoration: 'underline' }}
        >
          &larr; Back to portal selection
        </button>
      </div>
    </div>
  );
}