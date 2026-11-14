import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { googleSignInError } from '../lib/googleAuthError';
import type { AuthUserSummary, RoleCode } from '../types/domain';

interface AuthContextValue {
  user: AuthUserSummary | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  apiFetch: <T = unknown>(url: string, options?: RequestInit) => Promise<T>;
  signInWithGoogle: () => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<{ mfaChallengeRequired?: boolean }>;
  registerAccount: (payload: Record<string, unknown>) => Promise<void>;
  switchRole: (role: RoleCode) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUserSummary | null>(null);
  const [token, setToken] = useState<string | null>(null); // Memory-only storage (never localStorage)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiFetchWithToken = useCallback(
    async <T = unknown>(url: string, authToken: string | null, options: RequestInit = {}): Promise<T> => {
      const headers = new Headers(options.headers || {});
      if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }
      if (authToken) {
        headers.set('Authorization', `Bearer ${authToken}`);
      }
      if (user?.activeRole) {
        headers.set('X-Active-Role', user.activeRole);
      }

      const res = await fetch(url, { ...options, headers, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data as T;
    },
    [user?.activeRole]
  );

  const apiFetch = useCallback(
    async <T = unknown>(url: string, options: RequestInit = {}): Promise<T> => {
      return apiFetchWithToken<T>(url, token, options);
    },
    [apiFetchWithToken, token]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          setToken(idToken);
          const data = await apiFetchWithToken<{ user: AuthUserSummary }>('/api/auth/me', idToken);
          setUser(data.user);
        } catch (err: any) {
          console.error('Firebase session sync failed:', err);
          setError(err.message || 'Could not sync account session.');
        }
      } else {
        // Hydrate server-backed PostgreSQL session cookie if present
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' });
          if (res.ok) {
            const data = (await res.json()) as { user?: AuthUserSummary };
            if (data.user) {
              setUser(data.user);
            }
          }
        } catch {
          // No active session cookie
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [apiFetchWithToken]);

  const signInWithGoogle = async () => {
    setError(null);
    let cred;
    try {
      cred = await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      throw googleSignInError(err, window.location.hostname);
    }
    const idToken = await cred.user.getIdToken();
    setToken(idToken);
    const data = await apiFetchWithToken<{ user: AuthUserSummary }>('/api/auth/me', idToken);
    setUser(data.user);
  };

  const loginWithPassword = async (email: string, password: string) => {
    setError(null);
    const data = await apiFetchWithToken<{
      token: string;
      user: AuthUserSummary;
      mfaChallengeRequired?: boolean;
    }>('/api/auth/login', null, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setUser(data.user);
    return { mfaChallengeRequired: data.mfaChallengeRequired };
  };

  const registerAccount = async (payload: Record<string, unknown>) => {
    setError(null);
    const data = await apiFetchWithToken<{ token: string; user: AuthUserSummary }>(
      '/api/auth/register',
      null,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    setToken(data.token);
    setUser(data.user);
  };

  const switchRole = async (role: RoleCode) => {
    const data = await apiFetchWithToken<{ user: AuthUserSummary }>('/api/auth/switch-role', token, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    setUser(data.user);
  };

  const refreshUser = async () => {
    const data = await apiFetchWithToken<{ user: AuthUserSummary }>('/api/auth/me', token);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // Best-effort server logout
    }
    try {
      await signOut(auth);
    } catch {
      // Ignore if signed in via password session
    }
    setToken(null);
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        apiFetch,
        signInWithGoogle,
        loginWithPassword,
        registerAccount,
        switchRole,
        refreshUser,
        logout,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
