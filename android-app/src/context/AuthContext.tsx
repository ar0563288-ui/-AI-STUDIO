import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, mobileApi, MobileUser, setToken } from '../api/client';

interface AuthState {
  user: MobileUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    const res = await mobileApi.me();
    setUser(res.user);
  }

  useEffect(() => {
    (async () => {
      try {
        const existing = await getToken();
        if (existing) {
          await refreshUser();
        }
      } catch {
        await setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function signIn(email: string, password: string) {
    const res = await mobileApi.login(email, password);
    await setToken(res.token);
    setUser(res.user);
  }

  async function signUp(email: string, password: string, fullName: string) {
    const res = await mobileApi.register(email, password, fullName);
    await setToken(res.token);
    setUser(res.user);
  }

  async function signInDemo() {
    const res = await mobileApi.demoLogin();
    await setToken(res.token);
    setUser(res.user);
  }

  async function signOut() {
    await setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, signInDemo, refreshUser, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
