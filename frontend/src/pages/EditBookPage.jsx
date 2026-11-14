import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../api/client';

export default function EditBookPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', author: '', total_copies: 0, available_copies: 0 });
  const [errors, setErrors] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    api.get(`/books/${id}`)
      .then(({ data }) => setForm({ title: data.book.title, author: data.book.author, total_copies: data.book.total_copies, available_copies: data.book.available_copies }))
      .catch(() => setFetchError('Book not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name.includes('copies') ? parseInt(value, 10) || 0 : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault(); setErrors([]); setSaving(true);
    try { await api.put(`/books/${id}`, form); navigate('/books'); }
    catch (err) {
      const body = err.response?.data;
      if (body?.errors) setErrors(body.errors);
      else setErrors([body?.error || 'Update failed.']);
    } finally { setSaving(false); }
  }

  if (loading) return <div className="page"><div className="spinner"/></div>;
  if (fetchError) return <div className="page"><div className="alert alert-error">{fetchError}</div><Link to="/books">Back</Link></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Edit Book</h1>
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
          </div>
          <button className="btn btn-primary" style={{width:'100%'}} disabled={saving}>{saving ? 'Saving�' : 'Save Changes'}</button>
        </form>
      </div>
    </div>
  );
}