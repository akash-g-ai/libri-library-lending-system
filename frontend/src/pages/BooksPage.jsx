import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { BookOpen } from '../components/Icons';

export default function BooksPage() {
  const { isLibrarian, isMember } = useAuth();
  const [books, setBooks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [msg, setMsg]           = useState('');
  const [acting, setActing]     = useState(null);

  async function fetchBooks() {
    setLoading(true);
    try { const { data } = await api.get('/books'); setBooks(data.books); }
    catch { setError('Failed to load books.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { fetchBooks(); }, []);

  async function handleDelete(id) {
    if (!window.confirm('Delete this book?')) return;
    setMsg(''); setError('');
    try { await api.delete(`/books/${id}`); setMsg('Book deleted.'); setBooks(prev => prev.filter(b => b.id !== id)); }
    catch (err) { setError(err.response?.data?.error || 'Delete failed.'); }
  }

  async function handleCheckout(bookId) {
    setMsg(''); setError(''); setActing(bookId);
    try {
      const { data } = await api.post('/loans/checkout', { book_id: bookId });
      setMsg(`"${data.book.title}" checked out! Due: ${data.loan.due_date}`);
      fetchBooks();
    } catch (err) { setError(err.response?.data?.error || 'Checkout failed.'); }
    finally { setActing(null); }
  }

  async function handleReserve(bookId, title) {
    setMsg(''); setError(''); setActing(bookId);
    try {
      await api.post('/reservations', { book_id: bookId });
      setMsg(`Added to the queue for "${title}".`);
    } catch (err) { setError(err.response?.data?.error || 'Reservation failed.'); }
    finally { setActing(null); }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Book Catalogue</h1>
        {isLibrarian && <Link to="/books/new" className="btn btn-primary">+ Add Book</Link>}
      </div>
      {msg   && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="spinner"/> : books.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon"><BookOpen size={40} style={{opacity:.4}}/></div>
          <p>The catalogue is empty.</p>
          {isLibrarian && <Link to="/books/new" className="btn btn-primary mt-2">Add the first book</Link>}
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Author</th><th>Total</th><th>Available</th><th>Actions</th></tr></thead>
            <tbody>
              {books.map(book => (
                <tr key={book.id}>
                  <td><strong>{book.title}</strong></td>
                  <td>{book.author}</td>
                  <td>{book.total_copies}</td>
                  <td><span className={`badge ${book.available_copies > 0 ? 'badge-green' : 'badge-muted'}`}>{book.available_copies}</span></td>
                  <td style={{display:'flex',gap:'.4rem',flexWrap:'wrap'}}>
                    {isMember && book.available_copies > 0 && (
                      <button className="btn btn-primary btn-sm" disabled={acting===book.id} onClick={() => handleCheckout(book.id)}>
                        {acting===book.id ? '…' : 'Checkout'}
                      </button>
                    )}
                    {isMember && book.available_copies === 0 && (
                      <button className="btn btn-secondary btn-sm" disabled={acting===book.id} onClick={() => handleReserve(book.id, book.title)}>
                        {acting===book.id ? '…' : 'Reserve'}
                      </button>
                    )}
                    {isLibrarian && (
                      <>
                        <Link to={`/books/${book.id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
                        <button onClick={() => handleDelete(book.id)} className="btn btn-danger btn-sm">Delete</button>
                      </>
                    )}
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