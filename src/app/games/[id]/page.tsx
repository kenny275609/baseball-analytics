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
import { BaseDiamond } from '@/components/BaseDiamond';
import { AtbatRunnersDialog, StandaloneRunnerDialog } from '@/components/RunnerDialogs';
import { Scoreboard } from '@/components/Scoreboard';
import { SprayChart } from '@/components/SprayChart';
import { useSession } from '@/lib/useSession';
import {
  AtbatResultFields,
  computeStats,
  fieldsToResult,
  formatRate,
  getResultOption,
} from '@/lib/atbat';
import {
  RunnerEvent,
  RunnerEventType,
  RunnerMove,
  autoRbi,
  baseLabel,
  computeBases,
  defaultMoves,
  isTracked,
  outsInInning,
  runsByInning,
  standaloneLabel,
} from '@/lib/baserunning';

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
  created_at: string;
  players: PlayerRef | null;
}

interface Player {
  id: string;
  name: string;
  number: string | null;
}

interface InningScore {
  inning: number;
  opp_runs: number;
}

const FROM_SHORT = ['打者', '一壘', '二壘', '三壘'];

// 根據最後一個打席推算下一位打者，局數看最後一筆紀錄（打席或跑壘事件）：同局出局數滿 3 就換下一局
function nextState(atbats: Atbat[], events: RunnerEvent[], lineup: LineupSlot[]) {
  const orders = lineup.map((l) => l.batting_order);
  const last = atbats[atbats.length - 1];
  const lastEvent = events[events.length - 1];
  if (!last && !lastEvent) return { slot: orders[0] ?? 1, inning: 1 };

  const lastIndex = orders.indexOf(last?.batting_order ?? -1);
  const slot = last ? orders[(lastIndex + 1) % orders.length] ?? orders[0] ?? 1 : orders[0] ?? 1;
  const inning = Math.max(last?.inning ?? 1, lastEvent?.inning ?? 1);
  const outs = outsInInning(atbats, events, inning);
  return { slot, inning: outs >= 3 ? inning + 1 : inning };
}

function playerLabel(p: PlayerRef | null) {
  if (!p) return '（已刪除）';
  return p.number ? `#${p.number} ${p.name}` : p.name;
}

