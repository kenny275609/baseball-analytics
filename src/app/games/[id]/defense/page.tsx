'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DefenseField } from '@/components/DefenseField';
import { useSession } from '@/lib/useSession';
import {
  DEFENSE_RESULTS,
  DefensePlay,
  DefenseResult,
  POSITIONS,
  currentDefenseInning,
  defenseNotation,
  fieldingStats,
  formatFieldingPct,
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

interface DefenseData {
  ready: boolean;
  status: GameInfo['status'];
  plays: DefensePlay[];
  positions: { position: number; player_id: string }[];
  innings: { inning: number; opp_runs: number | null }[];
  lineup: string[];
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
  // 同一筆紀錄重試時沿用同一個 client_id：上次其實已經存進去、只是回應沒收到時，伺服器不會重複寫入
  const clientIdRef = useRef<string | null>(null);
  // 本機最後一次改動的時間：同步請求送出後本機又有改動，就丟掉那次同步結果，避免剛記的紀錄被舊資料蓋掉
  const localChangeRef = useRef(0);
  // 還沒收到回應的寫入數：寫入途中同步拿到的是寫入前的資料，不能套用
  const inFlightRef = useRef(0);
  // 對手得分依序送出，連點 + 時後送的才不會被先送的蓋掉
  const oppRunsQueueRef = useRef<Promise<void>>(Promise.resolve());
  // 守備位置也依序送出：連續排人、互換時伺服器套用的順序和畫面一樣
  const positionsQueueRef = useRef<Promise<void>>(Promise.resolve());
  // 對手每局得分（和比賽頁記分板同一份資料）
  // 目前打序上的球員：被換下的人還排在守備位置上時提醒更新
  const [lineup, setLineup] = useState<string[] | null>(null);
  // 守備位置圖：還沒開始記錄時展開，之後收成一行
  const [fieldOpen, setFieldOpen] = useState<boolean | null>(null);
  const [oppRuns, setOppRuns] = useState<Map<number, number>>(new Map());

  const applyDefense = useCallback((d: DefenseData) => {
    setGame((g) => (g && g.status !== d.status ? { ...g, status: d.status } : g));
    setPlays(d.plays);
    setPositions(new Map(d.positions.map((p) => [p.position, p.player_id])));
    setLineup(d.lineup);
    setOppRuns(new Map(d.innings.filter((x) => x.opp_runs !== null).map((x) => [x.inning, x.opp_runs as number])));
  }, []);

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
      setPlayers(ps);
      setReady(d.ready);
      applyDefense(d);
      setInning(currentDefenseInning(d.plays));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [gameId, applyDefense]);

  useEffect(() => {
    load();
  }, [load]);

  // 另一支手機也在記：畫面在前景時每 15 秒、切回 App 時同步防守紀錄、守備位置、對手得分與打序（不動正在輸入的局數和結果）
  // 寫入失敗時也呼叫：改回伺服器上的實際狀態（可能是另一支手機剛改的），而不是本機改之前的舊值
  const sync = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    const started = Date.now();
    try {
      const res = await fetch(`/api/defense/get?game_id=${gameId}`);
      if (!res.ok) return;
      const d: DefenseData = await res.json();
      if (!d.ready || inFlightRef.current > 0 || localChangeRef.current >= started) return;
      applyDefense(d);
    } catch {
      // 離線時略過，下次再同步
    }
  }, [gameId, applyDefense]);

  // 包住每個寫入：送出前、收到回應後都記為本機改動，途中開始的同步結果一律丟掉
  const write = useCallback(async (url: string, payload: unknown) => {
    inFlightRef.current++;
    localChangeRef.current = Date.now();
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } finally {
      inFlightRef.current--;
      localChangeRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(sync, 15000);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [sync]);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const byInning = useMemo(() => playsByInning(plays), [plays]);
  const stats = useMemo(() => fieldingStats(plays), [plays]);
  const inningList = byInning.get(inning) ?? [];
  const outsNow = inningList.length ? inningList[inningList.length - 1].outsAfter : 0;

  const benched = lineup
    ? POSITIONS.filter((p) => positions.has(p.pos) && !lineup.includes(positions.get(p.pos)!))
    : [];
  const showField = fieldOpen ?? plays.length === 0;

  const option = getDefenseResult(result);
  const draftError = result ? pathError(result, path) : null;
  const editable = canEdit && ready && game?.status === 'live';

  useEffect(() => {
    clientIdRef.current = null;
  }, [result, path, inning]);

  const pickResult = (code: DefenseResult) => {
    setResult(code);
    // 改選另一種「依序點多個位置」的結果時保留已點的路徑（例如滾地改野手選擇），其他情況清掉，避免帶著舊路徑記錄
    if (!(result && multiPath(result) && multiPath(code))) setPath([]);
    setNotice('');
  };

  const tapPosition = (pos: number) => {
    if (!option || option.path === 'none') return;
    // 只記一個位置的結果：點別的位置直接換掉
    const single = (option.path === 'optional' && option.code !== 'strikeout') || code1(option.code);
    setPath((p) => (single ? [pos] : [...p, pos]));
  };

  const save = async () => {
    if (!result || draftError) return;
    if (outsNow + (option?.outs ?? 0) > 3 && !window.confirm(`第 ${inning} 局會超過 3 出局，確定要記錄嗎？`)) return;
    setSaving(true);
    setError('');
    try {
      const res = await write('/api/defense/plays/create', {
        game_id: gameId,
        client_id: (clientIdRef.current ??= crypto.randomUUID()),
        inning,
        result,
        path,
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 409) sync();
        throw new Error(body.error || '記錄失敗');
      }
      setPlays((ps) => (ps.some((p) => p.id === body.play.id) ? ps : [...ps, body.play as DefensePlay]));
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
      setError(
        err instanceof TypeError
          ? '網路連線失敗，不確定這筆有沒有存到。確認網路後再按一次「記錄」，不會重複記錄'
          : err instanceof Error
            ? err.message
            : '記錄失敗',
      );
    } finally {
      setSaving(false);
    }
  };

  const removePlay = async (play: DefensePlay) => {
    if (!window.confirm(`刪除第 ${play.inning} 局的「${defenseNotation(play.result, play.path)}」？`)) return;
    setError('');
    try {
      const res = await write('/api/defense/plays/delete', { id: play.id });
      if (!res.ok) {
        if (res.status === 409 || res.status === 404) sync();
        throw new Error((await res.json()).error || '刪除失敗');
      }
      const rest = plays.filter((p) => p.id !== play.id);
      setPlays(rest);
      // 刪掉上一局的第 3 個出局、而這一局還沒記任何東西：回到上一局繼續記
      if (play.inning === inning - 1 && !rest.some((p) => p.inning === inning)) {
        setInning(play.inning);
        setNotice(`已刪除，回到第 ${play.inning} 局`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    }
  };

  const saveOppRuns = (n: number, runs: number) => {
    setError('');
    const before = oppRuns.get(n);
    setOppRuns((m) => new Map(m).set(n, runs));
    inFlightRef.current++;
    localChangeRef.current = Date.now();
    const send = async () => {
      let failed = false;
      try {
        const res = await write('/api/games/innings', { game_id: gameId, inning: n, opp_runs: runs });
        if (!res.ok) throw new Error((await res.json()).error || '儲存得分失敗');
      } catch (err) {
        setError(err instanceof Error ? err.message : '儲存得分失敗');
        failed = true;
        // 離線時同步不到：先退回這次改之前的分數
        if (err instanceof TypeError) {
          setOppRuns((m) => {
            if (m.get(n) !== runs) return m;
            const next = new Map(m);
            if (before === undefined) next.delete(n);
            else next.set(n, before);
            return next;
          });
        }
      } finally {
        inFlightRef.current--;
        // 失敗時等排隊中的都送完再同步，畫面才會回到伺服器上的實際分數
        if (failed && inFlightRef.current === 0) {
          localChangeRef.current = 0;
          sync();
        }
      }
    };
    oppRunsQueueRef.current = oppRunsQueueRef.current.then(send);
  };

  // 依序套用多個守備位置變更（互換位置時是兩筆）：畫面先全部改好，再一筆一筆送出
  const assignPositions = (changes: [number, string | null][]) => {
    setError('');
    const prev = positions;
    const next = new Map(positions);
    for (const [position, playerId] of changes) {
      for (const [pos, id] of next) if (id === playerId) next.delete(pos);
      if (playerId) next.set(position, playerId);
      else next.delete(position);
    }
    setPositions(next);
    inFlightRef.current++;
    localChangeRef.current = Date.now();
    const send = async () => {
      let failed = false;
      try {
        for (const [position, playerId] of changes) {
          const res = await write('/api/defense/positions', { game_id: gameId, position, player_id: playerId });
          if (!res.ok) throw new Error((await res.json()).error || '設定失敗');
        }
      } catch (err) {
        failed = true;
        setError(err instanceof Error ? err.message : '設定失敗');
        // 離線時同步不到：先退回這次改之前（之後連上線，背景同步會改成伺服器上的實際狀態）
        if (err instanceof TypeError) setPositions((cur) => (cur === next ? prev : cur));
      } finally {
        inFlightRef.current--;
        // 失敗時等排隊中的都送完，再改回伺服器上的守備位置（可能是另一支手機剛改的，或互換只做了一半）
        if (failed && inFlightRef.current === 0) {
          localChangeRef.current = 0;
          sync();
        }
      }
    };
    positionsQueueRef.current = positionsQueueRef.current.then(send);
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">守備位置</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setFieldOpen(!showField)}>
            {showField ? '收起' : editable ? '調整' : '查看'}
          </Button>
        </CardHeader>
        <CardContent>
          {showField ? (
            <DefenseField
              positions={positions}
              players={players}
              lineup={lineup ?? []}
              editable={editable}
              onAssign={assignPositions}
            />
          ) : (
            <div className="text-sm text-gray-700">
              {positions.size
                ? POSITIONS.filter((p) => positions.has(p.pos))
                    .map((p) => `${p.short} ${playerById.get(positions.get(p.pos)!)?.name ?? '（已刪除）'}`)
                    .join('、')
                : '還沒排守備位置'}
            </div>
          )}
          {editable && benched.length > 0 && (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">
              {benched.map((p) => `${p.label} ${playerText(playerById.get(positions.get(p.pos)!)) || ''}`).join('、')}
              {' '}不在目前打序上（可能已經換下場），請確認守備位置
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

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="whitespace-nowrap text-gray-600">本局對手得分</span>
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
              <span className="text-xs text-gray-500">會同步到記分板</span>
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
                  <Button type="button" variant="outline" onClick={() => setPath([])} disabled={!path.length}>
                    清除
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
                          {outNumbers.length ? `第${outNumbers.join('、')}出局` : '上壘'}
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
                  <th className="py-1 text-left font-normal">球員 / 位置</th>
                  <th className="py-1 text-right font-normal">刺殺</th>
                  <th className="py-1 text-right font-normal">助殺</th>
                  <th className="py-1 text-right font-normal">失誤</th>
                  <th className="py-1 text-right font-normal">守備率</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const name = s.playerId ? playerText(playerById.get(s.playerId)) || '（已刪除）' : '（未排人）';
                  const rows = s.byPosition.length > 1
                    ? [
                        { key: s.key, label: name, sub: '合計', c: s, strong: true },
                        ...s.byPosition.map((b) => ({ key: `${s.key}:${b.pos}`, label: '', sub: positionLabel(b.pos), c: b, strong: false })),
                      ]
                    : [{ key: s.key, label: name, sub: positionLabel(s.positions[0]), c: s, strong: true }];
                  return rows.map((r, i) => (
                    <tr key={r.key} className={i === 0 ? 'border-t' : ''}>
                      <td className={`py-1 ${r.label ? '' : 'pl-4'}`}>
                        {r.label && <span className="font-medium">{r.label} </span>}
                        <span className="text-gray-500">{r.sub}</span>
                      </td>
                      <td className="py-1 text-right tabular-nums">{r.c.po}</td>
                      <td className="py-1 text-right tabular-nums">{r.c.a}</td>
                      <td className={`py-1 text-right tabular-nums ${r.c.e ? 'text-red-600' : ''}`}>{r.c.e}</td>
                      <td className={`py-1 text-right tabular-nums ${r.strong ? '' : 'text-gray-500'}`}>{formatFieldingPct(r.c)}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">守備率 =（刺殺 + 助殺）÷（刺殺 + 助殺 + 失誤）。同一位球員守過多個位置時分開列出。</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-1 pt-6 text-xs text-gray-600">
          <div className="font-semibold text-gray-700">記法說明</div>
          <div>位置編號：1 投、2 捕、3 一壘、4 二壘、5 三壘、6 游擊、7 左外、8 中外、9 右外、10 自由手</div>
          <div>6-3：游擊接球傳一壘出局；3U：一壘手自己踩壘；F8：中外野接殺；6-4-3 DP：游擊傳二壘再傳一壘雙殺</div>
          <div>K：三振（捕手刺殺）；K 2-3：不死三振傳一壘出局；E6：游擊失誤；1B(7)：打到左外野的一壘安打</div>
          <div>安打後跑者在壘上被觸殺：先記安打，再記「其他出局」並點傳球路徑，例如 9-5</div>
          <div>雙殺的兩個刺殺會算給路徑最後兩位。接殺後經中繼傳殺跑者（例如中外野接殺、二壘中繼、本壘觸殺）請分兩筆記：先記「飛球接殺」8，再記「其他出局」8-4-2</div>
        </CardContent>
      </Card>
    </div>
  );
}

// 依序點多個位置的結果（滾地、雙殺、野手選擇…）
function multiPath(code: DefenseResult): boolean {
  return getDefenseResult(code)?.path === 'required' && !code1(code);
}

// 只記一個位置、點了直接換掉的結果
function code1(code: DefenseResult): boolean {
  return code === 'flyout' || code === 'sacrifice_fly' || code === 'error';
}

function pathHint(code: DefenseResult): string {
  if (code === 'flyout' || code === 'sacrifice_fly') return '接球的位置';
  if (code === 'error') return '失誤的位置';
  if (code === 'strikeout') return '不死三振傳殺才需要點（例如 2 → 3），一般三振不用點';
  if (getDefenseResult(code)?.path === 'optional') return '打到哪個位置';
  return '依序點選經手的位置（接球 → 傳球 → 踩壘）';
}
