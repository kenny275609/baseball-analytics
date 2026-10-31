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
  countPlateAppearances,
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
  movesOuts,
  nextTurn,
  outsInInning,
  runsByInning,
  sacrificeFlyError,
  standaloneLabel,
} from '@/lib/baserunning';
import {
  QueueItem,
  buildAtbatItem,
  buildPlayItem,
  clearBlock,
  isPendingId,
  mergePending,
  readQueue,
  removeItem,
  undoLatestPending,
} from '@/lib/offlineQueue';
import {
  addToQueue,
  isOnline,
  notifyChange,
  queueStorage,
  resetStatus,
  runSync,
  subscribe,
  usePendingQueue,
} from '@/lib/offlineSync';
import { UndoTarget, latestAction, sameTarget } from '@/lib/undo';

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

function nextState(atbats: Atbat[], events: RunnerEvent[], lineup: LineupSlot[]) {
  return nextTurn(atbats, events, lineup.map((l) => l.batting_order));
}

function playerLabel(p: PlayerRef | null) {
  if (!p) return '（已刪除）';
  return p.number ? `#${p.number} ${p.name}` : p.name;
}

function describeMove(e: RunnerEvent) {
  return `${e.players?.name ?? '?'} ${FROM_SHORT[e.from_base]}→${baseLabel(e.to_base)}`;
}

// 撤銷確認、未同步清單用的描述，例如「3 局 王小明 一壘安打（李四 一壘→三壘）」
function describeAtbat(a: Pick<Atbat, 'inning' | 'players'> & AtbatResultFields, events: RunnerEvent[]) {
  const moves = events.filter((e) => e.from_base > 0).map(describeMove);
  const inn = a.inning ? `${a.inning} 局 ` : '';
  const label = getResultOption(fieldsToResult(a))?.label ?? '打席';
  return `${inn}${a.players?.name ?? ''} ${label}${moves.length ? `（${moves.join('、')}）` : ''}`;
}

function describePlay(events: RunnerEvent[]) {
  const first = events[0];
  if (!first) return '跑壘事件';
  return `${first.inning} 局 ${standaloneLabel(first.event_type)}（${events.map(describeMove).join('、')}）`;
}

function describeTarget(target: UndoTarget, atbats: Atbat[], events: RunnerEvent[]) {
  if (target.kind === 'play') return describePlay(events.filter((e) => e.play_id === target.play_id));
  const atbat = atbats.find((a) => a.id === target.id);
  return atbat ? describeAtbat(atbat, events.filter((e) => e.atbat_id === atbat.id)) : '打席';
}

interface GameData {
  game: Game;
  lineup: LineupSlot[];
  atbats: Atbat[];
  runner_events: RunnerEvent[];
  innings: InningScore[];
}

