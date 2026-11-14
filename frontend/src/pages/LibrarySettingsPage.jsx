import React, { useEffect, useState } from 'react';
import api from '../api/client';

export default function LibrarySettingsPage() {
  const [form, setForm]     = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [msg, setMsg]         = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/settings');
      setForm({
        loan_period_days:                data.settings.loan_period_days,
        fine_per_overdue_day:            data.settings.fine_per_overdue_day,
        max_fine_cap:                    data.settings.max_fine_cap,
        max_active_loans:                data.settings.max_active_loans,
        unpaid_fine_borrowing_threshold: data.settings.unpaid_fine_borrowing_threshold,
        reservation_hold_window_hours:   data.settings.reservation_hold_window_hours,
      });
    } catch { setError('Failed to load settings.'); }
    finally { setLoading(false); }
  }

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    try {
      const { data } = await api.put('/settings', form);
      setMsg(data.message || 'Settings saved successfully.');
    } catch (err) {
      const body = err.response?.data;
      if (body?.errors) setError(body.errors.join(' '));
      else setError(body?.error || 'Failed to save settings.');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="page"><div className="spinner"/></div>;

  const groups = [
    {
      title: 'Loan Configuration',
      desc: 'Controls how long members can borrow books.',
      fields: [
        { key: 'loan_period_days',  label: 'Loan Period (days)',    step: '1', desc: 'Number of days a member can keep a borrowed book before it becomes overdue.' },
        { key: 'max_active_loans',  label: 'Maximum Active Loans',  step: '1', desc: 'Maximum number of books a member can have checked out simultaneously.' },
      ],
    },
    {
      title: 'Fine Configuration',
      desc: 'Controls overdue fine calculation.',
      fields: [
        { key: 'fine_per_overdue_day',            label: 'Fine Per Overdue Day (₹)',            step: '1', desc: 'Amount charged per day a book is returned late.' },
        { key: 'max_fine_cap',                     label: 'Maximum Fine Cap (₹)',                step: '1', desc: 'Upper limit on the total fine for a single overdue book.' },
        { key: 'unpaid_fine_borrowing_threshold',  label: 'Unpaid Fine Borrowing Threshold (₹)', step: '1', desc: 'Members with unpaid fines above this amount cannot check out new books.' },
      ],
    },
    {
      title: 'Reservation Configuration',
      desc: 'Controls the reservation hold window.',
      fields: [
        { key: 'reservation_hold_window_hours', label: 'Reservation Hold Window (hours)', step: '1', desc: 'How long a held book waits for the member before expiring.' },
      ],
    },
  ];

  return (
    <div className="page">
      <div className="page-header"><h1>Library Settings</h1></div>
      {msg   && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        {groups.map(group => (
          <div key={group.title} className="settings-group">
            <div className="settings-group-header">
              <h3>{group.title}</h3>
              <p>{group.desc}</p>
            </div>
            {group.fields.map(field => (
              <div key={field.key} className="settings-row">
                <div className="settings-row-info">
                  <label htmlFor={field.key}>{field.label}</label>
                  <p>{field.desc}</p>
                </div>
                <div className="settings-row-input">
                  <input
                    id={field.key} name={field.key} type="number"
                    step={field.step} min="0"
                    value={form[field.key] ?? ''}
                    onChange={handleChange}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.25rem' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving\u2026' : 'Save Changes'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={saving}>Reset</button>
        </div>
      </form>
      <p className="text-xs text-muted mt-2">Changes take effect immediately for all future operations.</p>
    </div>
  );
}