function describeMove(e: RunnerEvent) {
  return `${e.players?.name ?? '?'} ${FROM_SHORT[e.from_base]}→${baseLabel(e.to_base)}`;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;
  const { canEdit, isAdmin } = useSession();

  const [game, setGame] = useState<Game | null>(null);
  const [lineup, setLineup] = useState<LineupSlot[]>([]);
  const [atbats, setAtbats] = useState<Atbat[]>([]);
  const [runnerEvents, setRunnerEvents] = useState<RunnerEvent[]>([]);
  const [innings, setInnings] = useState<InningScore[]>([]);
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 跑者對話框：key 每次開啟遞增，讓對話框以新的預設值重新掛載
  const [runnersDialog, setRunnersDialog] = useState<{ key: number; moves: RunnerMove[] } | null>(null);
  const [standaloneKey, setStandaloneKey] = useState<number | null>(null);
  const dialogSeq = useRef(0);
  const lineupStripRef = useRef<HTMLDivElement>(null);
  // 非同步操作完成時拿最新的打席/打序/跑壘，而不是點擊當下閉包裡的舊值
  const atbatsRef = useRef<Atbat[]>([]);
  const lineupRef = useRef<LineupSlot[]>([]);
  const eventsRef = useRef<RunnerEvent[]>([]);
  useEffect(() => {
    atbatsRef.current = atbats;
    lineupRef.current = lineup;
    eventsRef.current = runnerEvents;
  }, [atbats, lineup, runnerEvents]);

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
      setRunnerEvents(data.runner_events ?? []);
      setInnings(data.innings ?? []);
      setOurScore(data.game.our_score?.toString() ?? '');
      setOppScore(data.game.opp_score?.toString() ?? '');
      if (advance) {
        const next = nextState(data.atbats, data.runner_events ?? [], data.lineup);
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
  const bases = computeBases(runnerEvents, inning);
  const hasRunners = bases.some(Boolean);
  const outsThisInning = outsInInning(atbats, runnerEvents, inning);
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

  // 壘上有人：先逐一詢問跑者去向；壘上無人：打者落點依結果決定，直接記錄
  const startSave = () => {
    if (!currentSlot || !draft.result) return;
    const moves = defaultMoves(draft.result, bases, {
      playerId: currentSlot.player_id,
      player: currentSlot.players,
    });
    if (moves.length > 1) {
      dialogSeq.current += 1;
      setRunnersDialog({ key: dialogSeq.current, moves });
    } else {
      saveAtbat(moves, autoRbi(draft.result, moves));
    }
  };

  const saveAtbat = async (moves: RunnerMove[], rbi: number) => {
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
          rbi,
          hit_x: draft.hitX,
          hit_y: draft.hitY,
          note: draft.note,
          runners: moves.map((m) => ({ player_id: m.playerId, from_base: m.from, to_base: m.to })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // 直接接上新打席與跑壘並推進打者，不用整場重抓；以最新 state 計算，避免過期閉包
      const created = data.atbat as Atbat;
      const createdEvents = (data.runner_events ?? []) as RunnerEvent[];
      const nextAtbats = [...atbatsRef.current, created];
      const nextEvents = [...eventsRef.current, ...createdEvents];
      atbatsRef.current = nextAtbats;
      eventsRef.current = nextEvents;
      setAtbats((prev) => [...prev, created]);
      setRunnerEvents((prev) => [...prev, ...createdEvents]);
      const next = nextState(nextAtbats, nextEvents, lineupRef.current);
      setSlot(next.slot);
      setInning(next.inning);
      setDraft(EMPTY_DRAFT);
      setRunnersDialog(null);
      if (data.warning) setError(data.warning);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const saveStandalone = async (type: RunnerEventType, moves: RunnerMove[]) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/runner-events/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id: gameId,
          inning,
          event_type: type,
          runners: moves.map((m) => ({ player_id: m.playerId, from_base: m.from, to_base: m.to })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const created = (data.runner_events ?? []) as RunnerEvent[];
      const nextEvents = [...eventsRef.current, ...created];
      eventsRef.current = nextEvents;
      setRunnerEvents((prev) => [...prev, ...created]);
      // 盜壘失敗/牽制造成第三個出局就換局（打者不變）
      setInning(nextState(atbatsRef.current, nextEvents, lineupRef.current).inning);
      setStandaloneKey(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const deleteAtbat = async (atbat: Atbat) => {
    const label = getResultOption(fieldsToResult(atbat))?.label ?? '';
    if (deletingId) return;
    if (!window.confirm(`刪除 ${atbat.players?.name ?? ''} 的「${label}」？這個打席的跑壘紀錄會一起刪除。`)) return;
    setDeletingId(atbat.id);
    setError('');
    try {
      const res = await fetch('/api/atbats/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: atbat.id }),
      });
      if (!res.ok) throw new Error();
      const current = atbatsRef.current;
      const isLast = current[current.length - 1]?.id === atbat.id;
      const remaining = current.filter((a) => a.id !== atbat.id);
      const remainingEvents = eventsRef.current.filter((e) => e.atbat_id !== atbat.id);
      atbatsRef.current = remaining;
      eventsRef.current = remainingEvents;
      setAtbats((prev) => prev.filter((a) => a.id !== atbat.id));
      setRunnerEvents((prev) => prev.filter((e) => e.atbat_id !== atbat.id));
      if (isLast) {
        // 刪掉最後一筆＝復原，打者和局數跟著退回，壘包由剩下的跑壘事件重新推算
        if (atbat.batting_order) setSlot(atbat.batting_order);
        if (atbat.inning) setInning(atbat.inning);
      } else {
        // 刪中間的打席可能讓某局不滿 3 出局，局數要重算
        setInning(nextState(remaining, remainingEvents, lineupRef.current).inning);
      }
    } catch {
      setError('刪除失敗');
    } finally {
      setDeletingId(null);
    }
  };

  const deletePlay = async (playId: string, label: string) => {
    if (deletingId) return;
    if (!window.confirm(`刪除這筆「${label}」？`)) return;
    setDeletingId(playId);
    setError('');
    try {
      const res = await fetch('/api/runner-events/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ play_id: playId }),
      });
      if (!res.ok) throw new Error();
      const remainingEvents = eventsRef.current.filter((e) => e.play_id !== playId);
      eventsRef.current = remainingEvents;
      setRunnerEvents((prev) => prev.filter((e) => e.play_id !== playId));
      setInning(nextState(atbatsRef.current, remainingEvents, lineupRef.current).inning);
    } catch {
      setError('刪除失敗');
    } finally {
      setDeletingId(null);
    }
  };

  const saveOppRuns = async (inn: number, value: string) => {
    setError('');
    const res = await fetch('/api/games/innings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId, inning: inn, opp_runs: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || '更新對手得分失敗');
      return;
    }
    setInnings((prev) => {
      const rest = prev.filter((i) => i.inning !== inn);
      return value === '' ? rest : [...rest, { inning: inn, opp_runs: Number(value) }];
    });
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

  // 記分板：有跑壘資料的比賽我方逐局得分由事件推算，舊比賽只有手動總分
  const tracked = isTracked(atbats.length, runnerEvents.length);
  const ourRuns = runsByInning(runnerEvents);
  const oppRuns = new Map(innings.map((i) => [i.inning, i.opp_runs]));
  const ourTotal = tracked ? [...ourRuns.values()].reduce((s, n) => s + n, 0) : game.our_score;
  const oppTotal = innings.length > 0 ? innings.reduce((s, i) => s + i.opp_runs, 0) : tracked ? 0 : game.opp_score;
  const boardInnings = Math.max(
    7,
    game.status === 'live' ? inning : 0,
    ...atbats.map((a) => a.inning ?? 0),
    ...innings.map((i) => i.inning)
  );

  // 打席紀錄：同一局內打席和非打擊跑壘依時間排列（新的在上）
  type LogItem =
    | { kind: 'atbat'; at: string; atbat: Atbat }
    | { kind: 'play'; at: string; playId: string; events: RunnerEvent[] };
  const eventsByAtbat = new Map<string, RunnerEvent[]>();
  const plays = new Map<string, RunnerEvent[]>();
  for (const e of runnerEvents) {
    if (e.atbat_id) eventsByAtbat.set(e.atbat_id, [...(eventsByAtbat.get(e.atbat_id) ?? []), e]);
    else plays.set(e.play_id, [...(plays.get(e.play_id) ?? []), e]);
  }
  const byInning = new Map<number, LogItem[]>();
  const pushItem = (inn: number, item: LogItem) => byInning.set(inn, [...(byInning.get(inn) ?? []), item]);
  for (const a of atbats) pushItem(a.inning ?? 0, { kind: 'atbat', at: a.created_at, atbat: a });
  for (const [playId, events] of plays) {
    pushItem(events[0].inning, { kind: 'play', at: events[0].created_at, playId, events });
  }
  for (const items of byInning.values()) items.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  const logInnings = [...byInning.keys()].sort((a, b) => b - a);

  const hitPoints = atbats
    .filter((a) => a.hit_x !== null && a.hit_y !== null)
    .map((a) => ({ x: a.hit_x!, y: a.hit_y!, group: getResultOption(fieldsToResult(a))?.group }));

  const draftLabel = getResultOption(draft.result)?.label;

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

      {/* 壘包 + 記分板 */}
      <Card className="gap-3">
        <CardContent className="space-y-3">
          {game.status === 'live' && (
            <div className="flex items-center justify-between gap-2">
              <BaseDiamond bases={bases} outs={Math.min(3, outsThisInning)} />
              <div className="flex flex-col items-center gap-3">
                {recording ? (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon-sm" onClick={() => setInning(Math.max(1, inning - 1))} aria-label="上一局">◀</Button>
                    <span className="text-lg font-bold w-12 text-center">{inning} 局</span>
                    <Button variant="outline" size="icon-sm" onClick={() => setInning(Math.min(30, inning + 1))} aria-label="下一局">▶</Button>
                  </div>
                ) : (
                  <span className="text-lg font-bold">{inning} 局</span>
                )}
                {recording && (
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={!hasRunners || saving}
                    onClick={() => {
                      dialogSeq.current += 1;
                      setStandaloneKey(dialogSeq.current);
                    }}
                  >
                    盜壘／暴投…
                  </Button>
                )}
              </div>
            </div>
          )}
          <Scoreboard
            opponent={game.opponent}
            homeAway={game.home_away}
            innings={boardInnings}
            ourRuns={tracked ? ourRuns : null}
            ourTotal={ourTotal}
            oppRuns={oppRuns}
            oppTotal={oppTotal}
            currentInning={game.status === 'live' ? inning : null}
            onOppChange={canEdit ? saveOppRuns : undefined}
          />
          {canEdit && <p className="text-xs text-gray-500">對手每局得分直接在記分板輸入；我方得分由跑壘紀錄自動計算。</p>}
        </CardContent>
      </Card>

      {recording && (
        <Card className="gap-4">
          <CardContent className="space-y-4">
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
                  className="border rounded-md px-2 py-1 text-base md:text-sm"
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

            <AtbatEntry draft={draft} onChange={setDraft} showRbi={false} />
          </CardContent>
        </Card>
      )}

      {recording && (
        <div className="fixed bottom-0 inset-x-0 border-t bg-white/95 backdrop-blur p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto">
            <Button className="w-full h-12 text-base" onClick={startSave} disabled={!draft.result || !currentSlot || saving}>
              {saving
                ? '儲存中...'
                : draft.result
                  ? hasRunners
                    ? `下一步：跑者去向（${draftLabel}）`
                    : `記錄：${currentSlot?.players?.name ?? ''} ${draftLabel}`
                  : '請選擇打席結果'}
            </Button>
          </div>
        </div>
      )}

      {runnersDialog && draft.result && (
        <AtbatRunnersDialog
          key={runnersDialog.key}
          open
          onOpenChange={(open) => !open && !saving && setRunnersDialog(null)}
          code={draft.result}
          initialMoves={runnersDialog.moves}
          outsBefore={outsThisInning}
          saving={saving}
          onConfirm={saveAtbat}
        />
      )}

      {standaloneKey !== null && (
        <StandaloneRunnerDialog
          key={standaloneKey}
          open
          onOpenChange={(open) => !open && !saving && setStandaloneKey(null)}
          bases={bases}
          outsBefore={outsThisInning}
          saving={saving}
          onConfirm={saveStandalone}
        />
      )}

      {/* 打席紀錄 */}
      <Card className="gap-3">
        <CardHeader><CardTitle>打席紀錄（{atbats.length}）</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {atbats.length === 0 && plays.size === 0 && <p className="text-sm text-gray-500">尚無打席</p>}
          {logInnings.map((inn) => (
            <div key={inn}>
              <div className="text-xs font-semibold text-gray-500 mb-1">{inn ? `${inn} 局` : '未標局數'}</div>
              <ul className="divide-y rounded-md border">
                {byInning.get(inn)!.map((item) => {
                  if (item.kind === 'play') {
                    const label = standaloneLabel(item.events[0].event_type);
                    return (
                      <li key={item.playId} className="flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm bg-gray-50">
                        <span className="w-4 shrink-0 text-gray-400">·</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{label}</span>
                          <span className="block text-xs text-gray-600">{item.events.map(describeMove).join('、')}</span>
                        </span>
                        {canEdit && (
                          <Button variant="ghost" size="sm" className="px-2 text-red-600" disabled={deletingId !== null} onClick={() => deletePlay(item.playId, label)}>
                            {deletingId === item.playId ? '刪除中' : '刪除'}
                          </Button>
                        )}
                      </li>
                    );
                  }
                  const a = item.atbat;
                  const option = getResultOption(fieldsToResult(a));
                  const runnerMoves = (eventsByAtbat.get(a.id) ?? []).filter((e) => e.from_base > 0);
                  return (
                    <li key={a.id} className="flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm">
                      <span className="w-4 shrink-0 text-gray-400">{a.batting_order ?? ''}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{a.players?.name}</span>
                        <span className="block text-xs">
                          <span className="font-semibold">{option?.label ?? '-'}</span>
                          {a.rbi > 0 && <span className="text-red-600 ml-1">{a.rbi} 打點</span>}
                        </span>
                        {runnerMoves.length > 0 && (
                          <span className="block text-xs text-gray-600">{runnerMoves.map(describeMove).join('、')}</span>
                        )}
                      </span>
                      {canEdit && (
                        <>
                          <Link href={`/record/${a.player_id}/edit/${a.id}`}>
                            <Button variant="ghost" size="sm" className="px-2">編輯</Button>
                          </Link>
                          <Button variant="ghost" size="sm" className="px-2 text-red-600" disabled={deletingId !== null} onClick={() => deleteAtbat(a)}>
                            {deletingId === a.id ? '刪除中' : '刪除'}
                          </Button>
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

      {/* 比賽結束 / 重新開啟；有跑壘資料的比賽比分自動計算，舊比賽仍可手動輸入 */}
      {canEdit && (
        <Card className="gap-3">
          <CardHeader><CardTitle>比賽</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!tracked && (
              <div className="flex items-center gap-2">
                <Input type="number" inputMode="numeric" min="0" className="w-20 text-center" value={ourScore} onChange={(e) => setOurScore(e.target.value)} aria-label="我方得分" />
                <span>:</span>
                <Input type="number" inputMode="numeric" min="0" className="w-20 text-center" value={oppScore} onChange={(e) => setOppScore(e.target.value)} aria-label={`${game.opponent} 得分`} />
                <span className="text-sm text-gray-500">我方 : {game.opponent}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {game.status === 'live' ? (
                <Button onClick={() => updateGame(tracked ? { status: 'final' } : { status: 'final', our_score: ourScore, opp_score: oppScore })}>
                  結束比賽
                </Button>
              ) : (
                <>
                  {!tracked && (
                    <Button variant="outline" onClick={() => updateGame({ our_score: ourScore, opp_score: oppScore })}>更新比分</Button>
                  )}
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
