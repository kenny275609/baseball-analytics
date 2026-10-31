import { describe, expect, it } from 'vitest';
import { RunnerEvent, computeBases, outsInInning, runsByInning } from '@/lib/baserunning';
import { resultToFields } from '@/lib/atbat';
import { latestAction, parseUndoRequest, sameTarget, timeKey, withoutTarget } from '@/lib/undo';
import { isUuid } from '@/lib/baserunning';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P1 = uuid(1);
const P2 = uuid(2);
const GAME = uuid(100);

const at = (sec: number, micro = 0) =>
  `2026-11-01T10:00:${String(sec).padStart(2, '0')}.${String(micro).padStart(6, '0')}+00:00`;

function ev(
  id: string,
  play: string,
  atbatId: string | null,
  playerId: string,
  from: number,
  to: number | null,
  created: string,
  inning = 1
): RunnerEvent {
  return {
    id,
    game_id: GAME,
    atbat_id: atbatId,
    play_id: play,
    inning,
    runner_player_id: playerId,
    from_base: from,
    to_base: to,
    event_type: atbatId ? (from === 0 ? 'batter' : 'runner') : 'other',
    created_at: created,
    players: null,
  };
}

const atbat = (id: string, created: string, code: Parameters<typeof resultToFields>[0] = 'single', inning = 1) => ({
  id,
  created_at: created,
  inning,
  ...resultToFields(code),
});

describe('latestAction', () => {
  it('沒有紀錄回傳 null', () => {
    expect(latestAction([], [])).toBeNull();
  });

  it('只有打席：最後建立的打席', () => {
    const r = latestAction([atbat('a1', at(1)), atbat('a2', at(5)), atbat('a3', at(3))], []);
    expect(r).toEqual({ kind: 'atbat', id: 'a2', created_at: at(5) });
  });

  it('打席自己的跑壘事件（時間比打席晚）不會被當成另一筆動作', () => {
    const r = latestAction(
      [atbat('a1', at(1))],
      [ev('e1', 'p1', 'a1', P1, 0, 1, at(1, 500)), ev('e2', 'p1', 'a1', P2, 1, 3, at(1, 500))]
    );
    expect(r).toEqual({ kind: 'atbat', id: 'a1', created_at: at(1) });
  });

  it('打席之後記的牽制/其他推進是最後一筆', () => {
    const r = latestAction(
      [atbat('a1', at(1))],
      [ev('e1', 'p1', 'a1', P1, 0, 1, at(1, 500)), ev('e2', 'p2', null, P1, 1, 2, at(9))]
    );
    expect(r).toEqual({ kind: 'play', play_id: 'p2', created_at: at(9) });
  });

  it('跑壘事件之後又記了打席：打席是最後一筆', () => {
    const r = latestAction(
      [atbat('a1', at(1)), atbat('a2', at(20))],
      [ev('e2', 'p2', null, P1, 1, 2, at(9))]
    );
    expect(r).toEqual({ kind: 'atbat', id: 'a2', created_at: at(20) });
  });

  it('比較到微秒（Date.parse 只有毫秒）', () => {
    const r = latestAction([atbat('a1', at(1, 1)), atbat('a2', at(1, 2))], []);
    expect(r).toMatchObject({ id: 'a2' });
    expect(timeKey(at(1, 2))).toBeGreaterThan(timeKey(at(1, 1)));
  });

  it('不同時區寫法也能正確比較', () => {
    const r = latestAction(
      [atbat('a1', '2026-11-01T18:00:05.000000+08:00'), atbat('a2', '2026-11-01T10:00:06.000000Z')],
      []
    );
    expect(r).toMatchObject({ id: 'a2' });
  });

  it('時間相同時用 id 決定（和 API 排序一致）', () => {
    expect(latestAction([atbat('a1', at(1)), atbat('a2', at(1))], [])).toMatchObject({ id: 'a2' });
  });
});

