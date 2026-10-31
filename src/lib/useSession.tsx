'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clearCachedGames } from '@/lib/gameCache';
import {
  SessionOutcome,
  SessionUser,
  classifySessionResponse,
  isAuthoritative,
  parseSessionUser,
  resolveSession,
} from '@/lib/sessionState';

export type { SessionUser };

// 上一次伺服器確認過的帳號與角色：離線打開 App 時仍能記錄（真正的權限由 API 檢查）
const CACHE_KEY = 'bk:session-user';

function readCachedUser(): SessionUser | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? parseSessionUser(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// 不會丟出例外：連不上伺服器時回傳 unavailable
async function fetchSession(): Promise<SessionOutcome> {
  try {
    const res = await fetch('/api/auth/getSession', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    return classifySessionResponse(res.status, data);
  } catch {
    return classifySessionResponse(null, null);
  }
}

function writeCachedUser(user: SessionUser | null) {
  try {
    if (user) window.localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else {
      window.localStorage.removeItem(CACHE_KEY);
      clearCachedGames(window.localStorage);
    }
  } catch {
    // 無痕模式等寫不進去：只是離線時沒有快取可用
  }
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
  const userRef = useRef<SessionUser | null>(null);

  // 網路失敗（離線、逾時、5xx）保留上一次的帳號；只有伺服器明確回答沒登入才登出
  const refresh = useCallback((): Promise<void> => {
    const id = ++requestId.current;
    return fetchSession().then((outcome) => {
      if (id !== requestId.current) return;
      if (!isAuthoritative(outcome)) console.warn('無法確認登入狀態，沿用上一次的帳號');
      const next = resolveSession(userRef.current ?? readCachedUser(), outcome);
      if (isAuthoritative(outcome)) writeCachedUser(next);
      userRef.current = next;
      setUser(next);
      setLoading(false);
    });
  }, []);

  const clear = useCallback(() => {
    requestId.current++;
    writeCachedUser(null);
    userRef.current = null;
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clear();
      else if (event === 'SIGNED_IN') void refresh();
    });
    // 恢復連線、回到前景時重新確認登入狀態（離線期間沿用的帳號在這時更新）
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, clear]);

  // 回到登入頁時不留上一個帳號的資料：畫面上直接當作沒登入，手機上記住的帳號也清掉
  const onLoginPage = pathname === '/login';
  useEffect(() => {
    if (!onLoginPage) return;
    requestId.current++;
    userRef.current = null;
    writeCachedUser(null);
  }, [onLoginPage]);

  const value = useMemo<SessionContextValue>(() => {
    const current = onLoginPage ? null : user;
    return {
      user: current,
      loading: onLoginPage ? false : loading,
      canEdit: current?.role === 'editor' || current?.role === 'admin',
      isAdmin: current?.role === 'admin',
      refresh,
      clear,
    };
  }, [onLoginPage, user, loading, refresh, clear]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
