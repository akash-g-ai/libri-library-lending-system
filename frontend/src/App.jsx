import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';

import LoginPage                  from './pages/LoginPage';
import RegisterPage               from './pages/RegisterPage';
import BooksPage                  from './pages/BooksPage';
import AddBookPage                from './pages/AddBookPage';
import EditBookPage               from './pages/EditBookPage';
import MemberDashboard            from './pages/MemberDashboard';
import LibrarianDashboard         from './pages/LibrarianDashboard';
import MyLoansPage                from './pages/MyLoansPage';
import AllLoansPage               from './pages/AllLoansPage';
import MyFinesPage                from './pages/MyFinesPage';
import FineManagementPage         from './pages/FineManagementPage';
import MyReservationsPage         from './pages/MyReservationsPage';
import ReservationManagementPage  from './pages/ReservationManagementPage';
import LibrarySettingsPage        from './pages/LibrarySettingsPage';

function Layout() {
  const { user, isLibrarian } = useAuth();
  const loc = useLocation();
  const isAuthPage = loc.pathname === '/login' || loc.pathname === '/register';

  // Auth pages render full-screen without sidebar.
  // All other pages render inside the app layout with sidebar.
  if (isAuthPage) {
    return (
      <Routes>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      {user && <Sidebar />}
      <div className="main-content">
        <Routes>
          <Route path="/dashboard" element={
            <ProtectedRoute>
              {isLibrarian ? <LibrarianDashboard /> : <MemberDashboard />}
            </ProtectedRoute>
          } />
          <Route path="/books" element={<ProtectedRoute><BooksPage /></ProtectedRoute>} />
          <Route path="/my-loans"        element={<ProtectedRoute><MyLoansPage /></ProtectedRoute>} />
          <Route path="/my-reservations" element={<ProtectedRoute><MyReservationsPage /></ProtectedRoute>} />
          <Route path="/my-fines"        element={<ProtectedRoute><MyFinesPage /></ProtectedRoute>} />
          <Route path="/books/new"      element={<ProtectedRoute requireLibrarian><AddBookPage /></ProtectedRoute>} />
          <Route path="/books/:id/edit" element={<ProtectedRoute requireLibrarian><EditBookPage /></ProtectedRoute>} />
          <Route path="/loans"          element={<ProtectedRoute requireLibrarian><AllLoansPage /></ProtectedRoute>} />
          <Route path="/fines"          element={<ProtectedRoute requireLibrarian><FineManagementPage /></ProtectedRoute>} />
          <Route path="/reservations"   element={<ProtectedRoute requireLibrarian><ReservationManagementPage /></ProtectedRoute>} />
          <Route path="/settings"       element={<ProtectedRoute requireLibrarian><LibrarySettingsPage /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </AuthProvider>
  );
}