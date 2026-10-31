'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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

// 全站共用一份 session/角色；登入登出時跟著 Supabase auth 事件更新
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  // 每次 refresh/clear 都遞增，舊的請求回來時就丟掉，避免登出後又被覆蓋回去
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const res = await fetch('/api/auth/getSession');
      if (!res.ok) throw new Error(`getSession failed: ${res.status}`);
      const data = await res.json();
      if (id === requestId.current) setUser(data.user ?? null);
    } catch (error) {
      console.error('Error fetching user:', error);
      if (id === requestId.current) setUser(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    requestId.current++;
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clear();
      else if (event === 'SIGNED_IN') refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh, clear]);

  // 回到登入頁時不留上一個帳號的資料
  useEffect(() => {
    if (pathname === '/login') clear();
  }, [pathname, clear]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      loading,
      canEdit: user?.role === 'editor' || user?.role === 'admin',
      isAdmin: user?.role === 'admin',
      refresh,
      clear,
    }),
    [user, loading, refresh, clear]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
