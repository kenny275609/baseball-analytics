// 打席 / 跑壘 API 的衝突規則：已寫入的 client_id 重送回 200，否則畫面過期回 409
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExistingPlay } from '@/lib/idempotency';

const mocks = vi.hoisted(() => ({
  existing: { kind: 'none' } as ExistingPlay,
  conflict: { ok: true } as { ok: true } | { ok: false; error: string },
  checkRunners: vi.fn(),
  checkExpected: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ authorize: async () => ({ error: null }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/score', () => ({ isMissingTable: () => false, syncGameScore: async () => {} }));
vi.mock('@/lib/basesServer', () => ({ checkRunnersInDb: mocks.checkRunners }));
vi.mock('@/lib/conflictServer', () => ({ checkExpectedInDb: mocks.checkExpected }));
vi.mock('@/lib/idempotency', async (orig) => ({
  ...(await orig<typeof import('@/lib/idempotency')>()),
  findExistingPlay: async () => mocks.existing,
}));

import { POST as createAtbat } from '@/app/api/atbats/create/route';
import { POST as createPlay } from '@/app/api/runner-events/create/route';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GAME = uuid(100);
const C = uuid(3);
const CLIENT = uuid(30);
const X = uuid(10);

const post = (body: unknown) =>
  new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });

const atbatBody = {
  client_id: CLIENT,
  game_id: GAME,
  player_id: C,
  batting_order: 3,
  inning: 1,
  result: 'groundout',
  rbi: 0,
  runners: [{ player_id: C, from_base: 0, to_base: null }],
  expected_last: { kind: 'atbat', id: X },
};

const playBody = {
  client_id: CLIENT,
  game_id: GAME,
  inning: 1,
  event_type: 'pickoff',
  runners: [{ player_id: C, from_base: 1, to_base: null }],
  expected_last: { kind: 'atbat', id: X },
};

beforeEach(() => {
  mocks.existing = { kind: 'none' };
  mocks.checkRunners.mockReset().mockResolvedValue({ kind: 'ok' });
  mocks.checkExpected.mockReset().mockImplementation(async () => mocks.conflict);
  mocks.conflict = { ok: false, error: '衝突' };
});

describe('POST /api/atbats/create 衝突規則', () => {
  it('伺服器已經前進（其他裝置記了同一位打者）：409 conflict，不寫入', async () => {
    const res = await createAtbat(post(atbatBody));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ conflict: true, error: '衝突' });
    expect(mocks.checkExpected).toHaveBeenCalledWith({}, GAME, { kind: 'atbat', id: X });
    // 壘上沒人、跑者沒動時跑者檢查會通過，所以衝突檢查不能只靠它
    expect(mocks.checkRunners).not.toHaveBeenCalled();
  });

  it('client_id 已經寫入（重送）：200 duplicate，不做衝突檢查', async () => {
    mocks.existing = { kind: 'atbat', atbat: { id: 'a1' }, events: [] };
    const res = await createAtbat(post(atbatBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true, atbat: { id: 'a1' } });
    expect(mocks.checkExpected).not.toHaveBeenCalled();
  });

  it('expected_last 格式錯誤：400', async () => {
    const res = await createAtbat(post({ ...atbatBody, expected_last: { kind: 'atbat', id: 'nope' } }));
    expect(res.status).toBe(400);
  });

  it('舊版前端沒帶 expected_last：不做衝突檢查', async () => {
    const { expected_last: _omit, ...legacy } = atbatBody;
    void _omit;
    mocks.checkRunners.mockResolvedValue({ kind: 'invalid', error: '跑者不在壘上' });
    const res = await createAtbat(post(legacy));
    expect(mocks.checkExpected).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });
});

describe('POST /api/runner-events/create 衝突規則', () => {
  it('伺服器已經前進：409 conflict', async () => {
    const res = await createPlay(post(playBody));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ conflict: true });
    expect(mocks.checkRunners).not.toHaveBeenCalled();
  });

  it('client_id 已經寫入：200 duplicate', async () => {
    mocks.existing = { kind: 'play', events: [{ id: 'e1' }] };
    const res = await createPlay(post(playBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(mocks.checkExpected).not.toHaveBeenCalled();
  });

  it('沒有衝突：繼續檢查跑者', async () => {
    mocks.conflict = { ok: true };
    mocks.checkRunners.mockResolvedValue({ kind: 'invalid', error: '跑者不在壘上' });
    const res = await createPlay(post(playBody));
    expect(mocks.checkRunners).toHaveBeenCalled();
    expect(res.status).toBe(400);
  });
});
