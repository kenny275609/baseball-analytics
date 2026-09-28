'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AtbatDraft, AtbatEntry, EMPTY_DRAFT } from '@/components/AtbatEntry';
import { SprayChart } from '@/components/SprayChart';
import { useSession } from '@/lib/useSession';
import {
  AtbatResultFields,
  computeStats,
  countOuts,
  fieldsToResult,
  formatRate,
  getResultOption,
} from '@/lib/atbat';

interface PlayerRef {
  name: string;
  number: string | null;
}

interface Game {
  id: string;
  game_date: string;
  opponent: string;
  home_away: 'home' | 'away';
  status: 'live' | 'final';
  our_score: number | null;
  opp_score: number | null;
}

interface LineupSlot {
  batting_order: number;
  player_id: string;
  players: PlayerRef | null;
}

interface Atbat extends AtbatResultFields {
  id: string;
  player_id: string;
  inning: number | null;
  batting_order: number | null;
  rbi: number;
  hit_x: number | null;
  hit_y: number | null;
  note: string | null;
  players: PlayerRef | null;
}

interface Player {
  id: string;
  name: string;
  number: string | null;
}

// 根據最後一個打席推算下一位打者與局數：同局出局數滿 3 就換下一局
function nextState(atbats: Atbat[], lineup: LineupSlot[]) {
  const orders = lineup.map((l) => l.batting_order);
  const last = atbats[atbats.length - 1];
  if (!last) return { slot: orders[0] ?? 1, inning: 1 };

  const lastIndex = orders.indexOf(last.batting_order ?? -1);
  const slot = orders[(lastIndex + 1) % orders.length] ?? orders[0] ?? 1;
  const inning = last.inning ?? 1;
  const outs = countOuts(atbats.filter((a) => a.inning === inning));
  return { slot, inning: outs >= 3 ? inning + 1 : inning };
}

