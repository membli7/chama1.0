import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

/**
 * AuthProvider checks the session endpoint on mount and provides auth state.
 * It also exposes a `forcePinChange` helper used by PinChangeOverlay.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const resp = await fetch('/api/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await resp.json();
      setAuthenticated(data?.authenticated === true);
      if (data?.authenticated) {
        setUser(data.user || null);
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error('Session fetch failed', e);
      setAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
    const endListener = () => {
      setAuthenticated(false);
      setUser(null);
    };
    window.addEventListener('chama:session-ended', endListener);
    return () => window.removeEventListener('chama:session-ended', endListener);
  }, [fetchSession]);

  const forcePinChange = useCallback(() => {
    // Placeholder: existing PinChangeOverlay expects this event.
    const ev = new Event('chama:pin-change-required');
    window.dispatchEvent(ev);
  }, []);

  const value = {
    user,
    authenticated,
    loading,
    forcePinChange,
    refetch: fetchSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
