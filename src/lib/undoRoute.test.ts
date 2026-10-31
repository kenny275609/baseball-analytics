// /api/games/undo 撤銷換人：只有換人是最後一筆動作時才撤銷，否則 409
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UndoTarget } from '@/lib/undo';

const mocks = vi.hoisted(() => ({
  latest: null as UndoTarget | null,
  undoSub: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ authorize: async () => ({ error: null }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/score', () => ({ isMissingTable: () => false, syncGameScore: async () => {} }));
vi.mock('@/lib/conflictServer', () => ({ findLatest: async () => mocks.latest }));
vi.mock('@/lib/substitutionServer', () => ({ undoSubstitution: mocks.undoSub }));

import { POST as undo } from '@/app/api/games/undo/route';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GAME = uuid(100);
const SUB = uuid(50);
const AB = uuid(60);

const post = (body: unknown) => new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  mocks.undoSub.mockReset().mockResolvedValue({ ok: true });
});

describe('POST /api/games/undo 換人', () => {
  it('換人是最後一筆：撤銷換人（打序還原）', async () => {
    mocks.latest = { kind: 'sub', id: SUB, created_at: '2026-11-01T10:00:00Z' };
    const res = await undo(post({ game_id: GAME, target: { kind: 'sub', id: SUB } }));
    expect(res.status).toBe(200);
    expect(mocks.undoSub).toHaveBeenCalledWith({}, GAME, SUB);
  });

  it('換人之後已經有打席：要撤銷的換人不是最後一筆，409', async () => {
    mocks.latest = { kind: 'atbat', id: AB, created_at: '2026-11-01T10:05:00Z' };
    const res = await undo(post({ game_id: GAME, target: { kind: 'sub', id: SUB } }));
    expect(res.status).toBe(409);
    expect(mocks.undoSub).not.toHaveBeenCalled();
  });

  it('其他裝置剛換人：畫面上要撤銷的打席已不是最後一筆，409', async () => {
    mocks.latest = { kind: 'sub', id: SUB, created_at: '2026-11-01T10:05:00Z' };
    const res = await undo(post({ game_id: GAME, target: { kind: 'atbat', id: AB } }));
    expect(res.status).toBe(409);
  });

  it('打序無法還原：回傳 undoSubstitution 的錯誤', async () => {
    mocks.latest = { kind: 'sub', id: SUB, created_at: '2026-11-01T10:00:00Z' };
    mocks.undoSub.mockResolvedValue({ ok: false, status: 409, error: '無法撤銷' });
    const res = await undo(post({ game_id: GAME, target: { kind: 'sub', id: SUB } }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: '無法撤銷' });
  });
});
