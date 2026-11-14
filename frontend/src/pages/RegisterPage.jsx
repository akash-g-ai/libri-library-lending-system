import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import BookIcon from '../components/BookIcon';

export default function RegisterPage() {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [form, setForm]     = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      login(data.token, data.user);
      window.location.href = '/dashboard';
    } catch (err) {
      const body = err.response?.data;
      if (body?.errors) setErrors(body.errors);
      else setErrors([body?.error || 'Registration failed.']);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-panel">
        <div className="auth-brand">
          <BookIcon size={36} color="var(--sage-dark)" />
          <h1>Libri</h1>
          <p>Member Portal</p>
        </div>

        <h2>Create an account</h2>
        {errors.length > 0 && (
          <div className="alert alert-error">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="name">Full name</label>
            <input id="name" name="name" value={form.name}
              onChange={handleChange} placeholder="Jane Doe" required autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" value={form.email}
              onChange={handleChange} placeholder="jane@example.com" required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" value={form.password}
              onChange={handleChange} placeholder="At least 8 characters" required />
            <div className="form-hint">Minimum 8 characters.</div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Creating account\u2026' : 'Register'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <button
            style={{ background: 'none', border: 'none', color: 'var(--sage-dark)', fontWeight: 500, cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
            onClick={() => navigate('/login')}
          >
            Log in
          </button>
        </p>
      </div>
    </div>
  );
}