function PendingTag() {
  return <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-normal text-amber-800">待同步</span>;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;
  const { canEdit, isAdmin } = useSession();

  const [game, setGame] = useState<Game | null>(null);
  const [lineup, setLineup] = useState<LineupSlot[]>([]);
  // 伺服器上的打席/跑壘；畫面顯示的 atbats / runnerEvents 另外加上還沒同步的離線紀錄
  const [serverAtbats, setAtbats] = useState<Atbat[]>([]);
  const [serverEvents, setRunnerEvents] = useState<RunnerEvent[]>([]);
  const { items: pending, status: syncStatus } = usePendingQueue(gameId);
  const [undoing, setUndoing] = useState(false);
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
    atbatsRef.current = serverAtbats;
    lineupRef.current = lineup;
    eventsRef.current = serverEvents;
  }, [serverAtbats, lineup, serverEvents]);

  // 伺服器資料 + 這支手機上還沒同步的紀錄（每次都重新讀佇列，拿最新的）
  const mergedNow = useCallback(
    () =>
      mergePending(atbatsRef.current, eventsRef.current, readQueue(queueStorage(), gameId)) as {
        atbats: Atbat[];
        events: RunnerEvent[];
      },
    [gameId]
  );

  const load = useCallback(
    async (advance: boolean): Promise<GameData | null> => {
      let data: GameData & { error?: string };
      try {
        const res = await fetch(`/api/games/get?id=${gameId}`);
        data = await res.json();
        if (!res.ok) {
          setError(data.error || '載入失敗');
          return null;
        }
      } catch {
        setError('網路連線失敗，無法載入最新資料');
        return null;
      }
      data.runner_events = data.runner_events ?? [];
      data.innings = data.innings ?? [];
      atbatsRef.current = data.atbats;
      eventsRef.current = data.runner_events;
      lineupRef.current = data.lineup;
      setGame(data.game);
      setLineup(data.lineup);
      setAtbats(data.atbats);
      setRunnerEvents(data.runner_events);
      setInnings(data.innings);
      setOurScore(data.game.our_score?.toString() ?? '');
      setOppScore(data.game.opp_score?.toString() ?? '');
      if (advance) {
        // 打開 App 時還有離線紀錄：打者與局數要接在離線紀錄後面
        const merged = mergePending(data.atbats, data.runner_events, readQueue(queueStorage(), gameId)) as {
          atbats: Atbat[];
          events: RunnerEvent[];
        };
        const next = nextState(merged.atbats, merged.events, data.lineup);
        setSlot(next.slot);
        setInning(next.inning);
      }
      return data;
    },
    [gameId]
  );

  // 離線紀錄同步成功：把伺服器回傳的打席/跑壘接上，取代畫面上的暫存版本
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type !== 'synced' || e.gameId !== gameId) return;
        if (e.item.kind === 'cancel') {
          const cancelled = e.item.clientId;
          const atbatIds = new Set(
            eventsRef.current.filter((ev) => ev.play_id === cancelled && ev.atbat_id).map((ev) => ev.atbat_id)
          );
          atbatsRef.current = atbatsRef.current.filter((a) => !atbatIds.has(a.id));
          eventsRef.current = eventsRef.current.filter((ev) => ev.play_id !== cancelled);
        } else {
          const atbat = e.data.atbat as Atbat | undefined;
          const created = (e.data.runner_events ?? []) as RunnerEvent[];
          if (atbat && !atbatsRef.current.some((a) => a.id === atbat.id)) {
            atbatsRef.current = [...atbatsRef.current, atbat];
          }
          const known = new Set(eventsRef.current.map((ev) => ev.id));
          eventsRef.current = [...eventsRef.current, ...created.filter((ev) => !known.has(ev.id))];
          if (typeof e.data.warning === 'string') setError(e.data.warning);
        }
        setAtbats(atbatsRef.current);
        setRunnerEvents(eventsRef.current);
      }),
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

  const { atbats, events: runnerEvents } = mergePending(serverAtbats, serverEvents, pending) as {
    atbats: Atbat[];
    events: RunnerEvent[];
  };
  const blockedItem = pending[0]?.error ? pending[0] : null;
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

  // 壘上有人：先逐一詢問跑者去向；壘上無人：打者落點依結果決定，直接記錄。
  // 壘上無人但結果的出局數和預設去向對不上（野選、雙殺…），或使用者要調整打者去向
  // （不死三振、安打趁傳多跑一個壘）時，也打開對話框；
  // 高飛犧牲打沒有跑者得分（例如壘上無人）也要打開，提示改記飛球接殺，不直接存成 SF
  const startSave = (adjust = false) => {
    if (!currentSlot || !draft.result) return;
    const moves = defaultMoves(
      draft.result,
      bases,
      { playerId: currentSlot.player_id, player: currentSlot.players },
      outsThisInning
    );
    const mismatch = movesOuts(moves) !== (getResultOption(draft.result)?.outs ?? 0);
    if (adjust || moves.length > 1 || mismatch || sacrificeFlyError(draft.result, moves)) {
      setError('');
      dialogSeq.current += 1;
      setRunnersDialog({ key: dialogSeq.current, moves });
    } else {
      saveAtbat(moves, autoRbi(draft.result, moves));
    }
  };

  // 每筆紀錄先排進這支手機的佇列再依序送出：
  //   - 有網路且沒有排隊中的紀錄：等伺服器結果，被拒絕就移除並在對話框顯示原因（和以前一樣）
  //   - 離線、網路中斷、或前面還有沒同步的紀錄：留在佇列，畫面先更新，連線後自動依序上傳
  // 回傳 false 表示伺服器拒絕，對話框保持開啟
  const submit = async (item: QueueItem): Promise<boolean> => {
    setSaving(true);
    setError('');
    try {
      const storage = queueStorage();
      const direct = readQueue(storage, gameId).length === 0 && isOnline();
      addToQueue(item);
      if (!direct) {
        void runSync(gameId);
        return true;
      }
      const result = await runSync(gameId);
      const stillQueued = readQueue(storage, gameId).some((i) => i.clientId === item.clientId);
      if (!stillQueued || result.status === 'offline' || result.status === 'busy') return true;
      removeItem(storage, gameId, item.clientId);
      resetStatus(gameId);
      notifyChange(gameId);
      setError('error' in result ? result.error : '儲存失敗');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAtbat = async (moves: RunnerMove[], rbi: number) => {
    if (!currentSlot || !draft.result) return;
    const item = buildAtbatItem({
      gameId,
      playerId: currentSlot.player_id,
      player: currentSlot.players,
      battingOrder: slot,
      inning,
      result: draft.result,
      quality: draft.quality,
      rbi,
      hitX: draft.hitX,
      hitY: draft.hitY,
      note: draft.note,
      moves,
      label: '',
    });
    item.label = describeAtbat(item.preview.atbat, item.preview.events);
    if (!(await submit(item))) return;
    // 以最新的伺服器資料 + 佇列推進打者，避免過期閉包
    const merged = mergedNow();
    const next = nextState(merged.atbats, merged.events, lineupRef.current);
    setSlot(next.slot);
    setInning(next.inning);
    setDraft(EMPTY_DRAFT);
    setRunnersDialog(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveStandalone = async (type: RunnerEventType, moves: RunnerMove[]) => {
    const item = buildPlayItem({ gameId, inning, type, moves, label: '' });
    item.label = describePlay(item.preview.events);
    if (!(await submit(item))) return;
    // 牽制等跑壘事件造成第三個出局就換局（打者不變）
    const merged = mergedNow();
    setInning(nextState(merged.atbats, merged.events, lineupRef.current).inning);
    setStandaloneKey(null);
  };

  // 撤銷上一步：
  //   還有沒同步的紀錄 → 撤銷這支手機上最後一筆（不用網路）
  //   否則先重新載入，以伺服器上真正最後一筆為準（可能是其他手機記的），確認後請伺服器刪除
  const undoLast = async () => {
    if (undoing || saving) return;
    setError('');
    const storage = queueStorage();
    const queue = readQueue(storage, gameId);
    if (queue.length > 0) {
      const target = [...queue].reverse().find((i) => i.kind !== 'cancel');
      if (!target) {
        setError('還有撤銷動作等待上傳，請連上網路同步完成後再撤銷');
        return;
      }
      if (!window.confirm(`撤銷上一步（尚未同步）：\n${target.label}\n\n壘包、出局數與比分會回到這筆之前的狀態。`)) return;
      const result = undoLatestPending(storage, gameId);
      resetStatus(gameId);
      notifyChange(gameId);
      if (result.kind === 'cancelQueued') void runSync(gameId);
      const merged = mergedNow();
      const next = nextState(merged.atbats, merged.events, lineupRef.current);
      if (target.kind === 'atbat') setSlot(next.slot);
      setInning(next.inning);
      return;
    }
    if (!isOnline()) {
      setError('目前離線，只能撤銷尚未同步的紀錄；伺服器上的紀錄請連線後再撤銷');
      return;
    }
    setUndoing(true);
    try {
      const before = latestAction(atbatsRef.current, eventsRef.current);
      const data = await load(false);
      if (!data) return;
      const target = latestAction(data.atbats, data.runner_events);
      if (!target) {
        setError('沒有可撤銷的紀錄');
        return;
      }
      const other = sameTarget(before, target) ? '' : '\n（這筆是其他裝置剛記錄的，畫面已更新）';
      const desc = describeTarget(target, data.atbats, data.runner_events);
      if (!window.confirm(`撤銷上一步：\n${desc}${other}\n\n壘包、出局數與比分會回到這筆之前的狀態。`)) return;
      const request = target.kind === 'atbat' ? { kind: 'atbat', id: target.id } : { kind: 'play', play_id: target.play_id };
      const res = await fetch('/api/games/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, target: request }),
      });
      const result = await res.json().catch(() => ({}));
      const fresh = await load(false);
      if (!res.ok) {
        setError(result.error || '撤銷失敗');
        return;
      }
      if (fresh) {
        const next = nextState(fresh.atbats, fresh.runner_events, fresh.lineup);
        if (target.kind === 'atbat') setSlot(next.slot);
        setInning(next.inning);
      }
    } catch {
      setError('撤銷失敗，請檢查網路後再試');
    } finally {
      setUndoing(false);
    }
  };

  // 同步被伺服器拒絕：重試或捨棄這筆
  const retryBlocked = () => {
    setError('');
    clearBlock(queueStorage(), gameId);
    notifyChange(gameId);
    void runSync(gameId);
  };

  const discardBlocked = async () => {
    if (!blockedItem) return;
    if (!window.confirm(`捨棄這筆尚未同步的紀錄？\n${blockedItem.label}\n\n捨棄後無法復原，需要的話請重新記錄。`)) return;
    removeItem(queueStorage(), gameId, blockedItem.clientId);
    resetStatus(gameId);
    notifyChange(gameId);
    // 通常是其他裝置也記錄過，先載入伺服器最新資料，再繼續同步後面的紀錄
    await load(false);
    const merged = mergedNow();
    const next = nextState(merged.atbats, merged.events, lineupRef.current);
    setSlot(next.slot);
    setInning(next.inning);
    void runSync(gameId);
  };

  const deleteAtbat = async (atbat: Atbat) => {
    const label = getResultOption(fieldsToResult(atbat))?.label ?? '';
    if (deletingId) return;
    // 這個打席之後還有記錄的非打擊跑壘（牽制、投手犯規…）不會一起刪除，先提醒
    const laterPlays = eventsRef.current.some((e) => !e.atbat_id && e.created_at > atbat.created_at);
    const note = laterPlays ? '\n之後記錄的牽制等跑壘事件不會一起刪除，請一併確認。' : '';
    if (!window.confirm(`刪除 ${atbat.players?.name ?? ''} 的「${label}」？這個打席的跑壘紀錄會一起刪除。${note}`)) return;
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
      // 刪除前的 laterPlays 可能已過期，用最新的事件重新判斷
      const hasLaterPlays = remainingEvents.some((e) => !e.atbat_id && e.created_at > atbat.created_at);
      atbatsRef.current = remaining;
      eventsRef.current = remainingEvents;
      setAtbats((prev) => prev.filter((a) => a.id !== atbat.id));
      setRunnerEvents((prev) => prev.filter((e) => e.atbat_id !== atbat.id));
      if (isLast) {
        // 刪掉最後一筆＝復原，打者跟著退回，壘包由剩下的跑壘事件重新推算
        if (atbat.batting_order) setSlot(atbat.batting_order);
        // 之後還有非打擊跑壘時，局數依剩下的紀錄推算，不直接退回這個打席的局數
        if (hasLaterPlays) setInning(nextState(remaining, remainingEvents, lineupRef.current).inning);
        else if (atbat.inning) setInning(atbat.inning);
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

  // 逐局連續輸入時依序送出，避免兩個請求同時重算比分、後讀先寫
  const oppQueue = useRef<Promise<unknown>>(Promise.resolve());
  const saveOppRuns = (inn: number, value: string): Promise<boolean> => {
    const run = async () => {
      setError('');
      try {
        const res = await fetch('/api/games/innings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game_id: gameId, inning: inn, opp_runs: value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || '更新對手得分失敗');
          return false;
        }
      } catch {
        setError('更新對手得分失敗');
        return false;
      }
      setInnings((prev) => {
        const rest = prev.filter((i) => i.inning !== inn);
        return value === '' ? rest : [...rest, { inning: inn, opp_runs: Number(value) }];
      });
      return true;
    };
    const result = oppQueue.current.then(run);
    oppQueue.current = result;
    return result;
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
  const tracked = isTracked(atbats, runnerEvents);
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

      {/* 離線紀錄：還沒上傳到伺服器的筆數與同步狀態 */}
      {blockedItem ? (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-semibold">同步已暫停：有 {pending.length} 筆紀錄還沒上傳</div>
          <div>
            「{blockedItem.label}」被伺服器拒絕：{blockedItem.error}
          </div>
          <div className="text-xs text-red-700">
            {pending.length > 1 ? `後面還有 ${pending.length - 1} 筆在等待，這筆處理好之前不會上傳。` : ''}
            常見原因是其他裝置在這段時間也記錄了這場比賽。可以「捨棄這筆」後依最新畫面重新記錄，或稍後按「重試」。
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-10 bg-white" onClick={retryBlocked}>重試</Button>
            <Button size="sm" variant="destructive" className="h-10" onClick={discardBlocked}>捨棄這筆</Button>
          </div>
        </div>
      ) : (
        pending.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">有 {pending.length} 筆紀錄只存在這支手機，尚未同步</div>
              <div className="text-xs">
                {'state' in syncStatus && syncStatus.state === 'syncing'
                  ? '正在上傳…'
                  : 'status' in syncStatus && syncStatus.status === 'retry'
                    ? `暫時無法上傳：${syncStatus.error}；稍後會自動重試`
                    : '恢復連線後會自動依序上傳，請先不要清除瀏覽器資料'}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-10 shrink-0 bg-white"
              disabled={'state' in syncStatus && syncStatus.state === 'syncing'}
              onClick={() => void runSync(gameId)}
            >
              立即同步
            </Button>
          </div>
        )
      )}

      {/* 壘包 + 記分板 */}
      <Card className="gap-3">
        <CardContent className="space-y-3">
          {game.status === 'live' && (
            // 窄螢幕（375px）放不下並排，局數與跑壘事件按鈕換到壘包下方一列
            <div className="flex flex-wrap items-center justify-center sm:justify-between gap-x-2 gap-y-3">
              <BaseDiamond bases={bases} outs={Math.min(3, outsThisInning)} />
              <div className="flex basis-full sm:basis-auto flex-wrap sm:flex-col items-center justify-center gap-3">
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={!hasRunners || saving || undoing}
                      onClick={() => {
                        setError('');
                        dialogSeq.current += 1;
                        setStandaloneKey(dialogSeq.current);
                      }}
                    >
                      跑壘事件…
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={saving || undoing || (atbats.length === 0 && runnerEvents.length === 0)}
                      onClick={undoLast}
                    >
                      {undoing ? '撤銷中…' : '撤銷上一步'}
                    </Button>
                  </div>
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
          {canEdit && (
            <p className="text-xs text-gray-500">
              {tracked
                ? '對手每局得分直接在記分板輸入；我方得分由跑壘紀錄自動計算。'
                : '這場比賽有沒有跑壘紀錄的舊打席，我方比分請在下方手動輸入。'}
            </p>
          )}
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
          <div className="max-w-2xl mx-auto flex gap-2">
            {!hasRunners && draft.result && (
              // 壘上無人時預設直接記錄；不死三振、安打趁傳多跑一個壘等情況從這裡調整打者去向
              <Button
                variant="outline"
                className="h-12 shrink-0 px-3"
                onClick={() => startSave(true)}
                disabled={!currentSlot || saving}
              >
                調整去向
              </Button>
            )}
            <Button className="flex-1 min-w-0 h-12 text-base" onClick={() => startSave()} disabled={!draft.result || !currentSlot || saving}>
              <span className="truncate">
                {saving
                  ? '儲存中...'
                  : draft.result
                    ? hasRunners
                      ? `下一步：跑者去向（${draftLabel}）`
                      : `記錄：${currentSlot?.players?.name ?? ''} ${draftLabel}`
                    : '請選擇打席結果'}
              </span>
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
          error={error}
          onConfirm={saveAtbat}
          onSwitchToFlyout={() => {
            setDraft({ ...draft, result: 'flyout' });
            setRunnersDialog(null);
          }}
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
          error={error}
          onConfirm={saveStandalone}
        />
      )}

      {/* 打席紀錄 */}
      <Card className="gap-3">
        <CardHeader><CardTitle>打席紀錄（{countPlateAppearances(atbats)}）</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {atbats.length === 0 && plays.size === 0 && <p className="text-sm text-gray-500">尚無打席</p>}
          {logInnings.map((inn) => (
            <div key={inn}>
              <div className="text-xs font-semibold text-gray-500 mb-1">{inn ? `${inn} 局` : '未標局數'}</div>
              <ul className="divide-y rounded-md border">
                {byInning.get(inn)!.map((item) => {
                  if (item.kind === 'play') {
                    const label = standaloneLabel(item.events[0].event_type);
                    const unsynced = isPendingId(item.events[0].id);
                    return (
                      <li key={item.playId} className="flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm bg-gray-50">
                        <span className="w-4 shrink-0 text-gray-400">·</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">
                            {label}
                            {unsynced && <PendingTag />}
                          </span>
                          <span className="block text-xs text-gray-600">{item.events.map(describeMove).join('、')}</span>
                        </span>
                        {canEdit && !unsynced && (
                          <Button variant="ghost" size="sm" className="px-2 text-red-600" disabled={deletingId !== null || pending.length > 0} onClick={() => deletePlay(item.playId, label)}>
                            {deletingId === item.playId ? '刪除中' : '刪除'}
                          </Button>
                        )}
                      </li>
                    );
                  }
                  const a = item.atbat;
                  const option = getResultOption(fieldsToResult(a));
                  const runnerMoves = (eventsByAtbat.get(a.id) ?? []).filter((e) => e.from_base > 0);
                  const unsynced = isPendingId(a.id);
                  return (
                    <li key={a.id} className="flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm">
                      <span className="w-4 shrink-0 text-gray-400">{a.batting_order ?? ''}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{a.players?.name}</span>
                        <span className="block text-xs">
                          <span className="font-semibold">{option?.label ?? '-'}</span>
                          {a.rbi > 0 && <span className="text-red-600 ml-1">{a.rbi} 打點</span>}
                          {unsynced && <PendingTag />}
                        </span>
                        {runnerMoves.length > 0 && (
                          <span className="block text-xs text-gray-600">{runnerMoves.map(describeMove).join('、')}</span>
                        )}
                      </span>
                      {canEdit && !unsynced && (
                        <>
                          <Link href={`/record/${a.player_id}/edit/${a.id}`}>
                            <Button variant="ghost" size="sm" className="px-2">編輯</Button>
                          </Link>
                          {/* 還有沒同步的紀錄時先不刪伺服器上的舊紀錄，否則排隊中的紀錄會和壘包對不上 */}
                          <Button variant="ghost" size="sm" className="px-2 text-red-600" disabled={deletingId !== null || pending.length > 0} onClick={() => deleteAtbat(a)}>
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
