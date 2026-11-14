import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';

export default function AddBookPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', author: '', total_copies: 1, available_copies: 1 });
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name.includes('copies') ? parseInt(value, 10) || 0 : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault(); setErrors([]); setLoading(true);
    try { await api.post('/books', form); navigate('/books'); }
    catch (err) {
      const body = err.response?.data;
      if (body?.errors) setErrors(body.errors);
      else setErrors([body?.error || 'Failed to add book.']);
    } finally { setLoading(false); }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Add New Book</h1>
        <Link to="/books" className="btn btn-secondary">← Back</Link>
      </div>
      <div className="card" style={{maxWidth:560}}>
        {errors.length > 0 && <div className="alert alert-error">{errors.map((e,i) => <div key={i}>{e}</div>)}</div>}
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input id="title" name="title" value={form.title} onChange={handleChange} required/>
          </div>
          <div className="form-group">
            <label htmlFor="author">Author *</label>
            <input id="author" name="author" value={form.author} onChange={handleChange} required/>
          </div>
          <div className="form-group">
            <label htmlFor="total_copies">Total Copies</label>
            <input id="total_copies" name="total_copies" type="number" min="0" value={form.total_copies} onChange={handleChange}/>
          </div>
          <div className="form-group">
            <label htmlFor="available_copies">Available Copies</label>
            <input id="available_copies" name="available_copies" type="number" min="0" value={form.available_copies} onChange={handleChange}/>
            <div className="form-hint">Cannot exceed total copies.</div>
          </div>
          <button className="btn btn-primary" style={{width:'100%'}} disabled={loading}>{loading ? 'Saving�' : 'Add Book'}</button>
        </form>
      </div>
    </div>
  );
}