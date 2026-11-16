import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export const Layout = () => {
  const { authenticated, user, loading } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      // Session will end via server event; fallback navigation.
      navigate('/member-login.html');
    }
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        <Link to="/" className="logo">Jirani Chama</Link>
        {loading ? null : authenticated ? (
          <div className="user-info">
            <span>{user?.name || 'Member'}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <Link to="/member-login.html">Login</Link>
        )}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <small>© 2026 Jirani Chama</small>
      </footer>
    </div>
  );
};