function playerLabel(p: PlayerRef | null) {
  if (!p) return '（已刪除）';
  return p.number ? `#${p.number} ${p.name}` : p.name;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;
  const { canEdit, isAdmin } = useSession();

  const [game, setGame] = useState<Game | null>(null);
  const [lineup, setLineup] = useState<LineupSlot[]>([]);
  const [atbats, setAtbats] = useState<Atbat[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [slot, setSlot] = useState(1);
  const [inning, setInning] = useState(1);
  const [draft, setDraft] = useState<AtbatDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [subbing, setSubbing] = useState(false);
  const [ourScore, setOurScore] = useState('');
  const [oppScore, setOppScore] = useState('');
  const lineupStripRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (advance: boolean) => {
      const res = await fetch(`/api/games/get?id=${gameId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '載入失敗');
        return;
      }
      setGame(data.game);
      setLineup(data.lineup);
      setAtbats(data.atbats);
      setOurScore(data.game.our_score?.toString() ?? '');
      setOppScore(data.game.opp_score?.toString() ?? '');
      if (advance) {
        const next = nextState(data.atbats, data.lineup);
        setSlot(next.slot);
        setInning(next.inning);
      }
    },
    [gameId]
  );

  useEffect(() => {
    load(true).finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (canEdit) {
      fetch('/api/players/list')
        .then((res) => res.json())
        .then((data) => setPlayers(data.players || []));
    }
  }, [canEdit]);

  const currentSlot = lineup.find((l) => l.batting_order === slot);
  const outsThisInning = countOuts(atbats.filter((a) => a.inning === inning));
  const recording = canEdit && game?.status === 'live';

  // 打序列只橫向捲動到目前打者，不影響頁面上下位置
  useEffect(() => {
    const strip = lineupStripRef.current;
    const active = strip?.querySelector<HTMLElement>('[data-active="true"]');
    if (strip && active) {
      strip.scrollTo({
        left: active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [slot, lineup, recording]);


  const saveAtbat = async () => {
    if (!currentSlot || !draft.result) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/atbats/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id: gameId,
          player_id: currentSlot.player_id,
          batting_order: slot,
          inning,
          result: draft.result,
          quality: draft.quality,
          rbi: draft.rbi,
          hit_x: draft.hitX,
          hit_y: draft.hitY,
          note: draft.note,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setDraft(EMPTY_DRAFT);
      await load(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const deleteAtbat = async (atbat: Atbat) => {
    const label = getResultOption(fieldsToResult(atbat))?.label ?? '';
    if (!window.confirm(`刪除 ${atbat.players?.name ?? ''} 的「${label}」？`)) return;
    const res = await fetch('/api/atbats/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: atbat.id }),
    });
    if (!res.ok) {
      setError('刪除失敗');
      return;
    }
    // 刪掉最後一筆＝復原，打者和局數跟著退回
    const isLast = atbats[atbats.length - 1]?.id === atbat.id;
    await load(false);
    if (isLast) {
      if (atbat.batting_order) setSlot(atbat.batting_order);
      if (atbat.inning) setInning(atbat.inning);
    }
  };

  const substitute = async (playerId: string) => {
    setSubbing(false);
    if (!playerId) return;
    const res = await fetch('/api/games/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: gameId, lineup_slot: { batting_order: slot, player_id: playerId } }),
    });
    if (!res.ok) setError('換人失敗');
    await load(false);
  };

  const updateGame = async (updates: Record<string, unknown>) => {
    const res = await fetch('/api/games/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: gameId, ...updates }),
    });
    if (!res.ok) setError('更新比賽失敗');
    await load(false);
  };

  const deleteGame = async () => {
    if (!window.confirm('刪除這場比賽和所有打席紀錄？此操作無法復原。')) return;
    const res = await fetch('/api/games/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: gameId }),
    });
    if (res.ok) router.push('/');
    else setError('刪除失敗');
  };

  if (loading) {
    return <div className="text-center py-12">載入中...</div>;
  }
  if (!game) {
    return <div className="text-center py-12 text-red-600">{error || '找不到這場比賽'}</div>;
  }

  // 本場個人成績：打序上的人 + 打過但已被換下的人
  const boxPlayerIds = [
    ...lineup.map((l) => l.player_id),
    ...atbats.map((a) => a.player_id),
  ].filter((id, i, arr) => arr.indexOf(id) === i);
  const nameOf = (id: string) =>
    lineup.find((l) => l.player_id === id)?.players ?? atbats.find((a) => a.player_id === id)?.players ?? null;

  const byInning = new Map<number, Atbat[]>();
  for (const a of atbats) {
    const key = a.inning ?? 0;
    byInning.set(key, [...(byInning.get(key) ?? []), a]);
  }
  const innings = [...byInning.keys()].sort((a, b) => b - a);

  const hitPoints = atbats
    .filter((a) => a.hit_x !== null && a.hit_y !== null)
    .map((a) => ({ x: a.hit_x!, y: a.hit_y!, group: getResultOption(fieldsToResult(a))?.group }));

  return (
    <div className="container mx-auto px-4 py-4 max-w-2xl space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Button variant="outline" size="sm">← 比賽列表</Button>
        </Link>
        {game.status === 'live' ? <Badge className="bg-green-600">進行中</Badge> : <Badge variant="outline">已結束</Badge>}
      </div>

      <div>
        <div className="text-sm text-gray-500">
          {game.game_date} · {game.home_away === 'home' ? '主場' : '客場'}
        </div>
        <h1 className="text-2xl font-bold">vs {game.opponent}</h1>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

      {recording && (
        <Card className="gap-4">
          <CardContent className="space-y-4">
            {/* 局數 + 出局數 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon-sm" onClick={() => setInning(Math.max(1, inning - 1))}>◀</Button>
                <span className="text-lg font-bold w-14 text-center">{inning} 局</span>
                <Button variant="outline" size="icon-sm" onClick={() => setInning(Math.min(30, inning + 1))}>▶</Button>
              </div>
              <div className="flex items-center gap-1" aria-label={`${outsThisInning} 出局`}>
                <span className="text-sm text-gray-500 mr-1">出局</span>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`w-3 h-3 rounded-full border-2 border-red-600 ${i < outsThisInning ? 'bg-red-600' : ''}`} />
                ))}
              </div>
            </div>

            {/* 打序 */}
            <div ref={lineupStripRef} className="relative flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {lineup.map((l) => (
                <button
                  key={l.batting_order}
                  type="button"
                  onClick={() => setSlot(l.batting_order)}
                  data-active={l.batting_order === slot}
                  className={`shrink-0 rounded-lg border-2 px-3 py-1.5 text-left ${
                    l.batting_order === slot ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-200'
                  }`}
                >
                  <div className="text-[11px] opacity-70">第 {l.batting_order} 棒</div>
                  <div className="text-sm font-semibold whitespace-nowrap">{l.players?.name ?? '—'}</div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <div>
                <div className="text-xs text-gray-500">打擊中 · 第 {slot} 棒</div>
                <div className="text-lg font-bold">{playerLabel(currentSlot?.players ?? null)}</div>
              </div>
              {subbing ? (
                <select
                  autoFocus
                  className="border rounded-md px-2 py-1 text-sm"
                  defaultValue=""
                  onChange={(e) => substitute(e.target.value)}
                  onBlur={() => setSubbing(false)}
                >
                  <option value="" disabled>選擇代打/替補</option>
                  {players
                    .filter((p) => !lineup.some((l) => l.player_id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>{playerLabel(p)}</option>
                    ))}
                </select>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setSubbing(true)}>換人</Button>
              )}
            </div>

            <AtbatEntry draft={draft} onChange={setDraft} />
          </CardContent>
        </Card>
      )}

      {recording && (
        <div className="fixed bottom-0 inset-x-0 border-t bg-white/95 backdrop-blur p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto">
            <Button className="w-full h-12 text-base" onClick={saveAtbat} disabled={!draft.result || !currentSlot || saving}>
              {saving
                ? '儲存中...'
                : draft.result
                  ? `記錄：${currentSlot?.players?.name ?? ''} ${getResultOption(draft.result)?.label}`
                  : '請選擇打席結果'}
            </Button>
          </div>
        </div>
      )}

      {/* 打席紀錄 */}
      <Card className="gap-3">
        <CardHeader><CardTitle>打席紀錄（{atbats.length}）</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {atbats.length === 0 && <p className="text-sm text-gray-500">尚無打席</p>}
          {innings.map((inn) => (
            <div key={inn}>
              <div className="text-xs font-semibold text-gray-500 mb-1">{inn ? `${inn} 局` : '未標局數'}</div>
              <ul className="divide-y rounded-md border">
                {[...byInning.get(inn)!].reverse().map((a) => {
                  const option = getResultOption(fieldsToResult(a));
                  return (
                    <li key={a.id} className="flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm">
                      <span className="w-4 shrink-0 text-gray-400">{a.batting_order ?? ''}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{a.players?.name}</span>
                        <span className="block text-xs">
                          <span className="font-semibold">{option?.label ?? '-'}</span>
                          {a.rbi > 0 && <span className="text-red-600 ml-1">{a.rbi} 打點</span>}
                        </span>
                      </span>
                      {canEdit && (
                        <>
                          <Link href={`/record/${a.player_id}/edit/${a.id}`}>
                            <Button variant="ghost" size="sm" className="px-2">編輯</Button>
                          </Link>
                          <Button variant="ghost" size="sm" className="px-2 text-red-600" onClick={() => deleteAtbat(a)}>刪除</Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 本場成績 */}
      {atbats.length > 0 && (
        <Card className="gap-3">
          <CardHeader><CardTitle>本場成績</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>球員</TableHead>
                  <TableHead className="text-right">打席</TableHead>
                  <TableHead className="text-right">打數</TableHead>
                  <TableHead className="text-right">安打</TableHead>
                  <TableHead className="text-right">打點</TableHead>
                  <TableHead className="text-right">四死</TableHead>
                  <TableHead className="text-right">三振</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boxPlayerIds.map((id) => {
                  const s = computeStats(atbats.filter((a) => a.player_id === id));
                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <Link href={`/players/${id}`} className="hover:underline">{nameOf(id)?.name ?? '—'}</Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.pa}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.ab}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.h}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.rbi}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.bb + s.hbp}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.so}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {(() => {
              const t = computeStats(atbats);
              return (
                <p className="text-sm text-gray-600 mt-2">
                  全隊 {t.h}/{t.ab}，打擊率 {formatRate(t.avg)}，上壘率 {formatRate(t.obp)}
                </p>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {hitPoints.length > 0 && (
        <Card className="gap-3">
          <CardHeader><CardTitle>本場落點</CardTitle></CardHeader>
          <CardContent><SprayChart hitPoints={hitPoints} /></CardContent>
        </Card>
      )}

      {/* 比賽結束 / 重新開啟 */}
      {canEdit && (
        <Card className="gap-3">
          <CardHeader><CardTitle>比分</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input type="number" inputMode="numeric" min="0" className="w-20 text-center" value={ourScore} onChange={(e) => setOurScore(e.target.value)} aria-label="我方得分" />
              <span>:</span>
              <Input type="number" inputMode="numeric" min="0" className="w-20 text-center" value={oppScore} onChange={(e) => setOppScore(e.target.value)} aria-label={`${game.opponent} 得分`} />
              <span className="text-sm text-gray-500">我方 : {game.opponent}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {game.status === 'live' ? (
                <Button onClick={() => updateGame({ status: 'final', our_score: ourScore, opp_score: oppScore })}>結束比賽</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => updateGame({ our_score: ourScore, opp_score: oppScore })}>更新比分</Button>
                  <Button variant="outline" onClick={() => updateGame({ status: 'live' })}>重新開啟記錄</Button>
                </>
              )}
              {isAdmin && (
                <Button variant="destructive" className="ml-auto" onClick={deleteGame}>刪除比賽</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
