import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Guards routes that require authentication.
 * Checks React state first, then falls back to localStorage
 * to handle the race between setUser() and navigate() after login.
 */
export default function ProtectedRoute({ children, requireLibrarian = false }) {
  const { user, isLibrarian } = useAuth();

  // If React state hasn't propagated yet (race after login),
  // check localStorage which was written synchronously by login().
  if (!user) {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (requireLibrarian && parsed.role !== 'librarian') {
          return <Navigate to="/dashboard" replace />;
        }
        return children;
      }
    } catch { /* invalid JSON — fall through to redirect */ }
    return <Navigate to="/login" replace />;
  }

  if (requireLibrarian && !isLibrarian) return <Navigate to="/dashboard" replace />;
  return children;
}