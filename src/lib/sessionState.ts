// 登入狀態判斷（純邏輯，不碰 window/React）：
// 只有伺服器明確回答「沒登入」（401/403，或 200 但 user 為 null）才登出；
// 連不到伺服器（離線、逾時、5xx、公共 Wi-Fi 登入頁）一律保留上一次確認過的帳號與角色，
// 否則比賽中訊號一斷，記錄按鈕、撤銷、帳號選單都會消失
import type { UserRole } from '@/lib/roles';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

export type SessionOutcome =
  | { kind: 'ok'; user: SessionUser | null } // 伺服器確認：已登入（user）或沒登入（null）
  | { kind: 'unauthorized' } // 伺服器確認沒登入
  | { kind: 'unavailable' }; // 沒有得到可信的答案，維持原狀

const ROLES: UserRole[] = ['admin', 'editor', 'viewer', 'pending'];

export function parseSessionUser(value: unknown): SessionUser | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) return null;
  if (typeof v.role !== 'string' || !ROLES.includes(v.role as UserRole)) return null;
  return { id: v.id, email: typeof v.email === 'string' ? v.email : '', role: v.role as UserRole };
}

// status 為 null 表示 fetch 本身失敗（沒有連線）
export function classifySessionResponse(status: number | null, data: unknown): SessionOutcome {
  if (status === null) return { kind: 'unavailable' };
  if (status === 401 || status === 403) return { kind: 'unauthorized' };
  if (status >= 200 && status < 300) {
    // 不是我們 API 的 JSON（例如公共 Wi-Fi 的登入頁）當作沒連上
    if (!data || typeof data !== 'object' || !('user' in data)) return { kind: 'unavailable' };
    const raw = (data as { user: unknown }).user;
    if (raw === null) return { kind: 'ok', user: null };
    const user = parseSessionUser(raw);
    return user ? { kind: 'ok', user } : { kind: 'unavailable' };
  }
  return { kind: 'unavailable' };
}

// current = 畫面上目前的帳號（剛打開 App 時是手機上記住的上一次帳號）
export function resolveSession(current: SessionUser | null, outcome: SessionOutcome): SessionUser | null {
  switch (outcome.kind) {
    case 'ok':
      return outcome.user;
    case 'unauthorized':
      return null;
    case 'unavailable':
      return current;
  }
}

// 伺服器有明確答案時才更新手機上記住的帳號
export function isAuthoritative(outcome: SessionOutcome): boolean {
  return outcome.kind !== 'unavailable';
}
