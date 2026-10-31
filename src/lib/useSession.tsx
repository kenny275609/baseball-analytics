'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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

function parseCachedUser(raw: string | null): SessionUser | null {
  try {
    return raw ? parseSessionUser(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function readCachedRaw(): string | null {
  try {
    return window.localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

function readCachedUser(): SessionUser | null {
  return parseCachedUser(readCachedRaw());
}

// 記住的帳號改變時通知畫面（useSyncExternalStore）
const cacheListeners = new Set<() => void>();
function subscribeCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

// 不會丟出例外：連不上伺服器（含訊號差卡住 5 秒）時回傳 unavailable
async function fetchSession(): Promise<SessionOutcome> {
  try {
    const res = await fetch('/api/auth/getSession', { cache: 'no-store', signal: AbortSignal.timeout?.(5000) });
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
  for (const l of cacheListeners) l();
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

  // 回到登入頁時不留上一個帳號的資料：畫面上直接當作沒登入，手機上記住的帳號也清掉。
  // React state 在 render 時同步重置（不在 effect 裡 setState）；離開登入頁（返回鍵、導覽列）
  // 時先顯示載入中，再重新向伺服器確認，不會讓上一個帳號在畫面上復活
  const onLoginPage = pathname === '/login';
  const [loginShown, setLoginShown] = useState(onLoginPage);
  if (loginShown !== onLoginPage) {
    setLoginShown(onLoginPage);
    setUser(null);
    setLoading(!onLoginPage);
  }
  const wasOnLogin = useRef(false);
  // 要排在下面初次 refresh 的 effect 前面：直接開登入頁時先清掉記住的帳號，
  // 初次 refresh 才不會讀到它，也不會因為 requestId 被加一而丟掉結果、一直停在載入中
  useEffect(() => {
    if (onLoginPage) {
      wasOnLogin.current = true;
      requestId.current++;
      userRef.current = null;
      writeCachedUser(null);
      return;
    }
    if (wasOnLogin.current) {
      wasOnLogin.current = false;
      void refresh();
    }
  }, [onLoginPage, refresh]);

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

  // 伺服器還沒回答前先用手機上記住的帳號：訊號差（有連線但送不出去）時不用等就能記錄，
  // 伺服器回答後以伺服器為準。伺服器端 render 沒有 localStorage，回傳 null 避免 hydration 不一致
  const cachedRaw = useSyncExternalStore(subscribeCache, readCachedRaw, () => null);
  const cachedUser = useMemo(() => parseCachedUser(cachedRaw), [cachedRaw]);

  const value = useMemo<SessionContextValue>(() => {
    const known = loading ? (user ?? cachedUser) : user;
    const current = onLoginPage ? null : known;
    return {
      user: current,
      loading: onLoginPage ? false : loading && !current,
      canEdit: current?.role === 'editor' || current?.role === 'admin',
      isAdmin: current?.role === 'admin',
      refresh,
      clear,
    };
  }, [onLoginPage, user, cachedUser, loading, refresh, clear]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
