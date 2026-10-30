'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UserRole } from '@/lib/roles';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

interface SessionContextValue {
  user: SessionUser | null;
  loading: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// 全站只抓一次 session/角色，各頁和 Navbar 共用；登入是整頁跳轉，會重新掛載重新抓
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/getSession');
      const data = await res.json();
      setUser(data.user ?? null);
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => setUser(null), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value: SessionContextValue = {
    user,
    loading,
    canEdit: user?.role === 'editor' || user?.role === 'admin',
    isAdmin: user?.role === 'admin',
    refresh,
    clear,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