describe('sameTarget / parseUndoRequest', () => {
  it('比對種類與 id', () => {
    expect(sameTarget({ kind: 'atbat', id: 'x' }, { kind: 'atbat', id: 'x' })).toBe(true);
    expect(sameTarget({ kind: 'atbat', id: 'x' }, { kind: 'atbat', id: 'y' })).toBe(false);
    expect(sameTarget({ kind: 'atbat', id: 'x' }, { kind: 'play', play_id: 'x' })).toBe(false);
    expect(sameTarget({ kind: 'play', play_id: 'p' }, { kind: 'play', play_id: 'p' })).toBe(true);
    expect(sameTarget(null, null)).toBe(true);
    expect(sameTarget(null, { kind: 'play', play_id: 'p' })).toBe(false);
  });

  it('只接受格式正確的 UUID', () => {
    expect(parseUndoRequest({ kind: 'atbat', id: P1 }, isUuid)).toEqual({ kind: 'atbat', id: P1 });
    expect(parseUndoRequest({ kind: 'play', play_id: P2 }, isUuid)).toEqual({ kind: 'play', play_id: P2 });
    expect(parseUndoRequest({ kind: 'atbat', id: 'abc' }, isUuid)).toBeNull();
    expect(parseUndoRequest({ kind: 'play', id: P1 }, isUuid)).toBeNull();
    expect(parseUndoRequest(null, isUuid)).toBeNull();
    expect(parseUndoRequest('atbat', isUuid)).toBeNull();
  });
});

describe('撤銷後壘包、出局、比分回到前一個狀態', () => {
  // 1 局：P1 一壘安打 → P2 二壘安打（P1 回本壘得分）
  const atbats = [atbat('a1', at(1)), atbat('a2', at(10), 'double')];
  const events = [
    ev('e1', 'p1', 'a1', P1, 0, 1, at(1, 100)),
    ev('e2', 'p2', 'a2', P2, 0, 2, at(10, 100)),
    ev('e3', 'p2', 'a2', P1, 1, 4, at(10, 100)),
  ];

  it('撤銷打席會一起拿掉它造成的跑壘與得分', () => {
    expect(runsByInning(events).get(1)).toBe(1);
    const target = latestAction(atbats, events)!;
    expect(target).toMatchObject({ kind: 'atbat', id: 'a2' });
    const after = withoutTarget(atbats, events, target);
    expect(after.atbats.map((a) => a.id)).toEqual(['a1']);
    expect(after.events.map((e) => e.id)).toEqual(['e1']);
    const bases = computeBases(after.events, 1);
    expect(bases[1]?.playerId).toBe(P1);
    expect(bases[2]).toBeNull();
    expect(runsByInning(after.events).get(1)).toBeUndefined();
  });

  it('撤銷牽制出局：跑者回到壘上、出局數減一', () => {
    const withPickoff = [...events.slice(0, 1), ev('e9', 'p9', null, P1, 1, null, at(20))];
    expect(outsInInning([atbats[0]], withPickoff, 1)).toBe(1);
    expect(computeBases(withPickoff, 1)[1]).toBeNull();
    const target = latestAction([atbats[0]], withPickoff)!;
    expect(target).toEqual({ kind: 'play', play_id: 'p9', created_at: at(20) });
    const after = withoutTarget([atbats[0]], withPickoff, target);
    expect(after.atbats).toHaveLength(1);
    expect(outsInInning(after.atbats, after.events, 1)).toBe(0);
    expect(computeBases(after.events, 1)[1]?.playerId).toBe(P1);
  });

  it('連續撤銷依時間倒退', () => {
    let a = atbats;
    let e = events;
    const order: string[] = [];
    for (;;) {
      const t = latestAction(a, e);
      if (!t) break;
      order.push(t.kind === 'atbat' ? t.id : t.play_id);
      ({ atbats: a, events: e } = withoutTarget(a, e, t));
    }
    expect(order).toEqual(['a2', 'a1']);
    expect(e).toEqual([]);
  });
});
