'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/useSession';
import {
  DEFENSE_RESULTS,
  DefensePlay,
  DefenseResult,
  POSITIONS,
  currentDefenseInning,
  defenseNotation,
  fieldingStats,
  getDefenseResult,
  pathError,
  playsByInning,
  positionLabel,
} from '@/lib/defense';

interface Player {
  id: string;
  name: string;
  number: string | null;
}

interface GameInfo {
  opponent: string;
  game_date: string;
  status: 'live' | 'final';
}

const playerText = (p: Player | undefined) => (p ? `${p.number ? `#${p.number} ` : ''}${p.name}` : '');

export default function DefensePage() {
  const params = useParams();
  const gameId = params.id as string;
  const { canEdit } = useSession();

  const [game, setGame] = useState<GameInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [positions, setPositions] = useState<Map<number, string>>(new Map());
  const [plays, setPlays] = useState<DefensePlay[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [inning, setInning] = useState(1);
  const [result, setResult] = useState<DefenseResult | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  // 對手每局得分（和比賽頁記分板同一份資料）
  // 目前打序上的球員：被換下的人還排在守備位置上時提醒更新
  const [lineupIds, setLineupIds] = useState<Set<string> | null>(null);
  const [oppRuns, setOppRuns] = useState<Map<number, number>>(new Map());

  const load = useCallback(async () => {
    try {
      const [gameRes, playersRes, defRes] = await Promise.all([
        fetch(`/api/games/get?id=${gameId}`),
        fetch('/api/players/list'),
        fetch(`/api/defense/get?game_id=${gameId}`),
      ]);
      if (!gameRes.ok) throw new Error(gameRes.status === 404 ? '找不到這場比賽' : '載入失敗');
      if (!defRes.ok) throw new Error('載入防守紀錄失敗');
      const g = await gameRes.json();
      const ps = playersRes.ok ? (await playersRes.json()).players : [];
      const d = await defRes.json();
      setGame(g.game);
      setLineupIds(new Set((g.lineup as { player_id: string }[]).map((l) => l.player_id)));
      setOppRuns(new Map((g.innings as { inning: number; opp_runs: number | null }[]).filter((x) => x.opp_runs !== null).map((x) => [x.inning, x.opp_runs as number])));
      setPlayers(ps);
      setReady(d.ready);
      setPositions(new Map((d.positions as { position: number; player_id: string }[]).map((p) => [p.position, p.player_id])));
      setPlays(d.plays);
      setInning(currentDefenseInning(d.plays));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load]);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const byInning = useMemo(() => playsByInning(plays), [plays]);
  const stats = useMemo(() => fieldingStats(plays), [plays]);
  const inningList = byInning.get(inning) ?? [];
  const outsNow = inningList.length ? inningList[inningList.length - 1].outsAfter : 0;

  const benched = lineupIds
    ? POSITIONS.filter((p) => positions.has(p.pos) && !lineupIds.has(positions.get(p.pos)!))
    : [];

  const option = getDefenseResult(result);
  const draftError = result ? pathError(result, path) : null;
  const editable = canEdit && ready && game?.status === 'live';

  const pickResult = (code: DefenseResult) => {
    setResult(code);
    const opt = getDefenseResult(code);
    if (opt?.path === 'none') setPath([]);
    setNotice('');
  };

  const tapPosition = (pos: number) => {
    if (!option || option.path === 'none') return;
    // 只記一個位置的結果：點別的位置直接換掉
    const single = option.path === 'optional' || code1(option.code);
    setPath((p) => (single ? [pos] : [...p, pos]));
  };

  const save = async () => {
    if (!result || draftError) return;
    if (outsNow + (option?.outs ?? 0) > 3 && !window.confirm(`第 ${inning} 局會超過 3 出局，確定要記錄嗎？`)) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/defense/plays/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, client_id: crypto.randomUUID(), inning, result, path }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || '記錄失敗');
      const next = [...plays, body.play as DefensePlay];
      setPlays(next);
      const outsAfter = outsNow + (option?.outs ?? 0);
      let msg = `已記錄：${defenseNotation(result, body.play.path)}（${option?.label}）`;
      if (outsAfter >= 3 && inning < 30) {
        msg += `。三出局，換到第 ${inning + 1} 局`;
        setInning(inning + 1);
      }
      setNotice(msg);
      setResult(null);
      setPath([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '記錄失敗');
    } finally {
      setSaving(false);
    }
  };

  const removePlay = async (play: DefensePlay) => {
    if (!window.confirm(`刪除第 ${play.inning} 局的「${defenseNotation(play.result, play.path)}」？`)) return;
    setError('');
    try {
      const res = await fetch('/api/defense/plays/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: play.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '刪除失敗');
      setPlays((ps) => ps.filter((p) => p.id !== play.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    }
  };

  const saveOppRuns = async (n: number, runs: number) => {
    setError('');
    const prev = oppRuns;
    setOppRuns(new Map(oppRuns).set(n, runs));
    try {
      const res = await fetch('/api/games/innings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, inning: n, opp_runs: runs }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '儲存得分失敗');
    } catch (err) {
      setOppRuns(prev);
      setError(err instanceof Error ? err.message : '儲存得分失敗');
    }
  };

  const setPosition = async (position: number, playerId: string | null) => {
    setError('');
    const prev = positions;
    const next = new Map(positions);
    for (const [pos, id] of next) if (id === playerId) next.delete(pos);
    if (playerId) next.set(position, playerId);
    else next.delete(position);
    setPositions(next);
    try {
      const res = await fetch('/api/defense/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, position, player_id: playerId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '設定失敗');
    } catch (err) {
      setPositions(prev);
      setError(err instanceof Error ? err.message : '設定失敗');
    }
  };

  if (loading) return <div className="text-center py-12">載入中...</div>;
  if (!game) return <div className="text-center py-12 text-red-600">{error || '找不到這場比賽'}</div>;

  const innings = [...byInning.keys()].sort((a, b) => a - b);

  return (
    <div className="container mx-auto px-4 py-4 max-w-2xl space-y-4 pb-16">
      <div className="flex items-center justify-between">
        <Link href={`/games/${gameId}`}>
          <Button variant="outline" size="sm">← 回比賽</Button>
        </Link>
        <span className="text-sm text-gray-500">{game.status === 'live' ? '進行中' : '已結束'}</span>
      </div>

      <div>
        <div className="text-sm text-gray-500">{game.game_date}</div>
        <h1 className="text-2xl font-bold">防守紀錄 · vs {game.opponent}</h1>
      </div>

      {!ready && (
        <div className="text-sm text-amber-900 bg-amber-50 p-3 rounded-md">
          防守紀錄尚未啟用：請先在 Supabase 執行 migration 20261107000000_defense.sql
        </div>
      )}
      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

      {/* 守備位置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">守備位置</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {POSITIONS.map((p) => (
              <label key={p.pos} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-gray-600">
                  {p.pos} {p.label}
                </span>
                <select
                  className="h-10 flex-1 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-base"
                  value={positions.get(p.pos) ?? ''}
                  disabled={!editable}
                  onChange={(e) => setPosition(p.pos, e.target.value || null)}
                >
                  <option value="">—</option>
                  {players.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {playerText(pl)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {editable && benched.length > 0 && (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">
              {benched.map((p) => `${p.label} ${playerText(playerById.get(positions.get(p.pos)!)) || ''}`).join('、')}
              {' '}已經換下場（不在目前打序），請改成上場的球員
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">換守備位置後，之前記錄的刺殺、助殺仍算在當時守那個位置的球員。</p>
        </CardContent>
      </Card>

      {/* 記錄 */}
      {editable && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon-sm" onClick={() => setInning((n) => Math.max(1, n - 1))}>◀</Button>
                <span className="w-14 text-center font-bold">{inning} 局</span>
                <Button type="button" variant="outline" size="icon-sm" onClick={() => setInning((n) => Math.min(30, n + 1))}>▶</Button>
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-600">
                出局
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`inline-block h-3.5 w-3.5 rounded-full border-2 border-red-600 ${i < outsNow ? 'bg-red-600' : ''}`} />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">第 {inning} 局對手得分</span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => saveOppRuns(inning, Math.max(0, (oppRuns.get(inning) ?? 0) - 1))}
                disabled={(oppRuns.get(inning) ?? 0) <= 0}
              >
                −
              </Button>
              <span className="w-6 text-center text-base font-bold tabular-nums">{oppRuns.get(inning) ?? 0}</span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => saveOppRuns(inning, Math.min(99, (oppRuns.get(inning) ?? 0) + 1))}>
                +
              </Button>
              <span className="text-xs text-gray-500">（同步到記分板）</span>
            </div>

            {notice && <div className="text-sm text-green-800 bg-green-50 p-2 rounded-md">{notice}</div>}

            <div>
              <div className="mb-1.5 text-sm font-medium">1. 結果</div>
              <div className="grid grid-cols-4 gap-1.5">
                {DEFENSE_RESULTS.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => pickResult(o.code)}
                    className={`h-12 rounded-lg border-2 px-1 leading-tight ${
                      result === o.code
                        ? 'bg-primary border-primary text-primary-foreground'
                        : o.group === 'out'
                          ? 'bg-white border-blue-200'
                          : 'bg-white border-red-200'
                    }`}
                  >
                    <div className="text-sm font-bold">{o.short}</div>
                    <div className="text-[11px]">{o.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {option && option.path !== 'none' && (
              <div>
                <div className="mb-1.5 text-sm font-medium">
                  2. {pathHint(option.code)}
                  {option.path === 'optional' && <span className="text-gray-500">（可略過）</span>}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {POSITIONS.map((p) => {
                    const pl = playerById.get(positions.get(p.pos) ?? '');
                    return (
                      <button
                        key={p.pos}
                        type="button"
                        onClick={() => tapPosition(p.pos)}
                        className="h-14 rounded-lg border-2 border-gray-200 bg-white px-0.5 leading-tight active:bg-gray-100"
                      >
                        <div className="text-base font-bold">
                          {p.pos}
                          <span className="ml-0.5 text-xs font-normal">{p.short}</span>
                        </div>
                        <div className="truncate text-[11px] text-gray-500">{pl?.name ?? ''}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 rounded-md bg-gray-50 px-3 py-2 font-mono text-lg font-bold">
                    {path.length ? path.join(' - ') : <span className="text-sm font-normal text-gray-400">尚未點選</span>}
                  </div>
                  <Button type="button" variant="outline" onClick={() => setPath((p) => p.slice(0, -1))} disabled={!path.length}>
                    ⌫
                  </Button>
                </div>
              </div>
            )}

            {result && (
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  {draftError ? (
                    <span className="text-amber-700">{draftError}</span>
                  ) : (
                    <>
                      記成 <span className="font-mono text-base font-bold">{defenseNotation(result, result === 'strikeout' && !path.length ? [2] : path)}</span>
                    </>
                  )}
                </div>
                <Button className="h-11 shrink-0" onClick={save} disabled={!!draftError || saving}>
                  {saving ? '儲存中...' : '記錄'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 每局紀錄 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">每局出局紀錄（{plays.length}）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {innings.length === 0 && <p className="text-sm text-gray-500">尚無防守紀錄</p>}
          {innings.map((n) => {
            const list = byInning.get(n)!;
            return (
              <div key={n}>
                <div className={`mb-1 text-sm font-semibold ${list[list.length - 1].outsAfter > 3 ? 'text-red-600' : 'text-gray-700'}`}>
                  第 {n} 局 · {list[list.length - 1].outsAfter} 出局{list[list.length - 1].outsAfter > 3 && '（超過 3 出局，請檢查）'}
                  {oppRuns.has(n) && ` · 失 ${oppRuns.get(n)} 分`}
                </div>
                <ul className="divide-y rounded-md border">
                  {list.map(({ play, outNumbers }) => {
                    const opt = getDefenseResult(play.result);
                    const names = play.path
                      .map((pos, i) => `${pos} ${playerById.get(play.path_players[i] ?? '')?.name ?? positionLabel(pos)}`)
                      .join(' → ');
                    return (
                      <li key={play.id} className="flex items-center gap-3 px-3 py-2">
                        <span className={`w-16 shrink-0 text-xs ${outNumbers.length ? 'text-blue-800' : 'text-red-700'}`}>
                          {outNumbers.length ? outNumbers.map((o) => `第${o}出局`).join('、') : '上壘'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div>
                            <span className="font-mono font-bold">{defenseNotation(play.result, play.path)}</span>{' '}
                            <span className="text-sm text-gray-600">{opt?.label}</span>
                          </div>
                          {play.path.length > 0 && play.result !== 'strikeout' && (
                            <div className="truncate text-xs text-gray-500">{names}</div>
                          )}
                        </div>
                        {canEdit && game.status === 'live' && (
                          <button type="button" className="text-xs text-gray-400 hover:text-red-600" onClick={() => removePlay(play)}>
                            刪除
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 守備成績 */}
      {stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">守備成績</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500">
                  <th className="py-1 text-left font-normal">球員</th>
                  <th className="py-1 text-left font-normal">位置</th>
                  <th className="py-1 text-right font-normal">刺殺</th>
                  <th className="py-1 text-right font-normal">助殺</th>
                  <th className="py-1 text-right font-normal">失誤</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.key} className="border-t">
                    <td className="py-1.5">{s.playerId ? playerText(playerById.get(s.playerId)) || '（已刪除）' : '（未排人）'}</td>
                    <td className="py-1.5 text-gray-600">{s.positions.map(positionLabel).join('、')}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.po}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.a}</td>
                    <td className={`py-1.5 text-right tabular-nums ${s.e ? 'text-red-600' : ''}`}>{s.e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-1 pt-6 text-xs text-gray-600">
          <div className="font-semibold text-gray-700">記法說明</div>
          <div>位置編號：1 投、2 捕、3 一壘、4 二壘、5 三壘、6 游擊、7 左外、8 中外、9 右外、10 自由手</div>
          <div>6-3：游擊接球傳一壘出局；3U：一壘手自己踩壘；F8：中外野接殺；6-4-3 DP：游擊傳二壘再傳一壘雙殺</div>
          <div>K：三振（捕手刺殺）；E6：游擊失誤；1B(7)：打到左外野的一壘安打</div>
        </CardContent>
      </Card>
    </div>
  );
}

// 只記一個位置、點了直接換掉的結果
function code1(code: DefenseResult): boolean {
  return code === 'flyout' || code === 'sacrifice_fly' || code === 'error';
}

function pathHint(code: DefenseResult): string {
  if (code === 'flyout' || code === 'sacrifice_fly') return '接球的位置';
  if (code === 'error') return '失誤的位置';
  if (getDefenseResult(code)?.path === 'optional') return '打到哪個位置';
  return '依序點選經手的位置（接球 → 傳球 → 踩壘）';
}
