import { describe, expect, it } from 'vitest';
import { SessionUser, classifySessionResponse, isAuthoritative, resolveSession } from '@/lib/sessionState';

const editor: SessionUser = { id: 'u1', email: 'a@b.c', role: 'editor' };

describe('classifySessionResponse', () => {
  it('fetch 失敗（離線）、5xx、逾時、非 JSON 都是 unavailable', () => {
    expect(classifySessionResponse(null, null)).toEqual({ kind: 'unavailable' });
    expect(classifySessionResponse(500, { error: 'x' })).toEqual({ kind: 'unavailable' });
    expect(classifySessionResponse(503, null)).toEqual({ kind: 'unavailable' });
    expect(classifySessionResponse(504, null)).toEqual({ kind: 'unavailable' });
    expect(classifySessionResponse(408, null)).toEqual({ kind: 'unavailable' });
    // 公共 Wi-Fi 登入頁回 200 HTML
    expect(classifySessionResponse(200, null)).toEqual({ kind: 'unavailable' });
    expect(classifySessionResponse(200, { foo: 1 })).toEqual({ kind: 'unavailable' });
  });

  it('401 / 403 / 200 user:null 是明確的沒登入', () => {
    expect(classifySessionResponse(401, { error: 'x' })).toEqual({ kind: 'unauthorized' });
    expect(classifySessionResponse(403, null)).toEqual({ kind: 'unauthorized' });
    expect(classifySessionResponse(200, { user: null })).toEqual({ kind: 'ok', user: null });
  });

  it('200 帶帳號', () => {
    expect(classifySessionResponse(200, { user: editor })).toEqual({ kind: 'ok', user: editor });
    // 角色不認得的資料不採信
    expect(classifySessionResponse(200, { user: { id: 'u1', role: 'root' } })).toEqual({ kind: 'unavailable' });
  });
});

describe('resolveSession', () => {
  it('網路失敗時保留上一次的帳號與角色（記錄按鈕不會消失）', () => {
    expect(resolveSession(editor, classifySessionResponse(null, null))).toBe(editor);
    expect(resolveSession(editor, classifySessionResponse(502, null))).toBe(editor);
    expect(isAuthoritative(classifySessionResponse(null, null))).toBe(false);
  });

  it('只有伺服器明確回答沒登入才登出', () => {
    expect(resolveSession(editor, classifySessionResponse(401, null))).toBeNull();
    expect(resolveSession(editor, classifySessionResponse(200, { user: null }))).toBeNull();
    expect(isAuthoritative(classifySessionResponse(401, null))).toBe(true);
  });

  it('恢復連線後重新確認：角色更新', () => {
    const offline = resolveSession(editor, classifySessionResponse(null, null));
    const viewer = { ...editor, role: 'viewer' as const };
    expect(resolveSession(offline, classifySessionResponse(200, { user: viewer }))).toEqual(viewer);
  });

  it('離線打開 App：沒有目前帳號時沿用手機上記住的帳號（呼叫端傳入快取）', () => {
    expect(resolveSession(null, classifySessionResponse(null, null))).toBeNull();
    const cached = editor;
    expect(resolveSession(cached, classifySessionResponse(null, null))).toBe(cached);
  });
});
